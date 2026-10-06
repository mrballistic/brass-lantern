# Engine parity, stage 5a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native Zork I gains the dam, the reservoir, the Loud Room, the mirrors, the temple, the dome and Hades (about 30 rooms, seven treasures), every puzzle checked line by line against zork1.z3 by seeded scripted sessions.

**Architecture:** Five generic engine pieces (with-objects and BURN; conditional, quiet, unvisit, free and no-dark-line steps; line capture; death variants and always-lit; the seeded original for tests) land first, each with unit tests on the fixture world. Then four region tasks add Zork content as data and scripts in `src/worlds/zork1.ts`, each with its own scripted sessions in `tests/worlds/zork1-sessions.test.ts`. Docs, the walkthrough extension and the Office Space sync close it out.

**Tech Stack:** TypeScript 6, Vue 3/Pinia store, Vitest 5, ifvms (Z-machine, tests only), Express intent server.

**Spec:** `docs/superpowers/specs/2026-10-05-engine-parity-stage-5a-design.md`. ZIL source: `/tmp/zork1-src` (clone `https://github.com/historicalsource/zork1` there if missing). Story file: `tests/fixtures/zork1.z3`.

## Global Constraints

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.
- A new built-in verb goes in four places: the parser regex and `BUILT_IN_WORDS` (`src/engine/parser.ts`), the dispatcher (`src/engine/engine.ts`, wrapped in `withRules`), HELP (`src/engine/verbs/meta.ts`), and `ACTION_VOCAB` plus the prompt (`server/src/llm.ts`).
- Tests run in the node environment; a test file that needs the DOM starts with `// @vitest-environment happy-dom`.
- Run tests with `npx vitest run <files>`; the whole suite with `npm run test:coverage`; also `npm run lint`, `npm run type-check`, `(cd server && npm test)`.

## Spec refinements (made while planning; recorded here and in the spec)

1. **Capture runs per command piece**, after `splitCommands`, not on the whole line: ghost mode must refuse `take lamp` in `north. take lamp` while letting `north` through, and its script needs `ctx.parse`. A capture that takes a piece still ends the line. The Loud Room behaves the same, since its loop starts once you're inside.
2. **Ghost mode needs three small generic death and light features** the spec folded into “a `death.then` script”, because `then` runs after the resurrection text is printed and can't change it: `death.variants` (a conditional resurrection text, respawn room and event), `death.message` entries with conditions (“Bad luck, huh?”), `death.instead` (dying while dead), and `darkness.litIf` (Zork's ALWAYS-LIT).
3. **The no-dark-line step** is `{ noDarkLine: true }`.

## Review Focus

1. A capture that throws or returns steps while the game is over: store commands (UNDO, RESTART) still work, and the capture never runs after the game ends. (Task 4 test.)
2. `light lamp` with no WITH still turns the lamp on; `light candles with match` reaches the candles' rule; `burn leaflet` with no tool asks what with, without taking a turn. (Task 2 test.)
3. A capture that declines after calling `ctx.roll` must not advance the seed. (Task 4 test.)
4. `{ go, quiet: true }` into a dark room: no description and no darkness line, but the room still isn't marked visited until lit. (Task 3 test.)
5. Dying in ghost mode prints Zork's “It takes a talented person…” and ends the game; UNDO still restores. (Task 5 test, Task 9 session.)

---

### Task 1: The seeded original and the session harness

**Files:**
- Modify: `src/zmachine/session.ts` (a `seed` option)
- Create: `tests/helpers/zsession.ts`
- Modify: `tests/worlds/zork1-diff.test.ts` (use the helper for its original runner; behavior unchanged)
- Create: `tests/worlds/zork1-sessions.test.ts`

