# Engine Parity Stage 2 (Darkness and Time) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the native engine structured effects, variables, seeded randomness, daemons, fuses, darkness, death, endings and VERBOSE/BRIEF, and prove them with Zork I's first underground rooms matching the original.

**Architecture:**
- **Events** become lists of strings and typed effects, run by `effects.ts`.
- **After each acted-on turn,** `time.ts` runs fuses, then daemons (ambient included).
- **`light.ts`** decides whether the current room is lit, and narrows sight to the inventory when it isn't.
- **`death.ts` and `endings.ts`** handle the two ways play stops.
- **All new state is optional**, so saves stay format 2.0.

**Tech Stack:** Vue 3, TypeScript 6, Vitest 5, Express 5 intent server, ifvms (differential harness).

**Spec:** `docs/superpowers/specs/2026-10-05-engine-parity-stage-2-design.md`

## Global Constraints

- The engine never branches on a world's IDs.
- An engine miss never mutates state; randomness is drawn only inside effects.
- The LLM only classifies; new built-in verbs go in the parser, `BUILT_IN_WORDS`, the dispatcher (with HELP) and `ACTION_VOCAB`.
- Conditions are parsed only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Existing worlds keep working: the tutorial, fixture and Office Space tests pass with no world changes (Office Space: no world edits at all).
- New `GameState` fields are optional; `SAVE_VERSION` stays `'2.0'`.
- Curly quotes and apostrophes in player-facing text.
- Coverage: 80% lines/functions/statements, 75% branches.
- Checks before each commit: `npm run lint && npm run type-check && npx vitest run`; server changes also `cd server && npm run lint && npm run type-check && npm test`.

## Review Focus

1. A `die` effect in the middle of an event list: later steps are skipped, and a final death sets `gameOver` before daemons run.
2. Taking a lit lamp out of a dark room, or dropping it there: the light-change line appears once, in the right direction.
3. A fuse scheduled by a daemon in the same turn: it doesn't fire that turn (counts start next turn).
4. A dark-room TAKE of something that is really there: understood, unchanged state, and no LLM retry.
5. Scatter with an empty or missing `scatter` list, or a `home` naming a missing room: items stay where the player died, nothing throws.

Each has a test in its owning task (Tasks 4, 3, 2, 3 and 4).

> **Ruling (finale):** the spec says the finale is rewritten into `instead.smash` rules plus an ending. Rules can't express its one-shot `bareHanded` plus `bareHandedAgain` without a new condition, so `handleSmash` keeps its finale branch (wrongRoom, bareHanded), and only the winning path goes through the endings machinery (`runEnding('finale')`), with identical output. Cost if wrong: one dedicated branch stays.

---

### Task 1: Structured effects, variables, randomness, conditional scoring

**Files:**
- Create: `src/engine/effects.ts`, `src/engine/rng.ts`, `tests/engine/effects.test.ts`, `tests/engine/rng.test.ts`
- Modify: `src/types/world.ts`, `src/types/game.ts`, `src/engine/rules.ts` (`runEvent` delegates; bracket parsing moves to effects.ts), `src/engine/conditions.ts` (`var:`, `carrying`), `src/engine/verbs/meta.ts` (score), `src/engine/engine.ts` (`initialState` seeds `vars` and `rng`)

**Interfaces (produces):**

```ts
// world.ts
export type Effect = /* exactly as in the spec, plus { say: string } */;
export type EventStep = string | Effect;
export type EventScripts = Record<string, EventStep[]>;
export interface ScoreEntry { flag?: string; if?: string; points: number }   // one of flag/if
// World gains:
vars?: Record<string, number>;
seed?: number;
// game.ts GameState gains:
vars?: Record<string, number>;
rng?: number;
// effects.ts
export interface StepContext { world: World; state: GameState }
export function runSteps(steps: EventStep[], world: World, state: GameState): string[];
export function runEventKey(key: string, world: World, state: GameState): string[];   // records firedEvents
export function isEffectLine(line: string): boolean;
// rng.ts
export function nextRandom(state: GameState): number;   // [0,1), advances state.rng (mulberry32)
export function seedFor(world: World): number;          // world.seed ?? Date.now() >>> 0
// conditions: var:NAME<op>N, carrying<op>N
// meta.ts: score = flag/if entries + (state.vars?.score ?? 0)
```

`rules.ts` `runEvent(key, world, state)` becomes `return runEventKey(key, world, state)`; `applyEventEffects` is removed (bracket lines are handled step by step inside `runSteps`).

`die`, `end`, `go`, `schedule` and `cancel` are stubbed in Task 1 (`go` moves via `enterRoom`; `schedule` and `cancel` write `state.fuses`; `die` and `end` set `gameOver` and print the text). Tasks 2, 4 and 5 replace those stubs.

- [ ] **Step 1: Failing tests**

`tests/engine/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextRandom } from '@/engine/rng';
import type { GameState } from '@/types/game';
const s = (rng: number) => ({ rng }) as unknown as GameState;
describe('rng', () => {
  it('the same seed gives the same sequence, and advances the state', () => {
    const a = s(42), b = s(42);
    const seqA = [nextRandom(a), nextRandom(a), nextRandom(a)];
    expect([nextRandom(b), nextRandom(b), nextRandom(b)]).toEqual(seqA);
    expect(a.rng).not.toBe(42);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});
```

`tests/engine/effects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import { evaluateCondition } from '@/engine/conditions';
import { execute } from '@/engine/engine';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('effects', () => {
  it('prints strings and applies bracket lines, as before', () => {
    const s = stateWith(world);
    expect(runSteps(['Hello.', '[Flag set: Paid]'], world, s)).toEqual(['Hello.', '[Flag set: Paid]']);
    expect(s.flags.paid).toBe(true);
  });

  it('sets and clears flags, moves items, opens/locks/switches things, all silently', () => {
    const s = stateWith(world);
    expect(runSteps([{ set: 'paid' }, { move: 'coin', to: 'player' }, { switch: 'lamp', on: true }, { unlock: 'chest' }, { open: 'chest' }], world, s)).toEqual([]);
    expect(s.flags.paid).toBe(true);
    expect(s.locations.coin).toBe('player');
    expect(s.itemState.lamp.on).toBe(true);
    expect(s.itemState.chest).toEqual({ locked: false, open: true });
    runSteps([{ clear: 'paid' }, { close: 'chest' }, { lock: 'chest' }], world, s);
    expect(s.flags.paid).toBe(false);
    expect(s.itemState.chest).toEqual({ locked: true, open: false });
  });

  it('variables, score, and conditions on them', () => {
    const s = stateWith(world);
    runSteps([{ setVar: 'fuel', to: 10 }, { add: 'fuel', by: -3 }, { score: -10 }], world, s);
    expect(s.vars).toEqual({ fuel: 7, score: -10 });
    expect(evaluateCondition('var:fuel=7', s, world)).toBe(true);
    expect(evaluateCondition('var:fuel<=6', s, world)).toBe(false);
    expect(evaluateCondition('var:nothing=0', s, world)).toBe(true);
    expect(evaluateCondition('carrying<=0', s, world)).toBe(true);
  });

  it('chance draws from the seeded generator: same seed, same branch', () => {
    const pick = (seed: number) => {
      const s = stateWith(world);
      s.rng = seed;
      return runSteps([{ chance: 50, then: ['heads'], else: ['tails'] }], world, s);
    };
    expect(pick(7)).toEqual(pick(7));
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => pick(n)[0]));
    expect(seen).toEqual(new Set(['heads', 'tails']));
  });

  it('run inlines another event; go moves the player and describes the room', () => {
    const s = stateWith(world, { room: 'living' });
    const lines = runSteps([{ run: 'take_key' }, { go: 'bedroom' }], world, s);
    expect(lines[0]).toBe('📎 The key is cold.');
    expect(s.currentRoom).toBe('bedroom');
    expect(lines).toContain('📍 Bedroom');
  });

  it('a score entry can be a condition, counting while it holds', () => {
    const w = { ...world, scoring: [...(world.scoring ?? []), { if: 'inside:coin:shelf', points: 6 }] };
    const s = stateWith(w);
    const score = () => execute({ action: 'score' }, { world: w, state: s }).lines[0];
    expect(score()).toContain('Score: 0 of 46');
    s.locations.coin = 'shelf';
    expect(score()).toContain('Score: 6 of 46');
  });
});
```

(The fixture's existing max is 40; adjust `46` to the fixture's sum plus 6 if the fixture changes.)

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run tests/engine/rng.test.ts tests/engine/effects.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`rng.ts` (mulberry32):

```ts
export function nextRandom(state: GameState): number {
  let t = ((state.rng ?? 1) + 0x6d2b79f5) >>> 0;
  state.rng = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const seedFor = (world: World): number => (world.seed ?? Date.now()) >>> 0;
```

`effects.ts`:
- `runSteps` walks the steps.
- A string is pushed unless it's an effect line in infocom style; the bracket effect is applied either way, with the code moved from `rules.ts` `applyEventEffects`.
- An object is dispatched on its key.
- `chance` uses `nextRandom(state) * 100 < chance`.
- `run` calls `runEventKey`.
- `go` calls `enterRoom` from `verbs/movement.ts`. The import is acyclic: movement imports rules, and rules imports effects. If a cycle appears, `go` takes `enterRoom` through a small registry `setEnterRoom(fn)` set by `engine.ts`.
- `die` and `end` are stubs in this task: print the text, set `gameOver`, and stop processing further steps.
- `runEventKey` records `firedEvents`, then `runSteps(world.events[key] ?? [], …)`.

`conditions.ts`: before the `:` split, match `/^(var:(\w+)|carrying)\s*(<=|>=|=|<|>)\s*(-?\d+)$/` on the body.