**Interfaces:**
- Produces:
  - `new ZMachineSession(story, dialog, events, { seed?: number })`: after `start()` reaches its first input, `vm.xorshift_seed = seed` when given.
  - `tests/helpers/zsession.ts`:
    - `originalRun(commands: string[], seed: number): Promise<string[][]>` (replies per command, `RANDOM_LINES` filtered, one fresh session).
    - `nativeRun(commands: string[], seed: number): string[][]` (fresh `initialState(zork1)`, `state.rng = seed`, through `captureLine` once Task 4 lands, then `interpret`/`execute` as zork1-diff does).
    - `PREFIX: string[]` (West of House to the Round Room with lamp and sword, troll killed).
    - `prefixed(side, commands, seed)`: runs `PREFIX` with the fight loop (`kill troll with sword` repeated until the reply matches `/troll.*(dies|breathes his last|dead)|smoke/i`, at most 12 times), then `commands`; returns only the replies to `commands`, or `null` if the player died, the troll survived, or a thief line (`THIEF` regex from zork1-diff) appeared anywhere.
    - `findSeed(side, commands, accept?: (replies) => boolean): Promise<number>` (seeds 1..300; first whose `prefixed` is non-null and accepted). Used once per session to choose the pinned seed, then the seed is written into the test.
    - `compare(native: string[][], original: string[][], commands: string[]): string[]` (mismatch report lines, using zork1-diff's `normalize`; empty when equal). Move `normalize` and `THIEF` into this helper and import them in zork1-diff.

- [ ] **Step 1: Write the failing determinism test** in `tests/worlds/zork1-sessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compare, nativeRun, originalRun, prefixed } from '../helpers/zsession';

describe('the seeded original', () => {
  it('replays exactly from the same seed, and differs across seeds', async () => {
    const commands = ['north', 'east', 'open window', 'west', 'west', 'take sword', 'take lamp', 'move rug', 'open trap door', 'turn on lamp', 'down', 'north', 'kill troll with sword', 'kill troll with sword', 'kill troll with sword'];
    const a = await originalRun(commands, 7);
    const b = await originalRun(commands, 7);
    expect(b).toEqual(a);
    const others = await Promise.all([8, 9, 10, 11].map((s) => originalRun(commands, s)));
    expect(others.some((o) => JSON.stringify(o) !== JSON.stringify(a))).toBe(true);
  });

  it('runs the prefix to the Round Room on both sides', async () => {
    expect((await prefixed('original', ['look'], 3))?.[0].join(' ')).toMatch(/Round Room/);
    expect((await prefixed('native', ['look'], 3))?.[0].join(' ')).toMatch(/Round Room/);
  });

  it('compare reports nothing for equal replies', () => {
    const r = nativeRun(['look'], 1);
    expect(compare(r, r, ['look'])).toEqual([]);
  });
});
```

(If seed 3 fails the prefix on a side, use `findSeed` to pick the first that passes and write it in; ledger the seeds.)

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/worlds/zork1-sessions.test.ts`
Expected: FAIL, `Cannot find module '../helpers/zsession'`.

- [ ] **Step 3: Add the seed option** to `src/zmachine/session.ts`:

```ts
export interface SessionOptions {
  /** Tests only: seeds the interpreter's generator (ifvms's xorshift) so a story replays exactly. */
  seed?: number;
}
// constructor gains a 4th parameter: private readonly options: SessionOptions = {}
// in start(), after Glk.init(options):
//   if (this.options.seed) (vm as unknown as { xorshift_seed: number }).xorshift_seed = this.options.seed;
```

ifvms resets `xorshift_seed` to 0 while starting (`io.js`), so it must be set after `Glk.init`; `Glk.init` runs the story to its first input synchronously in the test environment (the existing `settle()` loop confirms the banner arrives before any submit). If the determinism test shows the banner already consumed a random number, that's harmless: every command after it is seeded.

- [ ] **Step 4: Write `tests/helpers/zsession.ts`** by moving `originalOnce`'s session plumbing (onLines, onWaiting, `settle`, `send`) out of `zork1-diff.test.ts`, minus the restart-on-thief throw (callers decide), plus `seed` passed to the session; `nativeRun` from zork1-diff's `nativeOnce` without the thief rejection; `normalize`, `THIEF`, `PREFIX`, `prefixed`, `findSeed`, `compare` as in Interfaces. `PREFIX`:

```ts
export const PREFIX = ['north', 'east', 'open window', 'west', 'west', 'take sword', 'take lamp', 'move rug', 'open trap door', 'turn on lamp', 'down', 'north', '@fight', 'east', 'east'];
```

`@fight` is expanded by `prefixed` into the fight loop. Each run uses `new LocalStorageDialog('session')` and clears `localStorage` first.

- [ ] **Step 5: Point `zork1-diff.test.ts` at the helper** (import `normalize`, `THIEF` and the session plumbing; keep its restart loop and SYNC logic). Run: `npx vitest run tests/worlds/zork1-diff.test.ts tests/worlds/zork1-sessions.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/zmachine/session.ts tests/helpers/zsession.ts tests/worlds/zork1-diff.test.ts tests/worlds/zork1-sessions.test.ts
git commit -m "Seeded original and the scripted-session harness"
```

---

### Task 2: With-objects for built-in verbs, and BURN

**Files:**
- Modify: `src/engine/parser.ts`, `src/engine/engine.ts`, `src/engine/verbs/meta.ts`, `src/types/world.ts`, `server/src/llm.ts`
- Create: `src/engine/verbs/burn.ts`
- Test: `tests/engine/burn.test.ts`, `tests/engine/parser.test.ts`, `server/tests/llm.test.ts` (whichever file asserts `ACTION_VOCAB`)

**Interfaces:**
- Produces: actions `burn` (`target`, `indirect?`), `turn` (`target`, `indirect?`), `plug` (`target`, `indirect?`); `Item.burnable?: boolean`, `Item.flaming?: boolean` (true while the item is on, for switchable items; always for a non-switchable flaming item); `handleBurn(action, world, state): EngineResult`.

- [ ] **Step 1: Write failing parser tests** (append to `tests/engine/parser.test.ts`):

```ts
describe('with-objects for built-in verbs (5a)', () => {
  it('parses LIGHT/BURN X WITH Y as burn, and bare LIGHT as turn_on', () => {
    expect(fallbackParse('light candles with match')).toEqual({ action: 'burn', target: 'candles', indirect: 'match' });
    expect(fallbackParse('burn the book with the torch')).toEqual({ action: 'burn', target: 'book', indirect: 'torch' });
    expect(fallbackParse('burn down leaflet with match')).toEqual({ action: 'burn', target: 'leaflet', indirect: 'match' });
    expect(fallbackParse('ignite leaflet')).toEqual({ action: 'burn', target: 'leaflet' });
    expect(fallbackParse('light lamp')).toEqual({ action: 'turn_on', target: 'lamp' });
  });
  it('parses TURN X WITH Y, TURN ON X WITH Y and PLUG X WITH Y', () => {
    expect(fallbackParse('turn bolt with wrench')).toEqual({ action: 'turn', target: 'bolt', indirect: 'wrench' });
    expect(fallbackParse('turn on lamp with match')).toEqual({ action: 'turn_on', target: 'lamp', indirect: 'match' });
    expect(fallbackParse('plug leak with putty')).toEqual({ action: 'plug', target: 'leak', indirect: 'putty' });
    expect(fallbackParse('plug cord into socket')).toEqual({ action: 'put', target: 'cord', indirect: 'socket', prep: 'in' });
  });
});
```

(Check the existing `put` parse shape for `prep` in parser.test.ts and match it.)

- [ ] **Step 2: Write failing engine tests** in `tests/engine/burn.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const w: World = {
  ...fixtureWorld,
  items: {
    ...fixtureWorld.items,
    book: { ...fixtureWorld.items.book, burnable: true },
    match: { name: 'match', description: 'A match.', portable: true, tags: [], switchable: true, flaming: true },
    candle: { name: 'candle', description: 'A candle.', portable: true, tags: [], instead: { burn: [{ with: 'match', say: ['The candle is lit.'] }] } },
    bolt: { name: 'bolt', description: 'A bolt.', portable: false, tags: [] },
  },
};
const run = (s: ReturnType<typeof stateWith>, a: Parameters<typeof execute>[0]) => execute(a, { world: w, state: s });

describe('BURN', () => {
  it('asks what with, takes no turn, when there is no tool', () => {
    const s = stateWith(w, { room: 'living', carry: ['book'] });
    const r = run(s, { action: 'burn', target: 'book' });
    expect(r.lines.join(' ')).toMatch(/What do you want to burn the book with\?/);
    expect(s.moveCount).toBe(0);
  });
  it('refuses a tool that isn’t burning, in Zork’s words', () => {
    const s = stateWith(w, { room: 'living', carry: ['book', 'match'] });
    expect(run(s, { action: 'burn', target: 'book', indirect: 'match' }).lines).toEqual(['With a match??!?']);
  });
  it('burns a burnable thing with a lit tool', () => {
    const s = stateWith(w, { room: 'living', carry: ['book', 'match'] });
    s.itemState.match = { on: true };
    const r = run(s, { action: 'burn', target: 'book', indirect: 'match' });
    expect(r.lines[0]).toMatch(/book catches fire/i);
    expect(s.locations.book).toBeNull();
  });
  it('lets a rule answer first', () => {
    const s = stateWith(w, { room: 'living', carry: ['candle', 'match'] });
    expect(run(s, { action: 'burn', target: 'candle', indirect: 'match' }).lines).toEqual(['The candle is lit.']);
  });
});

describe('TURN and PLUG with a tool', () => {
  it('have no effect without a rule', () => {
    const s = stateWith(w, { room: 'shed', carry: ['match'] });
    s.locations.bolt = 'shed';
    expect(run(s, { action: 'turn', target: 'bolt', indirect: 'match' }).lines).toEqual(['This has no effect.']);
    expect(run(s, { action: 'plug', target: 'bolt', indirect: 'match' }).lines).toEqual(['This has no effect.']);
  });
});
```

(`stateWith` options: check `tests/helpers/state.ts` for the carry option's real name and adjust. Zork's V-BURN text for a burnable thing held or in the room: read `V-BURN` in `/tmp/zork1-src/gverbs.zil` and use its exact lines, with “The *X* catches fire.” as it prints for an item not held; if held, Zork kills the player (“The *X* catches fire. Unfortunately, you were holding it at the time.”): implement both, and adjust the third test to put the book on the floor if the held case dies. Non-burnable: “You can’t burn a *X*.”)

- [ ] **Step 3: Run them**

Run: `npx vitest run tests/engine/parser.test.ts tests/engine/burn.test.ts`
Expected: FAIL (unknown actions, parse mismatches).

- [ ] **Step 4: Implement the parser.** In `RE`:

```ts
  burn: /^(?:burn(?:\s+down)?|ignite|incinerate|light)\s+(?:the\s+)?(.+?)\s+with\s+(?:the\s+|a\s+)?(.+)$/i,
  burnAlone: /^(?:burn(?:\s+down)?|ignite|incinerate)\s+(?:the\s+)?(.+)$/i,
  turnOnWith: /^(?:turn|switch)\s+on\s+(?:the\s+)?(.+?)\s+with\s+(?:the\s+|a\s+)?(.+)$/i,
  turnWith: /^turn\s+(?:the\s+)?(.+?)\s+with\s+(?:the\s+|a\s+)?(.+)$/i,
  plugWith: /^plug\s+(?:the\s+)?(.+?)\s+with\s+(?:the\s+|a\s+)?(.+)$/i,
```

In `VERB_PATTERNS`, before `[RE.turnOn, 'turn_on']`: `[RE.burn, 'burn'], [RE.burnAlone, 'burn'], [RE.turnOnWith, 'turn_on'], [RE.turnWith, 'turn'], [RE.plugWith, 'plug'],`. Add `'burn', 'burn down', 'ignite', 'incinerate'` to `BUILT_IN_WORDS` (`turn`, `light`, `plug` are already there).

- [ ] **Step 5: Implement `src/engine/verbs/burn.ts`** (`handleBurn`): no indirect → `needObject`-style question for the indirect (use the same AskSignal path ATTACK uses when it asks “What do you want to attack the troll with?”; read `src/engine/verbs/attack.ts` for it); indirect not flaming (`!item.flaming || (item.switchable && !isOn)`) → `With a ${name}??!?`; target `burnable` → Zork's V-BURN lines, item to `null`; else `You can’t burn a ${name}.`. Types: add `burnable?` and `flaming?` to `Item` in `src/types/world.ts` with comments. Dispatcher cases:

```ts
    case 'burn':
      return withRules('burn', action, world, state, () => handleBurn(action, world, state));
    case 'turn':
      return withRules('turn', action, world, state, () => ok(['This has no effect.']));
    case 'plug':
      return withRules('plug', action, world, state, () => ok(['This has no effect.']));
```

`turn_on` with an `indirect` keeps `handleSwitch(action.target, true, …)` (the tool is ignored). HELP in `meta.ts`: add a BURN line (“BURN X WITH Y, LIGHT X WITH Y”) in the style of its neighbours. `server/src/llm.ts`: add `burn`, `turn`, `plug` to `ACTION_VOCAB` and one prompt line each (“burn: set fire to target with indirect (light candles with match)”, “turn: turn target with indirect tool”, “plug: plug target with indirect”). Update the server test that lists the vocabulary.

- [ ] **Step 6: Run**

Run: `npx vitest run tests/engine/parser.test.ts tests/engine/burn.test.ts && (cd server && npm test)`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "BURN, and TURN/PLUG/TURN ON with a second object"
```

---

### Task 3: New steps: conditional, quiet go, unvisit, free, no dark line; ctx.line and ctx.parse

**Files:**
- Modify: `src/types/world.ts` (Effect union), `src/engine/effects.ts`, `src/engine/engine.ts` (go hook, free, dark line), `src/engine/verbs/movement.ts` (`enterRoom` quiet option), `src/engine/scripts.ts` (`line`, `parse`), `tests/helpers/audit.ts` (effect kinds)
- Test: `tests/engine/steps.test.ts`

**Interfaces:**
- Produces: effects `{ if: string; then: EventStep[]; else?: EventStep[] }`, `{ go: string; quiet?: boolean }`, `{ unvisit: string }`, `{ free: true }`, `{ noDarkLine: true }`; `enterRoom(id, world, state, opts?: { quiet?: boolean })`; `ScriptContext.line?: string`, `ScriptContext.parse(text: string): ParsedAction | null`; `scriptSteps(name, arg, world, state, line?)`; `turnFree(state): boolean` and `darkLineSaid(state): boolean` (WeakSet-backed, reset by `beginTurn`, exported from `effects.ts`).

- [ ] **Step 1: Write failing tests** in `tests/engine/steps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { runSteps } from '@/engine/effects';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

describe('conditional steps', () => {
  it('run then or else by a condition', () => {
    const s = stateWith(fixtureWorld, { room: 'living' });
    expect(runSteps([{ if: 'in:living', then: ['here'], else: ['away'] }], fixtureWorld, s)).toEqual(['here']);
    expect(runSteps([{ if: 'in:yard', then: ['here'], else: ['away'] }], fixtureWorld, s)).toEqual(['away']);
    expect(runSteps([{ if: 'in:yard', then: ['here'] }], fixtureWorld, s)).toEqual([]);
  });
});

describe('quiet go', () => {
  it('moves without describing', () => {
    const s = stateWith(fixtureWorld, { room: 'living' });
    expect(runSteps([{ go: 'yard', quiet: true }], fixtureWorld, s)).toEqual([]);
    expect(s.currentRoom).toBe('yard');
    expect(s.visited).toContain('yard');
  });
  it('into a dark room: no lines, and not visited until lit', () => {
    const s = stateWith(fixtureWorld, { room: 'living' });
    expect(runSteps([{ go: 'cellar', quiet: true }], fixtureWorld, s)).toEqual([]);
    expect(s.visited).not.toContain('cellar');
  });
});

describe('unvisit', () => {
  it('makes the next arrival show the full description again', () => {
    const w: World = { ...fixtureWorld, style: 'infocom' };
    const s = stateWith(w, { room: 'living' });
    execute({ action: 'go', target: 'outside' }, { world: w, state: s });
    execute({ action: 'go', target: 'in' }, { world: w, state: s });
    runSteps([{ unvisit: 'yard' }], w, s);
    expect(s.visited).not.toContain('yard');
  });
});

describe('free steps', () => {
  it('make the turn take no time', () => {
    const w: World = { ...fixtureWorld, events: { ...fixtureWorld.events, pause: ['Hm.', { free: true }] }, rooms: { ...fixtureWorld.rooms, living: { ...fixtureWorld.rooms.living, instead: { wait: [{ then: 'pause' }] } } } };
    const s = stateWith(w, { room: 'living' });
    const r = execute({ action: 'wait' }, { world: w, state: s });
    expect(r.lines).toEqual(['Hm.']);
    expect(s.moveCount).toBe(0);
  });
});

describe('noDarkLine', () => {
  it('stops the engine’s own darkness line after a step already said it', () => {
    const w: World = {
      ...fixtureWorld,
      events: { ...fixtureWorld.events, snuff: ['You are left in the dark.', { switch: 'lamp', on: false }, { noDarkLine: true }] },
      rooms: { ...fixtureWorld.rooms, cellar: { ...fixtureWorld.rooms.cellar, instead: { wait: [{ then: 'snuff' }] } } },
    };
    const s = stateWith(w, { room: 'cellar', carry: ['lamp'] });
    s.itemState.lamp = { on: true };
    const r = execute({ action: 'wait' }, { world: w, state: s });
    expect(r.lines).toEqual(['You are left in the dark.']);
  });
});

describe('scripts see the line and can parse', () => {
  it('ctx.parse reads a command with the world’s verbs', () => {
    let seen: unknown;
    const w: World = { ...fixtureWorld, scripts: { peek: (ctx) => void (seen = ctx.parse('take the key')) } };
    runSteps([{ script: 'peek' }], w, stateWith(w));
    expect(seen).toEqual({ action: 'take', target: 'key' });
  });
});
```

(Use the fixture's real lamp ID and an exit label that exists from `living` to `yard` and back; `stateWith`'s options as in `tests/helpers/state.ts`.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/steps.test.ts`. Expected: FAIL (type errors and unknown effects).

- [ ] **Step 3: Implement.**
  - `world.ts` Effect union: add the five shapes with one-line comments; change `{ go: string }` to `{ go: string; quiet?: boolean }`.
  - `effects.ts` `runEffect`, before `'chance' in e` (an `if` step has `then` as an array, a daemon's `then` is never a step, so `'if' in e && Array.isArray(e.then)` identifies it):

```ts
  if ('if' in e && Array.isArray((e as { then?: unknown }).then)) {
    const c = e as { if: string; then: EventStep[]; else?: EventStep[] };
    return { lines: runSteps((evaluateCondition(c.if, state, world) ? c.then : c.else) ?? [], world, state), stop: state.gameOver };
  }
  if ('unvisit' in e) return void (state.visited = state.visited.filter((r) => r !== e.unvisit)), { lines: [] };
  if ('free' in e) return void freeTurns.add(state), { lines: [] };
  if ('noDarkLine' in e) return void darkSaid.add(state), { lines: [] };
```

  with module-level `const freeTurns = new WeakSet<GameState>(); const darkSaid = new WeakSet<GameState>();`, exported `turnFree(state)` / `darkLineSaid(state)`, and both cleared where `halted` is cleared at the start of a turn (`beginTurn`). `'go' in e` passes `{ quiet: e.quiet }` to `hooks.go`; the hook type gains the optional 4th parameter.
  - `movement.ts` `enterRoom`: with `opts.quiet`, after moving and marking visited (lit only), run `runOnEnter` and return its lines without `describeRoom`.
  - `engine.ts`: `go: (room, world, state, opts) => enterRoom(room, world, state, opts)`; after dispatch, `if (turnFree(state)) result = { ...result, free: true };` (before the `free` early return); in the light-change block, `if (!litNow && litBefore && !darkLineSaid(state)) later.push(darknessFalls(world));`.
  - `scripts.ts`: `line?: string` and `parse(text)` in `ScriptContext` (`parse: (text) => fallbackParse(text, world.verbs)`); `scriptSteps` takes an optional 5th `line` and passes it.
  - `tests/helpers/audit.ts`: accept the new effect kinds; check `unvisit` and `go` room IDs, and recurse into `if` steps' `then`/`else` as it does for `chance`.

- [ ] **Step 4: Run** — `npx vitest run tests/engine/steps.test.ts tests/engine` . Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Conditional, quiet-go, unvisit, free and no-dark-line steps; ctx.line and ctx.parse"`

---

### Task 4: Line capture

**Files:**
- Modify: `src/types/world.ts` (`capture` on Room and World), `src/engine/engine.ts` (`captureLine`, a `capture` dispatch case), `src/stores/game.ts` (call it per piece), `tests/helpers/play.ts`, `tests/helpers/zsession.ts` (native side), `tests/helpers/audit.ts` (capture scripts exist; `if` is a valid condition)
- Test: `tests/engine/capture.test.ts`, `tests/stores/game.test.ts` (one store test; that file is already happy-dom)

**Interfaces:**
- Consumes: `scriptSteps(name, arg, world, state, line)`, `turnFree` (Task 3).
- Produces: `capture?: { if?: string; script: string }` on `Room` and `World`; `captureLine(world: World, state: GameState, line: string): EngineResult | null`. A non-null result means the piece was taken; callers stop the rest of the line.

- [ ] **Step 1: Write failing tests** in `tests/engine/capture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { captureLine } from '@/engine/engine';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { play } from '../helpers/play';
import { fixtureWorld } from '../fixtures/world';

const w: World = {
  ...fixtureWorld,
  rooms: { ...fixtureWorld.rooms, shed: { ...fixtureWorld.rooms.shed, capture: { if: '!flag:quiet', script: 'echo' } } },
  scripts: {
    echo: (ctx) => {
      const line = ctx.line!.trim().toLowerCase();
      if (line === 'west' || line === 'out') return; // declines: normal parsing
      if (line === 'roll') { ctx.roll(6); return; } // declines after rolling: must not advance the seed
      if (line === 'echo') return ['The acoustics change.', { set: 'quiet' }, { free: true }];
      return [`${line} ${line}...`, { free: true }];
    },
  },
};

describe('line capture', () => {
  it('takes a piece before parsing, with no time passing', () => {
    const s = stateWith(w, { room: 'shed' });
    const r = captureLine(w, s, 'xyzzy');
    expect(r?.lines).toEqual(['xyzzy xyzzy...']);
    expect(s.moveCount).toBe(0);
  });
  it('declines without changing anything, even after rolling', () => {
    const s = stateWith(w, { room: 'shed' });
    const before = JSON.stringify(s);
    expect(captureLine(w, s, 'roll')).toBeNull();
    expect(captureLine(w, s, 'west')).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });
  it('stops once its condition fails', () => {
    const s = stateWith(w, { room: 'shed' });
    captureLine(w, s, 'echo');
    expect(captureLine(w, s, 'anything')).toBeNull();
  });
  it('only where the player is, and never after the game ends', () => {
    const s = stateWith(w, { room: 'yard' });
    expect(captureLine(w, s, 'anything')).toBeNull();
    const t = stateWith(w, { room: 'shed' });
    t.gameOver = true;
    expect(captureLine(w, t, 'anything')).toBeNull();
  });
  it('a taken piece ends the line', () => {
    const { text } = play({ ...w, startRoom: 'shed' }, ['hello. west']);
    expect(text).toContain('hello hello...');
    expect(text).not.toMatch(/📍 (?!Shed)/);
  });
  it('a world capture runs after the room’s', () => {
    const ww: World = { ...w, capture: { script: 'always' }, scripts: { ...w.scripts, always: () => ['World.', { free: true }] } };
    expect(captureLine(ww, stateWith(ww, { room: 'yard' }), 'jump')?.lines).toEqual(['World.']);
    expect(captureLine(ww, stateWith(ww, { room: 'shed' }), 'blah')?.lines).toEqual(['blah blah...']);
  });
});
```

And in `tests/stores/game.test.ts` a test that, in a world with a capturing start room, UNDO and RESTART still work (submit `undo` → “[Nothing to undo.]” or the Infocom form, never the capture's echo), and captured input never calls the intent client (spy on the existing intent-client mock the file uses).

- [ ] **Step 2: Run** — `npx vitest run tests/engine/capture.test.ts tests/stores/game.test.ts`. Expected: FAIL (`captureLine` not exported).

- [ ] **Step 3: Implement `captureLine`** in `engine.ts`:

```ts
const pendingCapture = new WeakMap<GameState, EventStep[]>();

/** A room's or the world's capture taking a piece of input before it's parsed (Zork's Loud Room). */
export function captureLine(world: World, state: GameState, line: string): EngineResult | null {
  if (state.gameOver) return null;
  for (const c of [world.rooms[state.currentRoom]?.capture, world.capture]) {
    if (!c || (c.if && !evaluateCondition(c.if, state, world))) continue;
    const rng = state.rng;
    const steps = scriptSteps(c.script, undefined, world, state, line);
    if (!steps || steps.length === 0) {
      state.rng = rng; // a capture that declines changes nothing
      continue;
    }
    pendingCapture.set(state, steps);
    return execute({ action: 'capture', target: line }, { world, state });
  }
  return null;
}
```

and in `dispatch`: `case 'capture': { const steps = pendingCapture.get(state) ?? []; pendingCapture.delete(state); return ok(runSteps(steps, world, state), true); }`. `'capture'` is internal: not in the parser, HELP or `ACTION_VOCAB`; add a comment saying so. Types: `capture?: { if?: string; script: string }` on `Room` and `World`, commented.

- [ ] **Step 4: Call it.**
  - Store (`submit`), inside the `splitCommands` loop, after the store-command check and the game-over break, before `runCommand`: `const captured = captureLine(world, this.game, command); if (captured) { if (captured.mutated) line.changed = true; this.applyResult(captured); break; }`. Skip capture while `conversation.pending` is set (an answer to a question goes to the engine).
  - `tests/helpers/play.ts`: per piece, try `captureLine` first; on a result, push its lines and stop the line.
  - `tests/helpers/zsession.ts` `nativeRun`: the same.

- [ ] **Step 5: Run** — `npx vitest run tests/engine/capture.test.ts tests/stores/game.test.ts tests/worlds/zork1-sessions.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Line capture: rooms and worlds can take input before it's parsed"`

---

### Task 5: Death variants, conditional death lines, dying while dead, always-lit; the intent context

**Files:**
- Modify: `src/types/world.ts` (`Death`, `Darkness`), `src/engine/death.ts`, `src/engine/model.ts` (`isLit`), `src/engine/intent-client.ts`, `tests/helpers/audit.ts`
- Test: `tests/engine/death.test.ts`, `tests/engine/darkness.test.ts` (or the file that tests `isLit`), `tests/engine/intent-client.test.ts`

**Interfaces:**
- Produces:
  - `Death.message?: Array<string | { if: string; text: string }>`
  - `Death.variants?: Array<{ if: string; resurrection?: string[]; respawn?: string; then?: string }>`: the first whose `if` holds replaces `resurrection`, `respawn` and `then` (fields it omits fall back to the block's own).
  - `Death.instead?: Array<{ if: string; lines: string[] }>`: checked first; the first that holds prints its lines (not the cause) and ends the game.
  - `Darkness.litIf?: string`: while it holds, every room is lit.

- [ ] **Step 1: Write failing tests** (append to `tests/engine/death.test.ts`):

```ts
describe('death variants (5a)', () => {
  const base = { message: [{ if: 'flag:unlucky', text: 'Bad luck, huh?' }, '**** You have died ****'], lives: 2, respawn: 'living', resurrection: ['Another chance.'] };
  it('conditional message lines', () => {
    const w = { ...fixtureWorld, death: base };
    const s = stateWith(w, { room: 'yard' });
    s.flags.unlucky = true;
    expect(runSteps([{ die: 'Splat.' }], w, s).slice(0, 3)).toEqual(['Splat.', 'Bad luck, huh?', '**** You have died ****']);
  });
  it('a variant replaces the resurrection text, the room and the event', () => {
    const w = { ...fixtureWorld, events: { ...fixtureWorld.events, ghosted: [{ set: 'dead' }] }, death: { ...base, variants: [{ if: 'visited:shed', resurrection: ['You find yourself before the gates.'], respawn: 'shed', then: 'ghosted' }] } };
    const s = stateWith(w, { room: 'yard' });
    s.visited.push('shed');
    const lines = runSteps([{ die: 'Splat.' }], w, s);
    expect(lines).toContain('You find yourself before the gates.');
    expect(lines).not.toContain('Another chance.');
    expect(s.currentRoom).toBe('shed');
    expect(s.flags.dead).toBe(true);
  });
  it('dying while dead ends the game with its own lines', () => {
    const w = { ...fixtureWorld, death: { ...base, instead: [{ if: 'flag:dead', lines: ['It takes a talented person…'] }] } };
    const s = stateWith(w, { room: 'yard' });
    s.flags.dead = true;
    expect(runSteps([{ die: 'Splat.' }], w, s)).toEqual(['It takes a talented person…']);
    expect(s.gameOver).toBe(true);
  });
});
```

Plus: `isLit` true in the fixture's dark `cellar` when `darkness.litIf: 'flag:dead'` holds; and the intent-client test that a hidden NPC (state `npcs.guard.hidden = true`) is absent from the request context while a seen one is present (read `tests/engine/intent-client.test.ts` for how it inspects the posted body).

- [ ] **Step 2: Run** — `npx vitest run tests/engine/death.test.ts tests/engine/intent-client.test.ts` (and the isLit file). Expected: FAIL.

- [ ] **Step 3: Implement** in `death.ts`: at the top (after the no-death-block case) check `d.instead`; build `lines` from `message` entries, evaluating `{ if, text }` with `evaluateCondition`; pick `const v = d.variants?.find((x) => evaluateCondition(x.if, state, world))` before the resurrection, then use `v?.resurrection ?? d.resurrection`, `v?.respawn ?? d.respawn`, `v?.then ?? d.then`. Variants are evaluated before items scatter (conditions see the moment of death). `model.ts` `isLit`: return true first when `world.darkness?.litIf` holds. `intent-client.ts`: build the NPC list with `npcsSeen(world, state, state.currentRoom)`. Audit: check `variants[].respawn`/`then`, conditions in `variants[].if`, `instead[].if`, message `if`s and `litIf`. Types with comments.

- [ ] **Step 4: Run** — same command. Expected: PASS. Then `npx vitest run` for the whole suite (Office Space-shaped tests in brass use the fixture). Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Death variants, conditional death lines, dying while dead, always-lit; intent context uses seen characters"`

---

### Task 6: The dam and the reservoir

**Files:**
- Modify: `src/worlds/zork1.ts`
- Test: `tests/worlds/zork1-sessions.test.ts`, `tests/worlds/zork1.test.ts` (unit tests for timer edges), `tests/worlds/zork1-rooms.test.ts` (unchanged; must stay green)

**Interfaces:**
- Consumes: BURN/TURN/PLUG (Task 2), `{ if }`, `unvisit` (Task 3), `prefixed`, `findSeed`, `compare` (Task 1).
- Produces: rooms `dam_room`, `dam_lobby`, `maintenance_room`, `dam_base`, `reservoir_south`, `reservoir`, `reservoir_north`, `stream_view`, `deep_canyon` exits toward them; items `bolt`, `bubble`, `control_panel`, `yellow_button`, `brown_button`, `red_button`, `blue_button`, `leak`, `tube`, `putty`, `wrench`, `screwdriver`, `tool_chest`, `matchbook` (ZIL `MATCH`; ID `match`), `guide` (guidebook), `trunk` (trunk of jewels), `pump` (air pump, for 5b; present in Reservoir North), `water`/`global_water` as the ZIL has them; flags `gate_flag`, `gates_open`, `low_tide`; var `water_level`; scripts as needed. Later tasks rely on `low_tide`, `gates_open` and `match`.

- [ ] **Step 1: Transcribe from ZIL.** Rooms from `1dungeon.zil` (`DAM-ROOM`, `DAM-LOBBY`, `MAINTENANCE-ROOM`, `DAM-BASE`, `RESERVOIR-SOUTH`, `RESERVOIR`, `RESERVOIR-NORTH`, `STREAM-VIEW`) with their exits; routines from `1actions.zil`: `DAM-ROOM-FCN`, `BOLT-F`, `BUBBLE-F`, `BUTTON-F`, `I-MAINT-ROOM`, `LEAK-FUNCTION`, `FIX-MAINT-LEAK`, `TUBE-FUNCTION`, `PUTTY-FCN`, `TOOL-CHEST-FCN`, `I-REMPTY`, `I-RFILL`, `RESERVOIR-SOUTH-FCN`, `RESERVOIR-NORTH-FCN`, `RESERVOIR-FCN`, `MATCH-FUNCTION`, `I-MATCH`, `WATER-F`/`V-FILL`/`BOTTLE-FUNCTION`. Insert rooms where the story order puts them (the rooms test fails otherwise). Fuses: ZIL `QUEUE n` = `schedule in: n - 1` as established in 4a/4b (check an existing fuse in zork1.ts and match it). Exits that need a boat (`Stream View` → the stream, the reservoir's water at high tide) refuse in Zork's words. TOUCHBIT clears → `{ unvisit }`. Points: trunk VALUE 15, TVALUE 5 (a scoring entry `{ if: 'inside:trunk:trophy_case', points: 5 }` and `treasure: 15` with a find flag as the other treasures do). World verbs needed (check existing `verbs` first): `fill`, `pour`, `squeeze`, `count`.

- [ ] **Step 2: Write the sessions** (append to `tests/worlds/zork1-sessions.test.ts`), one `it` each, all through this shape:

```ts
async function session(name: string, commands: string[], seeds: { native: number; original: number }) {
  const original = await prefixed('original', commands, seeds.original);
  const native = await prefixed('native', commands, seeds.native);
  if (!original || !native) throw new Error(`${name}: a pinned seed no longer gets through the prefix (re-run findSeed)`);
  expect(compare(native, original, commands)).toEqual([]);
}

describe('5a sessions: the dam', () => {
  it('draining the reservoir', () =>
    session('dam', ['north', 'north', 'east', 'east', 'north', 'take wrench', 'take screwdriver', 'push yellow button', 'south', 'west', 'look', 'examine bubble', 'turn bolt with wrench', 'look', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'look', 'north', 'look', 'down', 'look', 'north', 'look'], { native: 1, original: 1 }));
  it('the leak, fixed', () =>
    session('leak', [/* route to the Maintenance Room (from the Round Room: the route in 'draining'), */ 'push blue button', 'wait', 'wait', 'squeeze tube', 'put putty on leak', 'wait', 'look'], { native: 1, original: 1 }));
  it('the leak, flooded', () =>
    session('flood', [/* route to the Maintenance Room, */ 'push blue button', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait'], { native: 1, original: 1 }));
  it('closing the gates refills it', () =>
    session('refill', [/* draining route, then */ 'turn bolt with wrench', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'look'], { native: 1, original: 1 }));
});
```

Routes: derive each from the ZIL exits (the Round Room's exits to the Loud Room / Deep Canyon side lead to the dam; check `ROUND-ROOM` and `DEEP-CANYON`), write the commands out in full (no comments left in the arrays), and replace each `{ native: 1, original: 1 }` with seeds from `findSeed` (a one-off script or a temporary `it.only` that logs them; delete it after). Ledger the routes and seeds as rulings.

- [ ] **Step 3: Run** — `npx vitest run tests/worlds/zork1-sessions.test.ts`. Expected: FAIL (rooms and items missing: the original's replies won't match the native “You can't go that way.”).

- [ ] **Step 4: Implement** the transcription from Step 1 in `zork1.ts`. Iterate until the sessions match; a mismatch is fixed in the native data (the story file wins). A difference that can't be closed (none expected) goes to `ALLOWED` in `zork1-allowlist.ts` with a reason and a ruling.

- [ ] **Step 5: Run** — `npx vitest run tests/worlds` . Expected: PASS (sessions, rooms order, audit, diff, thief, fight).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Zork I: the dam and the reservoir"`

---

### Task 7: The Loud Room and its passages

**Files:**
- Modify: `src/worlds/zork1.ts`
- Test: `tests/worlds/zork1-sessions.test.ts`, `tests/worlds/zork1-thief-unit.test.ts` (the bar)

**Interfaces:**
- Consumes: capture (Task 4), `low_tide`, `gates_open` (Task 6).
- Produces: rooms `chasm_room`, `ns_passage`, `loud_room`, `deep_canyon`, `damp_cave`; item `bar` (platinum bar, `treasure: 10`, `tags: ['sacred']` until the echo); flag `loud_flag`; var `loud_runs` (PICK-ONE state); script `loud_room_capture`.

- [ ] **Step 1: Transcribe from ZIL**: the five rooms; `LOUD-ROOM-FCN` (M-ENTER loop → `capture: { if: '!flag:loud_flag & !(gates closed at low tide)', script: 'loud_room_capture' }`, expressed with `&` and the flags: quiet when `loud_flag`, or `!gates_open & low_tide`), `V-ECHO`, the M-END ejection with `LOUD-RUNS` (port PICK-ONE: a table of the three rooms; each pick takes a random unused one, refilling when exhausted; keep the used set in vars `loud_runs_1..3` or a bitmask var), `I-RFILL`'s Loud Room branch, `DEEP-CANYON-F`'s water noise. The capture script: `ctx.parse`-free; it compares the raw word (west/east/up/w/e/u leave via `{ go }` normally (return nothing to decline for these, so movement runs as usual), `echo` → V-ECHO's lines + `{ set: 'loud_flag' }` + tag removal handled by the thief script reading `loud_flag`, `bug` → Zork's joke, anything else → Zork's echo form), every reply with `{ free: true }`. The thief script (`thiefTurn` in zork1.ts) skips items tagged `sacred` unless their sacredness is lifted: for the bar, `loud_flag`.

- [ ] **Step 2: Write the sessions:**

```ts
describe('5a sessions: the Loud Room', () => {
  it('echo', () => session('echo', ['east', 'look', 'hello', 'take bar', 'echo', 'look', 'take bar'], { native: 1, original: 1 }));
  it('thrown out at high tide with the gates open', () => session('thrown', [/* open the gates via the dam route from Task 6, return, */ 'east'], { native: 1, original: 1 }));
  it('quiet at low tide with the gates closed', () => session('quiet', [/* drain, close the gates, return, */ 'east', 'look', 'take bar'], { native: 1, original: 1 }));
});
```

(The Round Room's `east` goes to the Loud Room in Zork; confirm from `ROUND-ROOM`'s exits. Write routes in full; pin seeds with `findSeed`, choosing for 'thrown' a seed whose ejection lands in each of the three rooms across three runs if cheap; otherwise one.) Plus a thief unit test: with the bar in the Loud Room and the thief there, he doesn't take it until `loud_flag` is set.

- [ ] **Step 3: Run** — `npx vitest run tests/worlds/zork1-sessions.test.ts tests/worlds/zork1-thief-unit.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** Step 1. Iterate until the sessions match.

- [ ] **Step 5: Run** — `npx vitest run tests/worlds`. Expected: PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Zork I: the Loud Room and its passages"`

---

### Task 8: The mirrors, the caves, Atlantis and the dome

**Files:**
- Modify: `src/worlds/zork1.ts`
- Test: `tests/worlds/zork1-sessions.test.ts`

**Interfaces:**
- Consumes: quiet go, conditional steps (Task 3), the session harness.
- Produces: rooms `mirror_room_1`, `mirror_room_2`, `small_cave`, `tiny_cave`, `cold_passage`, `narrow_passage`, `winding_passage`, `twisting_passage`, `atlantis_room`, `engravings_cave`, `dome_room`, `torch_room`; items `mirror_1`, `mirror_2`, `trident` (`treasure: 4`, TVALUE 11), `railing`, `torch` (ivory torch, `treasure: 14`, TVALUE 6; a light that is always on and `flaming`); flags `unlucky` (mirror broken), `dome_flag`; world verbs `rub`, `tie`, `untie`, `jump`/`leap` if not present; script `mirror_mirror`; the tiny cave's candle daemon (the candles arrive in Task 9; the daemon's condition names `candles`, so add it in Task 9 if the audit requires the item to exist).

- [ ] **Step 1: Transcribe from ZIL**: the twelve rooms; `MIRROR-MIRROR` and `MIRROR-ROOM` (the swap: a script returning `move`/`moveNpc` steps for every child of both rooms via `ctx.children`, then `{ go: other, quiet: true }` and the rumble line); rub with an object → the tingle; break the mirror → `{ set: 'unlucky' }` and Zork's lines; `DOME-ROOM-FCN`, `ROPE-FUNCTION`, `UNTIE-FROM`, `TORCH-ROOM-FCN` (rope tied → `down` exit `if: 'flag:dome_flag'`, `climb down rope`, dropping the untied rope in the Dome sends it to the Torch Room); LEAP in the Dome → `die` with JUMPLOSS's random line (`{ chance }` branches or a script with `ctx.roll`); `CAVE2-ROOM` (the tiny cave: lit candles held may blow out, 50% lucky, ZPROB `50 > roll(300)` unlucky; write the daemon in Task 9 with the candles). Points: trident 4/11, torch 14/6.

- [ ] **Step 2: Write the sessions:**

```ts
describe('5a sessions: mirrors and the dome', () => {
  it('rubbing the mirror', () => session('mirror', [/* route to a Mirror Room, */ 'look', 'drop sword', 'rub mirror', 'look', 'rub mirror', 'look'], { native: 1, original: 1 }));
  it('rubbing it with something, and breaking it', () => session('mirror-break', [/* route, */ 'rub mirror with lamp', 'break mirror with sword', 'look'], { native: 1, original: 1 }));
  it('the rope and the torch', () => session('dome', [/* fetch the rope from the attic (house) then route to the Dome, */ 'look', 'tie rope to railing', 'down', 'look', 'take torch', 'up', 'untie rope'], { native: 1, original: 1 }));
  it('jumping from the dome', () => session('leap', [/* route to the Dome, */ 'jump'], { native: 1, original: 1 }));
  it('Atlantis', () => session('atlantis', [/* route via the reservoir at low tide (Task 6) or the caves, */ 'look', 'take trident'], { native: 1, original: 1 }));
});
```

(Routes written in full from the ZIL exits; seeds pinned.)

- [ ] **Step 3: Run** — `npx vitest run tests/worlds/zork1-sessions.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** Step 1; iterate to match.

- [ ] **Step 5: Run** — `npx vitest run tests/worlds`. Expected: PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Zork I: the mirrors, the caves, Atlantis and the dome"`

---

### Task 9: The temple, Hades and ghost mode

**Files:**
- Modify: `src/worlds/zork1.ts`
- Test: `tests/worlds/zork1-sessions.test.ts`, `tests/worlds/zork1.test.ts`

**Interfaces:**
- Consumes: BURN (Task 2), conditional/free steps, capture (Tasks 3–4), death variants and `litIf` (Task 5), `match` (Task 6), `unlucky` (Task 8).
- Produces: rooms `north_temple`, `south_temple`, `egypt_room`, `entrance_to_hades`, `land_of_living_dead` (Temple and Altar tagged `sacred`); items `bell`, `hot_bell`, `candles`, `book` (black book), `coffin` (`treasure: 10`, TVALUE 15), `sceptre` (`treasure: 4`, TVALUE 6, inside the coffin), `skull` (`treasure: 10`, TVALUE 10), `ghosts`, `bodies`; flags `xb`, `xc`, `lld_flag`, `dead`; vars `candle_life`, `match_count`; the death block gains `message` with Bad luck, `variants` (`visited:south_temple` → Zork's Hades text, respawn `entrance_to_hades`, then `ghost_begins`), `instead` (`flag:dead` → the talented-person text); `darkness.litIf: 'flag:dead'`; world `capture: { if: 'flag:dead', script: 'dead_function' }`.

- [ ] **Step 1: Transcribe from ZIL**: the five rooms; `SOUTH-TEMPLE-FCN` (down refused carrying the coffin), `V-PRAY` (at the Altar: to `forest_1`; dead: resurrect), `BELL-F`, `HOT-BELL-F`, `I-XB`, `I-XC`, `I-XBH`, `LLD-ROOM` (M-BEG/M-END: the exorcism sequence), `BLACK-BOOK`, `GHOSTS-F`, `CANDLES-FCN`, `I-CANDLES`, `CANDLE-TABLE` (40/20/10/5 with its lines; they start lit and the timer starts when first touched), `LIGHT-INT`, the candles' burn rule (`instead.burn` with `with: 'match'` while the match is lit; with the torch → vaporized), `MATCH-FUNCTION` count of 6 and COUNT, `CAVE2-ROOM`'s candle daemon (from Task 8), `JIGS-UP`'s branches (as death `message`/`variants`/`instead`), `DEAD-FUNCTION` (the capture script: `ctx.parse(ctx.line)`; decline for the verbs Zork lets a spirit do — movement, LOOK, PRAY, and the rest DEAD-FUNCTION passes — and return its refusal lines otherwise, with `{ free: true }` where Zork takes no time), the Dome's ghost pull-down, `KILL-INTERRUPTS` (fuses already cleared on death). PRAY when dead clears `dead`, restores normal play, moves to `forest_1` with Zork's text.

- [ ] **Step 2: Write the sessions:**

```ts
describe('5a sessions: the temple and Hades', () => {
  const toTemple: string[] = [/* from the Round Room to the Temple, in full */];
  it('the exorcism', () => session('exorcism', [...toTemple, 'take bell', 'south', 'take candles', 'take book', /* to the Dam Lobby for the matches, then to Hades, in full */ 'ring bell', 'take candles', 'light match', 'light candles with match', 'read book', 'south', 'look', 'take skull'], { native: 1, original: 1 }));
  it('reading too soon', () => session('read-first', [...toTemple, /* gather, go to Hades */ 'read book', 'ring bell', 'read book'], { native: 1, original: 1 }));
  it('the tension breaks', () => session('tension', [...toTemple, /* gather, go to Hades */ 'ring bell', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait'], { native: 1, original: 1 }));
  it('the hot bell', () => session('hot-bell', [...toTemple, /* gather incl. the bottle of water, go to Hades */ 'ring bell', 'take bell', 'pour water on bell', 'take bell'], { native: 1, original: 1 }));
  it('candles and matches run out', () => session('candles', [...toTemple, 'south', 'take candles', ...Array(80).fill('wait'), 'count matches'], { native: 1, original: 1 }));
  it('the coffin and the prayer', () => session('coffin', [/* to the Egyptian Room */ 'take coffin', /* to the Altar */ 'down', 'pray', 'look'], { native: 1, original: 1 }));
  it('ghost mode', () => session('ghost', [...toTemple, 'south', /* get killed (the dome jump or the troll's axe), */ 'look', 'take lamp', 'north', /* to the Altar */ 'pray', 'look'], { native: 1, original: 1 }));
});
```

Plus unit tests in `zork1.test.ts` for what sessions can't pin cheaply: the tiny cave blowing candles out at 50% lucky vs ZPROB unlucky (count over 400 seeded turns each, with tolerance), and dying while dead (“It takes a talented person…”, game over, UNDO restores, via `tests/stores` if needed).

- [ ] **Step 3: Run** — `npx vitest run tests/worlds/zork1-sessions.test.ts tests/worlds/zork1.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement** Step 1; iterate to match.

- [ ] **Step 5: Run** — `npx vitest run tests/worlds`. Expected: PASS.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Zork I: the temple, Hades and ghost mode"`

---

### Task 10: The walkthrough, scoring and the thief across 5a

**Files:**
- Modify: `tests/worlds/zork1-allowlist.ts` (`WALKTHROUGH`), `src/worlds/zork1.ts` (scoring entries, `sacred` tags, the thief's last-light line with `{ noDarkLine: true }`), `tests/worlds/zork1-thief-unit.test.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write failing tests:** extend `WALKTHROUGH` past its current end to collect the seven treasures (bar after the echo, trunk after draining, trident, torch, coffin with the sceptre, skull after the exorcism) and put them in the case, then `score`. A thief unit test: the thief takes the lit torch from a player whose only light it is, in a dark room: lines are his line only, no “It is now pitch black.”, and the room is dark after (seeded with `seedWhere`).

- [ ] **Step 2: Run** — `npx vitest run tests/worlds/zork1-diff.test.ts tests/worlds/zork1-thief-unit.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement:** scoring entries for the seven (find points the way existing treasures do, TVALUE as `{ if: 'inside:<id>:trophy_case', points }`); `sacred` tags on `north_temple` and `south_temple`; `{ noDarkLine: true }` after the thief's “seems to have left you in the dark” line (Task 3's step). If the walkthrough's SCORE line diverges only because of the fight's move count, it's already allowlisted.

- [ ] **Step 4: Run** — `npx vitest run tests/worlds`. Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Zork I: the walkthrough through 5a, its treasures and the thief"`

---

### Task 11: Docs, a recipe, 1.9.0

**Files:**
- Create: `src/worlds/examples/echo.ts` (a room that listens), `tests/worlds/examples/recipes.test.ts` (one more inline snapshot), `tests/worlds/examples/audit.test.ts` (add it)
- Modify: `docs/reference/world-schema.md`, `docs/reference/conditions-and-events.md`, `docs/reference/commands.md`, `docs/guide/building-worlds/recipes.md`, `docs/guide/building-worlds/index.md`, `docs/guide/porting-zork.md`, `docs/guide/how-it-works.md`, `CHANGELOG.md`, `package.json`, `server/package.json` (1.9.0; refresh both lockfiles with `npm install --package-lock-only --ignore-scripts`), `docs/superpowers/backlog.md`

- [ ] **Step 1: Write the recipe and its failing snapshot test.** `echo.ts`: two rooms; the cave has `capture: { if: '!flag:quiet', script: 'echo' }` whose script echoes any word twice, quiets on ECHO and declines for `out`; `#region` markers for the docs. In `recipes.test.ts`: `play(echo, ['in', 'hello', 'echo', 'hello', 'out'])` with `toMatchInlineSnapshot()`; add to `audit.test.ts`.
- [ ] **Step 2: Run** — `npx vitest run tests/worlds/examples`. Expected: snapshot written; read it and confirm it shows the echo, the quieting and the exit.
- [ ] **Step 3: Docs.** world-schema: `capture` (Room, World), `ctx.line`, `ctx.parse`, `burnable`, `flaming`, death `message` conditions, `variants`, `instead`, `darkness.litIf`. conditions-and-events: `{ if, then, else }`, `{ go, quiet }`, `{ unvisit }`, `{ free }`, `{ noDarkLine }`. commands: BURN (LIGHT … WITH, IGNITE), TURN … WITH, PLUG … WITH, TURN ON … WITH. recipes + index: the listening room. porting-zork: raw-input loops → capture; TOUCHBIT → `unvisit`; PICK-ONE; ZPROB and LUCKY; JIGS-UP's branches → death variants; ALWAYS-LIT → `litIf`; the seeded original and the scripted sessions; the coverage paragraph and What's next. how-it-works: capture in the pipeline (before parsing, per piece). CHANGELOG 1.9.0 in the 1.8.0 entry's style. Backlog: strike the two items picked up, with “(1.9.0)”.
- [ ] **Step 4: Check** — `npm run docs:build && npm run lint && npm run type-check && npm run test:coverage && (cd server && npm test)`. Expected: all pass, coverage over thresholds.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "1.9.0: docs and a recipe for capture, BURN and the new steps"`

---

### Task 12: Office Space

- [ ] Sync with `scripts/sync-from-public.sh ../brass-lantern` on a new branch `engine-parity-stage-5a`; Office Space's tests should pass unchanged (its store tests exercise the capture call with no captures defined). Bump to 1.9.0 with a CHANGELOG entry (visible changes: BURN/IGNITE and LIGHT … WITH are understood; TURN … WITH and PLUG … WITH answer “This has no effect.”; check each against the real world with a throwaway test before writing it). Run lint, type-check, coverage, build, server tests. Commit, push, open the PR. After the final review and CI, with the owner's go-ahead: merge both, tag `v1.9.0` on each (Office Space deploys), publish the brass-lantern release, check the live site.

---

## Self-review notes

- **Spec coverage:** with-objects/BURN → 2; capture → 4; quiet go, unvisit, conditional → 3; seeded original → 1; backlog (dark line, intent context) → 3, 5, 10; the dam and reservoir → 6; the Loud Room → 7; mirrors, temple, dome → 8, 9; Hades and ghost mode → 9; scoring and the thief → 10; testing → 1, 6–10; docs and release → 11, 12.
- **Deferred to execution with rulings:** exact command routes (from the ZIL exits), the pinned seeds, Zork's exact strings (from the ZIL, then the story file), the fuse offsets (matching 4a/4b's convention).
- **Type consistency:** `captureLine`, `scriptSteps(…, line)`, `turnFree`, `darkLineSaid`, `enterRoom(…, opts)`, `prefixed`, `findSeed`, `compare`, `originalRun`, `nativeRun`, `Death.variants`/`instead`, `Darkness.litIf` are used under these names throughout.