`meta.ts` `scoreLines`:
- `score` sums `entry.flag ? flags[flag] : evaluateCondition(entry.if!, state, world)`, plus `state.vars?.score ?? 0`.
- `max` sums the positive `points`, or uses `world.maxScore`.

`initialState`: `vars: { ...(world.vars ?? {}) }`, `rng: seedFor(world)`.

Type fallout: anywhere that reads `world.events[k]` as `string[]` (the intro in `openingLines`, the finale) uses `runSteps`/`runEventKey`. `openingLines` becomes `runSteps(world.events.intro ?? [], world, state)`.

- [ ] **Step 4: Run everything**

Run: `npm run type-check && npx vitest run 2>&1 | tail -4`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src tests && git commit -m "Structured effects, variables, seeded randomness, conditional scoring"
```

---

### Task 2: Daemons, fuses and the after-turn sequence

**Files:**
- Create: `src/engine/time.ts`, `tests/engine/time.test.ts`
- Modify: `src/types/world.ts` (`daemons`), `src/types/game.ts` (`fuses`), `src/engine/engine.ts` (`execute` calls `afterTurn`), `src/engine/effects.ts` (real `schedule`/`cancel`)

**Interfaces:**

```ts
// world.ts World gains
daemons?: Array<{ if: string; then: string | EventStep[] }>;
// game.ts
fuses?: Record<string, number>;
// time.ts
export function afterTurn(world: World, state: GameState): string[];  // fuses, then daemons (ambient as daemons)
```

`schedule` sets `fuses[key] = n`, so it fires after `n` acted-on turns. A fuse scheduled during turn T counts down first at the end of turn T+1. `afterTurn` must therefore not decrement fuses created during this same `execute`; track them by snapshotting the fuse keys before dispatch.

- [ ] **Step 1: Failing tests** (`tests/engine/time.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const world: World = {
  ...fixtureWorld,
  vars: { ticks: 0 },
  daemons: [
    { if: 'in:bedroom', then: [{ add: 'ticks', by: 1 }] },
    { if: 'var:ticks=2', then: ['Two ticks.'] },
  ],
  events: {
    ...fixtureWorld.events,
    alarm_bell: ['🔔 Ring!'],
    start_timer: [{ schedule: 'alarm_bell', in: 2 }],
  },
  items: {
    ...fixtureWorld.items,
    bed: { ...fixtureWorld.items.bed, onUse: [{ then: 'start_timer' }] },
  },
};
const run = (s: ReturnType<typeof stateWith>, action: string, target?: string) => execute(target ? { action, target } : { action }, { world, state: s });

describe('daemons and fuses', () => {
  it('daemons run after each acted-on turn, in order, when their condition holds', () => {
    const s = stateWith(world);
    run(s, 'look');
    expect(s.vars?.ticks).toBe(1);
    expect(run(s, 'look').lines).toContain('Two ticks.');
  });

  it('nothing runs on a miss', () => {
    const s = stateWith(world);
    const before = structuredClone(s);
    expect(run(s, 'take', 'unicorn').understood).toBe(false);
    expect(s).toEqual(before);
  });

  it('a fuse fires after its count of acted-on turns, not the turn it was set', () => {
    const s = stateWith(world, { room: 'living' });
    s.currentRoom = 'bedroom';
    expect(run(s, 'use', 'bed').lines).not.toContain('🔔 Ring!');
    expect(run(s, 'look').lines).not.toContain('🔔 Ring!');
    expect(run(s, 'look').lines).toContain('🔔 Ring!');
    expect(s.fuses?.alarm_bell).toBeUndefined();
  });

  it('cancel removes a pending fuse', () => {
    const s = stateWith(world);
    s.fuses = { alarm_bell: 2 }; // fuses count down to 1 first, then the daemon cancels it
    execute({ action: 'look' }, { world: { ...world, daemons: [{ if: 'in:bedroom', then: [{ cancel: 'alarm_bell' }] }] }, state: s });
    expect(s.fuses?.alarm_bell).toBeUndefined();
  });

  it('ambient lines still work, as daemons', () => {
    const s = stateWith(fixtureWorld, { room: 'yard' });
    execute({ action: 'look' }, { world: fixtureWorld, state: s });
    expect(execute({ action: 'look' }, { world: fixtureWorld, state: s }).lines).toContain('A dog barks.');
  });
});
```


- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run tests/engine/time.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`time.ts`:

```ts
export function afterTurn(world: World, state: GameState, preexisting: Set<string>): string[] {
  const out: string[] = [];
  for (const [key, left] of Object.entries(state.fuses ?? {})) {
    if (!preexisting.has(key)) continue;
    if (left <= 1) { delete state.fuses![key]; out.push(...runEventKey(key, world, state)); }
    else state.fuses![key] = left - 1;
    if (state.gameOver) return out;
  }
  for (const d of world.daemons ?? []) {
    if (!evaluateCondition(d.if, state, world)) continue;
    out.push(...(typeof d.then === 'string' ? runEventKey(d.then, world, state) : runSteps(d.then, world, state)));
    if (state.gameOver) return out;
  }
  out.push(...ambientLines(world, state));
  return out;
}
```

`ambientLines` moves here from `engine.ts`. `execute` snapshots `new Set(Object.keys(state.fuses ?? {}))` before dispatch, and after `turns += 1` appends `afterTurn(world, state, snapshot)`. `mutated` is true whenever `afterTurn` returned lines or changed state (compare `JSON.stringify` of `vars`/`fuses`/`flags` before and after, or simply mark mutated whenever daemons or fuses exist and any ran).

- [ ] **Step 4: Run everything; Step 5: Commit** `"Daemons, fuses and the after-turn sequence"`.

---

### Task 3: Light and darkness

**Files:**
- Create: `src/engine/light.ts`, `tests/engine/light.test.ts`
- Modify: `src/types/world.ts` (`Room.dark`, `World.darkness`), `src/engine/model.ts` (visible/reachable narrowed in the dark), `src/engine/describe.ts` (dark description), `src/engine/verbs/*` (too-dark refusals), `src/engine/verbs/movement.ts` (blunder), `src/engine/engine.ts` (light-change lines), `src/engine/conditions.ts` (`lit:`), `src/stores/game.ts` (dark context), `tests/fixtures/world.ts`

**Interfaces:**

```ts
// world.ts
Room.dark?: boolean;
World.darkness?: { look?: string; tooDark?: string; fall?: string; blunder?: EventStep[] };
// light.ts
export function isLit(world: World, state: GameState, roomId?: string): boolean;
export function tooDark(world: World): string;   // world.darkness?.tooDark ?? 'It’s too dark to see.'
```

`isLit`:
- not dark → true;
- otherwise true if some item with `light && itemState.on` is in the visible set computed **ignoring darkness**.

Use an internal `visibleIgnoringDark` from `model.ts`. That's the old `visibleItems` renamed `sightLines`, so `light.ts` doesn't recurse into itself.

In the dark, `visibleItems` and `reachableItems` are the inventory tree only.

**Too-dark refusals.** A verb whose target isn't found while the room is dark, and which would otherwise miss, returns `ok([tooDark(world)])`, understood and unchanged. This applies to TAKE, EXAMINE, OPEN, CLOSE, LOCK, UNLOCK, READ, SEARCH, PUT, USE, SMASH, GIVE, TALK and world verbs with a target. Implement it once: in `engine.ts` `execute`, after dispatch, `if (result.understood === false && !isLit(world, state) && action.target && action.action !== 'go') return ok([tooDark(world)])`.

**Blundering.** In `handleGo`, when no exit matches, the room is dark, and `world.darkness?.blunder` is set: `return ok(runSteps(world.darkness.blunder, world, state), true)`.

**Light changes.** `execute` records `const wasLit = isLit(...)` and the room before dispatch. After dispatch and `afterTurn`, if the room is unchanged and `wasLit !== isLit(now)`:
- becoming dark appends `world.darkness?.fall ?? 'It is now pitch black.'`;
- becoming lit appends `describeRoom(...)`.

**Description.** `describeRoom` in a dark, unlit room returns `['📍 ' + name? …]`: Zork prints only the darkness line, without the room name. So the dark description is `[world.darkness?.look ?? 'It is pitch black.']`. In brass style it also leads with `📍 Darkness`.

**Intent context.** In the dark, `buildContext` gets `visibleItems` = inventory only; the store passes `isLit` into it.

Fixture: add a `cellar` room (`dark: true`, `exits: { up: 'shed' }`, items `['barrel']`), a `barrel` item, a `down: 'cellar'` exit in the shed, `lamp.light = true`, and `darkness: { look: 'It is pitch black.', blunder: [{ chance: 100, then: ['You trip in the dark.'] }] }`.

- [ ] **Step 1: Failing tests** (`tests/engine/light.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { isLit } from '@/engine/light';
import { evaluateCondition } from '@/engine/conditions';
import type { GameState } from '@/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (s: GameState, action: string, target?: string) => execute(target ? { action, target } : { action }, { world, state: s });
const cellar = (carrying: string[] = []) => stateWith(world, { room: 'cellar', carrying });

describe('darkness', () => {
  it('a dark room is lit only by a light that’s on and visible', () => {
    const s = cellar(['lamp']);
    expect(isLit(world, s)).toBe(false);
    s.itemState.lamp = { on: true };
    expect(isLit(world, s)).toBe(true);
    s.locations.jar = 'cellar'; s.locations.lamp = 'jar'; s.itemState.jar = { open: false };
    expect(isLit(world, s)).toBe(true); // the jar is transparent
  });

  it('in the dark, LOOK shows the darkness line and nothing else of the room', () => {
    expect(run(cellar(), 'look').lines).toEqual(['📍 Darkness', 'It is pitch black.']);
  });

  it('a dark-room TAKE of something really there is understood and changes nothing', () => {
    const s = cellar();
    const before = structuredClone(s);
    const r = run(s, 'take', 'barrel');
    expect(r.lines).toEqual(['It’s too dark to see.']);
    expect(r.understood).not.toBe(false);
    expect({ ...s, turns: 0 }).toEqual({ ...before, turns: 0 });
  });

  it('inventory and carried things still work in the dark', () => {
    const s = cellar(['lamp']);
    expect(run(s, 'inventory').lines[0]).toBe('You are carrying:');
    expect(run(s, 'turn_on', 'lamp').lines).toContain('The lamp is now on.');
  });

  it('light arriving or leaving says so, once', () => {
    const s = cellar(['lamp']);
    const on = run(s, 'turn_on', 'lamp').lines;
    expect(on).toContain('A damp cellar.');
    const off = run(s, 'turn_off', 'lamp').lines;
    expect(off).toEqual(['The lamp is now off.', 'It is now pitch black.']);
  });

  it('blundering in the dark runs the world’s blunder steps; real exits still work', () => {
    const s = cellar();
    expect(run(s, 'go', 'north').lines).toEqual(['You trip in the dark.']);
    run(s, 'go', 'up');
    expect(s.currentRoom).toBe('shed');
  });

  it('lit:here is a condition', () => {
    expect(evaluateCondition('lit:here', cellar(), world)).toBe(false);
  });
});
```


- [ ] **Step 2: See it fail; Step 3: Implement (as above); Step 4: Run everything.** Also add `take barrel` in the cellar to the engine-hooks miss-invariant list, as an understood refusal: assert `understood !== false` and unchanged state in a separate `it`.

- [ ] **Step 5: Commit** `"Light and darkness"`.

---

### Task 4: Death and resurrection

**Files:**
- Create: `src/engine/death.ts`, `tests/engine/death.test.ts`
- Modify: `src/types/world.ts` (`World.death`, `Item.home`), `src/engine/effects.ts` (`die` calls `die()`), `tests/fixtures/world.ts`

**Interfaces:**

```ts
export function die(cause: string, world: World, state: GameState): string[];
```

Sequence (the spec's):
1. print the cause and `message`;
2. `vars.score += penalty`;
3. if `deaths >= lives`, print `final`, set `gameOver`, return;
4. otherwise `deaths += 1`; carried items go to their `home` (if it's a room in the world), else to a random `scatter` room (via `nextRandom`), else stay in the death room;
5. clear `fuses`;
6. print `resurrection`;
7. `go` to `respawn` (if it's set and a room exists).

With no `death` block: print the cause and set `gameOver`. `runSteps` stops after a `die` step.

Fixture: `death: { message: ['**** You have died ****'], penalty: -10, lives: 1, respawn: 'bedroom', resurrection: ['You wake up.'], scatter: ['yard', 'living'], final: ['That’s it.'] }`; `lamp.home = 'shed'`; events `fall_down: [{ die: 'You fall.' }, 'never printed']`.

- [ ] **Step 1: Failing tests** (`tests/engine/death.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('death', () => {
  it('dies, pays the penalty, sends things home or scatters them, and respawns', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['lamp', 'wallet', 'key'] });
    s.rng = 123;
    s.fuses = { something: 3 };
    const lines = runSteps([{ run: 'fall_down' }], world, s);
    expect(lines.slice(0, 2)).toEqual(['You fall.', '**** You have died ****']);
    expect(lines).toContain('You wake up.');
    expect(lines).not.toContain('never printed');
    expect(s.currentRoom).toBe('bedroom');
    expect(s.vars?.score).toBe(-10);
    expect(s.vars?.deaths).toBe(1);
    expect(s.locations.lamp).toBe('shed');
    expect(['yard', 'living']).toContain(s.locations.wallet);
    expect(s.fuses).toEqual({});
    expect(s.gameOver).toBe(false);
  });

  it('the same seed scatters the same way', () => {
    const place = () => {
      const s = stateWith(world, { carrying: ['wallet', 'key', 'bat'] }); s.rng = 99;
      runSteps([{ die: 'x' }], world, s);
      return ['wallet', 'key', 'bat'].map((id) => s.locations[id]);
    };
    expect(place()).toEqual(place());
  });

  it('the last life ends the game', () => {
    const s = stateWith(world); s.vars = { deaths: 1 };
    const lines = runSteps([{ die: 'Again.' }], world, s);
    expect(lines).toContain('That’s it.');
    expect(s.gameOver).toBe(true);
  });

  it('without a death block, dying just ends the game; a bad home or empty scatter leaves things where they fell', () => {
    const w = { ...world, death: undefined };
    const s = stateWith(w, { room: 'yard', carrying: ['wallet'] });
    expect(runSteps([{ die: 'Bonk.' }], w, s)).toEqual(['Bonk.']);
    expect(s.gameOver).toBe(true);
    const w2 = { ...world, death: { ...world.death!, scatter: [] }, items: { ...world.items, wallet: { ...world.items.wallet, home: 'nowhere' } } };
    const s2 = stateWith(w2, { room: 'yard', carrying: ['wallet'] });
    runSteps([{ die: 'x' }], w2, s2);
    expect(s2.locations.wallet).toBe('yard');
  });
});
```

- [ ] **Step 2: Fail; Step 3: Implement; Step 4: Run everything; Step 5: Commit** `"Death and resurrection"`.

---

### Task 5: Endings, exit denials, VERBOSE/BRIEF/SUPERBRIEF

**Files:**
- Create: `src/engine/endings.ts`, `tests/engine/endings.test.ts`, `tests/engine/verbosity.test.ts`
- Modify: `src/types/world.ts` (`World.endings`, `Exit.denials`), `src/types/game.ts` (`verbosity`), `src/engine/effects.ts` (`end`), `src/engine/verbs/objects.ts` (`runFinale` uses `runEnding`), `src/engine/verbs/movement.ts` (`denials`), `src/engine/describe.ts` (verbosity), `src/engine/parser.ts`, `src/engine/engine.ts`, `src/engine/verbs/meta.ts` (HELP), `server/src/llm.ts`, `tests/fixtures/world.ts`

**Interfaces:**

```ts
World.endings?: Record<string, { lines: EventStep[]; score?: boolean; footer?: string[] }>;
Exit.denials?: Array<{ if: string; text: string }>;
GameState.verbosity?: 'verbose' | 'brief' | 'superbrief';
export function runEnding(id: string, world: World, state: GameState): string[];
```

**The finale.** `runFinale` builds the ending from `world.finale`:
- **lines:** the event, then each epilogue whose condition holds;
- **score:** true;
- **footer:** the footer event's lines.

It runs through `runEnding` (see the Ruling at the top). Office Space's ending test must pass unchanged.

**Verbosity:**
- **Room descriptions:**
  - `describeRoom` uses `state.verbosity ?? (style === 'infocom' ? 'brief' : 'verbose')`;
  - brief means the name and contents on a revisit;
  - superbrief means the name and contents always, except on LOOK;
  - LOOK always shows the full description.
- **Replies:**
  - in infocom style: “Maximum verbosity.”, “Brief descriptions.”, “Superbrief descriptions.”;
  - in brass style: “[Full descriptions.]”, “[Brief descriptions.]”, “[Room names only.]”.
- **Wiring:** the parser gets single words `verbose`, `brief` and `superbrief`; also add them to `ACTION_VOCAB`, HELP and `BUILT_IN_WORDS`.

- [ ] **Step 1: Failing tests**

`tests/engine/endings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { runSteps } from '@/engine/effects';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';
describe('endings', () => {
  it('end plays the ending, the score and the footer, and ends the game', () => {
    const w = { ...world, endings: { escape: { lines: ['You escape.'], score: true, footer: ['The end.'] } } };
    const s = stateWith(w);
    const lines = runSteps([{ end: 'escape' }, 'not printed'], w, s);
    expect(lines[0]).toBe('You escape.');
    expect(lines.some((l) => l.startsWith('[Score:'))).toBe(true);
    expect(lines.at(-1)).toBe('The end.');
    expect(s.gameOver).toBe(true);
  });
  it('the finale still plays exactly as before', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['bat'] });
    const r = execute({ action: 'smash', target: 'crate' }, { world, state: s });
    expect(r.lines).toEqual(['💥 The crate splinters.', '[Flag set: Crate broken]', '“The neighbor glares.”', '[Score: 20 of 40, in 0 moves.]', '[Rank: Novice]', 'Type RESTART to play again.']);
  });
});
```

(Before implementing, record the finale test's expected lines from the current code by running it once: the exact list must stay the same afterwards. Fix any mismatch in the expectation, not in the code, at that point.)

`tests/engine/verbosity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';
describe('VERBOSE, BRIEF, SUPERBRIEF', () => {
  it('parse, reply, and change revisits', () => {
    expect(fallbackParse('brief')).toEqual({ action: 'brief' });
    const s = stateWith(world);
    const go = (t: string) => execute({ action: 'go', target: t }, { world, state: s }).lines;
    expect(execute({ action: 'brief' }, { world, state: s }).lines).toEqual(['[Brief descriptions.]']);
    go('west'); go('east');
    expect(go('west')).not.toContain('A living room with a table by the door.');
    execute({ action: 'superbrief' }, { world, state: s });
    expect(execute({ action: 'look' }, { world, state: s }).lines).toContain('A living room with a table by the door.');
    execute({ action: 'verbose' }, { world, state: s });
    expect(go('east')).toContain('A small bedroom.');
  });
});
```

Exit denials (add to `tests/engine/exits.test.ts`):

```ts
it('an exit can refuse for different reasons, first match wins', () => {
  const w = { ...world, rooms: { ...world.rooms, bedroom: { ...world.rooms.bedroom, exits: { ...world.rooms.bedroom.exits,
    up: { to: 'shed', denials: [{ if: 'carrying<=0', text: 'Not empty-handed.' }, { if: '!has:key', text: 'You need the key.' }] } } } } };
  const s = stateWith(w);
  expect(execute({ action: 'go', target: 'up' }, { world: w, state: s }).lines).toEqual(['Not empty-handed.']);
  s.locations.wallet = 'player';
  expect(execute({ action: 'go', target: 'up' }, { world: w, state: s }).lines).toEqual(['You need the key.']);
  s.locations.key = 'player';
  execute({ action: 'go', target: 'up' }, { world: w, state: s });
  expect(s.currentRoom).toBe('shed');
});
```

- [ ] **Step 2: Fail; Step 3: Implement; Step 4: Run everything (frontend and server); Step 5: Commit** `"Endings, exit denials, VERBOSE/BRIEF/SUPERBRIEF"`.

---

### Task 6: World audit

**Files:** Create `tests/worlds/audit.test.ts` (shared: it audits the worlds the repo has; it imports `src/app.config` cartridges and the fixture, so Office Space's copy audits Office Space).

Checks, for each native world:
- every event step is a string or a known effect kind;
- every `move`, `open`, `close`, `lock`, `unlock`, `switch` and `run` target exists (items, rooms, events, `player`, `null`);
- every `schedule`, `cancel`, `run` and daemon `then` names an existing event;
- every `end` names an ending;
- `death.respawn`, `scatter` and item `home` name rooms;
- no room or item is named `player`;
- every exit's `to` and `door` exist;
- `verbClashes` is empty.

- [ ] **Step 1: Write the audit, with an export `auditWorld(world): string[]` in the test file. Step 2: run it; fix any real problem it finds in the tutorial, fixture or Zork data. Step 3: Commit** `"World audit test"`.

---

### Task 7: Zork I stage 2 slice

**Files:**
- Modify: `src/worlds/zork1.ts`
- Modify: `tests/worlds/zork1.test.ts` (new playthrough cases)

Add, from the MIT source (`/tmp/zork1src`; refetch with `gh api repos/historicalsource/zork1/contents/<file> --jq .content | base64 -d` if it's missing):
- **Rooms:** `cellar` (dark; CELLAR-FCN text; exits: north is a message exit "The troll’s domain isn’t built yet.", south to `east_of_chasm`, up `{ to: 'living_room', door: 'trap_door' }`, west is the ramp line; `onEnter` runs `cellar_enter` once, which closes and locks the trap door with the crash line and sets the cellar-points flag), `east_of_chasm` (dark), `gallery` (lit; `painting`), `studio` (dark; up `{ to: 'kitchen', denials: […chimney…] }`). The attic becomes `dark: true`.
- **The living room's `down`** becomes `{ to: 'cellar', if: 'flag:rug_moved', door: 'trap_door' }`. The boundary moves to the cellar's north.
- **The trap door** (from the cellar): `instead.open` with `if: 'in:cellar'` says "The door is locked from above.". `trap_door` gets `key: 'nothing'`-style locking: lock it via an effect only, with no key item, so UNLOCK fails.
- **The painting:**
  - item from the source;
  - `after.take` flag `took_painting` (4 points);
  - scoring `{ if: 'inside:painting:trophy_case', points: 6 }`;
  - cellar points 25 via the `cellar_enter` flag.
- **`lamp`:** `home: 'living_room'`, Zork's lamp daemons (spec section 1), `vars: { lamp_fuel: 185 }`, and `instead.turn_on` when `flag:lamp_dead`.
- **`darkness`:**
  - **look:** “It is pitch black. You are likely to be eaten by a grue.”;
  - **tooDark:** Zork's “It's too dark to see!”, so check the source's message for TAKE in the dark (`gverbs.zil` V-TAKE / `ITAKE`);
  - **fall:** “It is now pitch black.”;
  - **blunder:** the 80% grue.
- **`death`:** Zork's texts; penalty -10; lives 2; respawn `forest_1`; scatter over the above-ground rooms.

- [ ] **Step 1: Failing playthrough tests** (append to `tests/worlds/zork1.test.ts`):

```ts
it('down the trap door with a light: it slams shut behind you, and the cellar scores', () => {
  const { state, text } = play(['n', 'e', 'open window', 'w', 'w', 'take lamp', 'turn on lamp', 'move rug', 'open trap door', 'd']);
  expect(text).toContain('The trap door crashes shut, and you hear someone barring it.');
  expect(text).toContain('You are in a dark and damp cellar');
  expect(state.currentRoom).toBe('cellar');
  expect(state.flags.cellar_visited).toBe(true);
});

it('without light the cellar is pitch black', () => {
  const { text } = play(['n', 'e', 'open window', 'w', 'w', 'move rug', 'open trap door', 'd']);
  expect(text).toContain('It is pitch black. You are likely to be eaten by a grue.');
});

it('the painting, the chimney, the trophy case', () => {
  const { state, text } = play(['n', 'e', 'open window', 'w', 'w', 'take lamp', 'turn on lamp', 'move rug', 'open trap door', 'd', 's', 'e', 'take painting', 'n', 'u', 'w', 'open case', 'put painting in case', 'score']);
  expect(state.currentRoom).toBe('living_room');
  expect(state.locations.painting).toBe('trophy_case');
  expect(text).toMatch(/Your score is \d+ \(total of 350 points\)/);
});

it('the chimney refuses a full load', () => {
  const { state, text } = play(['n', 'e', 'open window', 'w', 'take sack', 'take bottle', 'w', 'take lamp', 'turn on lamp', 'move rug', 'open trap door', 'd', 's', 'e', 'take painting', 'n', 'u']);
  expect(text).toContain('You can’t get up there with what you’re carrying.');
  expect(state.currentRoom).toBe('studio');
});
```

- [ ] **Step 2: Fail; Step 3: Author the world; Step 4: Run everything; Step 5: Commit** `"Native Zork I, stage 2: the cellar, the gallery and the studio"`.

---

### Task 8: Differential walkthrough for stage 2, and death texts

**Files:**
- Modify: `tests/worlds/zork1-allowlist.ts`, `tests/worlds/zork1-diff.test.ts`

- [ ] **Step 1: Extend `WALKTHROUGH`** after the existing commands, with unique spellings:

`'close case'`, `'open case'` (if useful), `'move rug'` is already present, `'open trap door'` is already present. Remove `'close trap door'` from stage 1's list if it conflicts, and re-order so the player is in the living room with the lamp lit. Then:

```
'turn off lamp', 'turn on brass lantern', 'go down', 'south', 'go east', 'take painting',
'north', 'climb up', 'west', 'open case', 'put painting in case', 'verbose', 'l', 'brief', 'score'
```

Because commands must be unique, synonyms already used (`go down`, `go east`) need other spellings (`down`, `east` from stage 1 conflicts): check the existing list and pick unused ones (`descend`, `walk east`, …). Keep the list unique; the test checks it.

- [ ] **Step 2: Run the diff and work the mismatches** as in stage 1:
1. fix the world text;
2. fix an infocom-style engine difference;
3. allowlist only true randomness, with a reason.

Run: `npx vitest run tests/worlds/zork1-diff.test.ts 2>&1 | tail -60`
Expected after the work: PASS, with an empty allowlist.

- [ ] **Step 3: Death texts against the original.** Add a test that plays the original into a guaranteed death and compares the fixed lines (`****  You have died  ****` and the resurrection text) with the native `death` block's.

Zork has no deterministic death in the slice, so seed it: run the grue blunder in the original repeatedly (a dark room with no exit, `n`), up to 20 tries, until the death text appears. Then compare the lines after the cause with `zork1.death.message` + `resurrection` (normalized). Skip the comparison (not fail) if 20 tries never die, logging why.

- [ ] **Step 4: Run everything with coverage; Step 5: Commit** `"Differential test: the first underground rooms"`.

---

### Task 9: Docs, changelog, version

- **world-schema:**
  - structured effects (the table from the spec), `vars`, `seed`, `daemons`, `darkness`, `death`, `endings`;
  - `Room.dark`, `Item.home`, `Exit.denials`;
  - conditional score entries.
- **conditions-and-events:**
  - `var:`, `carrying`, `lit:`;
  - effects become the primary form, with bracket lines as shorthand.
- **commands:** VERBOSE, BRIEF, SUPERBRIEF; darkness behavior.
- **porting-zork:**
  - stage 2 rooms;
  - ZIL interrupts → daemons/fuses, JIGS-UP → `die`, `LIT?` → `dark` + `light`.
- **how-it-works:** the after-turn sequence.
- **CHANGELOG `## 1.5.0`;** bump both package.json files; lockfiles.

Checks: docs build with no dead links; full suite with coverage; server.

Commit `"1.5.0: docs for darkness and time"`, push, PR. Merge only after the final review and CI.

---

### Task 10: Office Space

- Sync into the private repo (`scripts/sync-from-public.sh`) on a new branch.
- **Expected:** no world changes needed; all tests pass, including the shortest-win and 100-point runs and the migration test. The audit test (now shared) audits Office Space; fix any genuine data problem it reports in `office-space.ts`, and note it in the CHANGELOG.
- Bump to 1.5.0, CHANGELOG, PR. After CI: merge, tag `v1.5.0`, verify the live site (boots, an existing save resumes, SNOOZE works).

---

## Self-review notes

- **Spec coverage:**

  | Spec area | Task |
  |---|---|
  | Effects | 1 |
  | Variables, conditions, score entries | 1 |
  | Randomness | 1 |
  | Daemons and fuses | 2 |
  | The lamp | 7 (data) |
  | Light and darkness | 3 |
  | Death | 4 |
  | Endings and the finale | 5 (ruling above) |
  | Exit denials | 5 |
  | Verbosity | 5 |
  | Slice | 7 |
  | Testing | 1–8 |
  | World audit | 6 |
  | Compatibility | 1 and 10 |
  | Docs | 9 |

- **Type consistency:** `runSteps`, `runEventKey`, `nextRandom`, `isLit`, `die` and `runEnding` are used under the same names throughout.
