# Engine parity, stage 5b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generic vehicles and Zork's dark-move grue in the engine; native Zork I gains the boat, the Frigid River, the banks, the rainbow and the canyon (17 rooms, three treasures), every puzzle checked against zork1.z3 by seeded sessions.

**Architecture:** Three engine tasks first (vehicle state and verbs; vehicle movement, rules and description; dark moves), each unit-tested on the fixture world. Then four content tasks in `src/worlds/zork1.ts`, each with its sessions in `tests/worlds/zork1-sessions.ts` + `zork1-sessions.test.ts` (the 5a harness, `tests/worlds/zsession.ts`). Docs and the Office Space sync close it.

**Tech Stack:** TypeScript 6, Vue 3/Pinia, Vitest 5, ifvms (tests only), Express intent server.

**Spec:** `docs/superpowers/specs/2026-10-06-engine-parity-stage-5b-design.md`. ZIL: `/tmp/zork1-src` (clone `https://github.com/historicalsource/zork1` there if missing). Story: `tests/fixtures/zork1.z3`.

## Global Constraints

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes. Worlds without vehicles behave exactly as before.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.
- A new built-in verb goes in four places: the parser regex and `BUILT_IN_WORDS` (`src/engine/parser.ts`), the dispatcher (`src/engine/engine.ts`, in `withRules`), HELP (`src/engine/verbs/meta.ts`), `ACTION_VOCAB` + prompt (`server/src/llm.ts`).
- Tests run in the node environment; DOM-using files start with `// @vitest-environment happy-dom`. Session tests need it (saves use localStorage).
- Zork timer convention (5a): a ZIL `QUEUE n` from an action is `schedule in: n - 1`; a re-queue from inside a fuse is `schedule in: n`.

## Tools carried over from 5a

- `tests/worlds/zsession.ts`: `prefixed(side, commands, seed)`, `findSeed`, `compare` (move counts in SCORE normalized), `openOriginal`, `openNative`, `PREFIX`.
- `tests/zz/` (untracked, in `.git/info/exclude`): `seeds.test.ts` finds pinned seeds for every exported session table in `tests/worlds/zork1-sessions.ts` (env `SESSIONS=a,b`, `SAME_ROOM=…`/`SAME_LAST=…` to make a random branch agree with the original's). If it's missing, recreate it from git history of this plan's predecessor (5a) or from this skeleton:

```ts
// @vitest-environment happy-dom
import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { findSeed, normalize, prefixed } from '../worlds/zsession';
import * as S from '../worlds/zork1-sessions';
const ALL: Record<string, string[]> = Object.assign({}, ...Object.values(S).filter((v) => typeof v === 'object' && !Array.isArray(v)));
const SAME_LAST = new Set((process.env.SAME_LAST ?? '').split(',').filter(Boolean));
it('seeds', async () => {
  writeFileSync('/tmp/seeds.txt', '');
  for (const name of process.env.SESSIONS ? process.env.SESSIONS.split(',') : Object.keys(ALL)) {
    const c = ALL[name];
    const original = await findSeed('original', c).catch(() => -1);
    const theirs = original > 0 ? await prefixed('original', c, original) : null;
    const accept = (r: string[][]) => !SAME_LAST.has(name) || normalize(r.at(-1) ?? []) === normalize(theirs?.at(-1) ?? []);
    const native = await findSeed('native', c, accept).catch(() => -1);
    appendFileSync('/tmp/seeds.txt', `${name}: { native: ${native}, original: ${original} },\n`);
  }
}, 900_000);
```

Run suites with `npx vitest run --exclude "tests/zz/**"`.

## Review Focus

1. Saving and restoring while aboard (the `aboard` field round-trips; a 1.9.0 save without it loads not aboard). (Task 1 test.)
2. A vehicle carried away from the room it's boarded in can't happen: TAKE vehicle while aboard refuses, and a script moving the vehicle elsewhere while aboard leaves the player aboard nothing (`aboard` cleared). (Task 1 test.)
3. UNDO across BOARD/DISEMBARK restores both `aboard` and the vehicle's place. (Task 2 test, store level.)
4. A dark-to-dark move in a lit-by-carried-lamp state never rolls (only unlit to unlit). (Task 3 test.)
5. Office Space and the brass fixture: no new lines in any existing transcript (the full existing suite is the check; plus one test that a brass world without vehicles has an unchanged header). (Task 2 test.)

---

### Task 1: Vehicle state, conditions, helpers, effects, BOARD and DISEMBARK

**Files:**
- Modify: `src/types/world.ts` (Item `vehicle`, Room `water`, Effect `board`/`disembark`), `src/types/game.ts` (`aboard?`), `src/engine/conditions.ts` (`aboard`, `water`), `src/engine/scripts.ts` (`aboard()`, `water()`), `src/engine/effects.ts`, `src/engine/parser.ts`, `src/engine/engine.ts`, `src/engine/verbs/meta.ts`, `server/src/llm.ts`, `src/engine/model.ts` (`isWater`, reach includes the vehicle's contents)
- Create: `src/engine/verbs/vehicle.ts`
- Test: `tests/engine/vehicle.test.ts`, `tests/engine/parser.test.ts`, `server/src/routes/parse-intent.test.ts`, `tests/helpers/audit.ts` (+ its test)

**Interfaces:**
- Produces: `Item.vehicle?: { travels: 'water' }`; `Room.water?: boolean | string`; `GameState.aboard?: string`; `isWater(world, state, roomId?): boolean` (model.ts); conditions `aboard`, `aboard:ITEM`, `water:here`, `water:ROOM`; `ctx.aboard(): string | undefined`, `ctx.water(room?: string): boolean`; effects `{ board: string }`, `{ disembark: true }`; actions `board` (target), `disembark` (target optional); `handleBoard`, `handleDisembark` in `verbs/vehicle.ts`.

- [ ] **Step 1: Write failing tests** in `tests/engine/vehicle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '@/engine/conditions';
import { runSteps } from '@/engine/effects';
import { execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import type { ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

// A raft in the yard; the cellar is water (a flooded cellar).
export const boatWorld: World = {
  ...fixtureWorld,
  style: 'infocom',
  rooms: {
    ...fixtureWorld.rooms,
    yard: { ...fixtureWorld.rooms.yard, items: [...fixtureWorld.rooms.yard.items, 'raft'] },
    cellar: { ...fixtureWorld.rooms.cellar, water: true },
  },
  items: {
    ...fixtureWorld.items,
    raft: { name: 'raft', description: 'A raft.', portable: true, tags: [], vehicle: { travels: 'water' }, container: { open: true } },
  },
};
const run = (s: ReturnType<typeof stateWith>, a: ParsedAction, w: World = boatWorld) => execute(a, { world: w, state: s });

describe('boarding and leaving', () => {
  it('BOARD gets in, with Zork’s refusals', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    expect(run(s, { action: 'board', target: 'bat' }).lines).toEqual(['You have a theory on how to board a bat, perhaps?']);
    expect(run(s, { action: 'board', target: 'raft' }).lines).toEqual(['You are now in the raft.']);
    expect(s.aboard).toBe('raft');
    expect(run(s, { action: 'board', target: 'raft' }).lines).toEqual(['You are already in the raft!']);
  });
  it('the vehicle must be on the ground', () => {
    const s = stateWith(boatWorld, { room: 'yard', carrying: ['raft'] });
    expect(run(s, { action: 'board', target: 'raft' }).lines).toEqual(['The raft must be on the ground to be boarded.']);
  });
  it('DISEMBARK gets out, but not on water', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    expect(run(s, { action: 'disembark' }).lines).toEqual(['You’re not in that!']);
    s.aboard = 'raft';
    expect(run(s, { action: 'disembark' }).lines).toEqual(['You are on your own feet again.']);
    expect(s.aboard).toBeUndefined();
    const w = stateWith(boatWorld, { room: 'cellar' });
    w.locations.raft = 'cellar';
    w.aboard = 'raft';
    expect(run(w, { action: 'disembark' }).lines).toEqual(['You realize that getting out here would be fatal.']);
  });
  it('aboard: DROP puts things in the vehicle, TAKE vehicle refuses, room things stay in reach', () => {
    const s = stateWith(boatWorld, { room: 'yard', carrying: ['key'] });
    s.aboard = 'raft';
    run(s, { action: 'drop', target: 'key' });
    expect(s.locations.key).toBe('raft');
    expect(run(s, { action: 'take', target: 'raft' }).lines).toEqual(['You’re inside of it!']);
    expect(run(s, { action: 'take', target: 'bat' }).lines.join(' ')).toMatch(/Taken/);
  });
  it('parses BOARD, GET IN, DISEMBARK, GET OUT, EXIT', () => {
    expect(fallbackParse('board raft')).toEqual({ action: 'board', target: 'raft' });
    expect(fallbackParse('get in the raft')).toEqual({ action: 'board', target: 'raft' });
    expect(fallbackParse('disembark')).toEqual({ action: 'disembark' });
    expect(fallbackParse('get out of raft')).toEqual({ action: 'disembark', target: 'raft' });
    expect(fallbackParse('exit')).toEqual({ action: 'disembark' });
  });
});

describe('conditions, helpers and effects', () => {
  it('aboard and water', () => {
    const s = stateWith(boatWorld, { room: 'cellar' });
    expect(evaluateCondition('water:here', s, boatWorld)).toBe(true);
    expect(evaluateCondition('water:yard', s, boatWorld)).toBe(false);
    expect(evaluateCondition('aboard', s, boatWorld)).toBe(false);
    runSteps([{ board: 'raft' }], boatWorld, s);
    expect(evaluateCondition('aboard:raft', s, boatWorld)).toBe(true);
    runSteps([{ disembark: true }], boatWorld, s);
    expect(s.aboard).toBeUndefined();
  });
  it('water can be a condition (a reservoir that drains)', () => {
    const w: World = { ...boatWorld, rooms: { ...boatWorld.rooms, cellar: { ...boatWorld.rooms.cellar, water: '!flag:drained' } } };
    const s = stateWith(w, { room: 'cellar' });
    expect(evaluateCondition('water:here', s, w)).toBe(true);
    s.flags.drained = true;
    expect(evaluateCondition('water:here', s, w)).toBe(false);
  });
  it('a script moving the vehicle away leaves the player aboard nothing', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    s.aboard = 'raft';
    runSteps([{ move: 'raft', to: null }], boatWorld, s);
    expect(s.aboard).toBeUndefined();
  });
  it('saves without `aboard` load not aboard', async () => {
    const { migrateSave } = await import('@/engine/migrate');
    const s = stateWith(boatWorld, { room: 'yard' });
    const raw = JSON.parse(JSON.stringify({ version: 2, state: s, output: [] }));
    delete raw.state.aboard;
    expect(migrateSave(boatWorld, JSON.stringify(raw))?.state.aboard).toBeUndefined();
  });
});
```

(Check `migrateSave`'s real signature and the save envelope in `src/engine/migrate.ts` and `src/services/persistence.ts`, and adjust the last test to match; it pins Review Focus 1. Add `ctx.aboard()`/`ctx.water()` assertions to the existing script-helper tests in `tests/engine/scripts.test.ts`.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/vehicle.test.ts`. Expected: FAIL (unknown actions, missing fields).

- [ ] **Step 3: Implement.**
  - Types: `vehicle`, `water`, `aboard` (comments citing VEHBIT/VTYPE/NONLANDBIT), effects `{ board: string }`, `{ disembark: true }`.
  - `model.ts`: `export function isWater(world, state, roomId = state.currentRoom)`: `const w = world.rooms[roomId]?.water; return typeof w === 'string' ? evaluateCondition(w, state, world) : Boolean(w);`. In `roots()`, add the vehicle's children when aboard (they're already children of the room's vehicle item if the vehicle is an open container; make sure the vehicle itself is in reach and its contents are walked by `collect`).
  - `moveItem`: if the moved item is `state.aboard` and its new place isn't the player's room, clear `aboard`.
  - Conditions: `case 'aboard': result = value ? state.aboard === value : Boolean(state.aboard);` and `case 'water': result = world ? isWater(world, state, value === 'here' || !value ? state.currentRoom : value) : false;`; `conditionProblems`: `aboard:` requires an item when given, `water:` a room unless `here`.
  - `scripts.ts`: `aboard: () => state.aboard`, `water: (room) => isWater(world, state, room ?? state.currentRoom)`.
  - `effects.ts`: `board` sets `state.aboard` if the item exists and is a vehicle in the room; `disembark` clears it.
  - `verbs/vehicle.ts`:

```ts
export function handleBoard(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const id = pickItem(action.target, visibleItems(world, state), world, 'target', state);
  if (!id) return miss(`You don’t see a “${action.target}” here.`);
  const item = world.items[id];
  if (!item.vehicle) return ok([`You have a theory on how to board a ${item.name}, perhaps?`]);
  if (state.aboard === id) return ok([`You are already in the ${item.name}!`]);
  if (state.locations[id] !== state.currentRoom) return ok([`The ${item.name} must be on the ground to be boarded.`]);
  state.aboard = id;
  return ok([`You are now in the ${item.name}.`], true);
}

export function handleDisembark(action: ParsedAction, world: World, state: GameState): EngineResult {
  const id = state.aboard;
  const named = action.target ? pickItem(action.target, visibleItems(world, state), world, 'target', state) : id;
  if (!id || (action.target && named !== id)) return ok(['You’re not in that!']);
  if (isWater(world, state)) return ok(['You realize that getting out here would be fatal.']);
  state.aboard = undefined;
  return ok(['You are on your own feet again.'], true);
}
```

  - `handleDrop` (objects.ts): when `state.aboard`, move to the vehicle instead of the room; dropping the vehicle itself disembarks (`handleDisembark`). `takeItem`: `if (id === state.aboard) return ok(['You’re inside of it!'])`.
  - Parser `RE`: `board: /^(?:board|get\s+(?:in|into|on)|climb\s+(?:in|into|on)|sit\s+in)\s+(?:the\s+)?(.+)$/i`, `disembark: /^(?:disembark|get\s+out(?:\s+of)?|get\s+off|exit|stand(?:\s+up)?)(?:\s+(?:the\s+)?(.+))?$/i` placed before `enter`/`climb`/`movement` in `VERB_PATTERNS` (check `exit` isn't a movement exit label in the fixture or zork1; if it is, keep `exit` alone mapping to `disembark` only when aboard is impossible to know in the parser — then route bare `exit` through the dispatcher: `disembark` with no vehicle aboard falls back to `handleGo('out')`/`'exit'` exit label; write that fallback and a test for it). Add `board`, `disembark`, `get in`, `get out`, `get off`, `exit`, `stand` to `BUILT_IN_WORDS` as needed.
  - Dispatcher: `case 'board': return withRules('board', action, world, state, () => handleBoard(action, world, state));` and the same for `disembark`. HELP lines. `ACTION_VOCAB` + prompt lines (“board: get into a vehicle”, “disembark: get out of one”) and a server test like 5a's.
  - Audit: `vehicle` items need `container`? (no; just check `water` conditions with `conditionProblems`), `board` effect names an item.

- [ ] **Step 4: Run** — `npx vitest run tests/engine tests/stores && (cd server && npx vitest run)`. Expected: PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Vehicles: aboard, water, BOARD and DISEMBARK"`

---

### Task 2: Vehicle movement, rules and description

**Files:**
- Modify: `src/engine/verbs/movement.ts` (`followExit`, `enterRoom`), `src/engine/rules.ts` (`findRule` asks the vehicle before the room), `src/engine/engine.ts` (`roomEnd` uses the vehicle's `onEnd` while aboard), `src/types/world.ts` (Item `onEnd?`), `src/engine/describe.ts` (header and listing), `src/engine/death.ts` (clear `aboard`), `src/engine/verbs/meta.ts` (status line stays the room)
- Test: `tests/engine/vehicle.test.ts`, `tests/stores/game.test.ts` (UNDO), `tests/engine/describe.test.ts` or the existing describe tests

**Interfaces:**
- Consumes: Task 1's `aboard`, `isWater`, `vehicle`.
- Produces: `World.vehicleTexts?` is **not** added; the refusals are engine strings using the vehicle's name: “You can’t go there without a vehicle.”, “You can’t go there in a *name*.”, “The *name* comes to a rest on the shore.”; `Item.onEnd?: Array<{ if: string; then: string | EventStep[] }>`.

- [ ] **Step 1: Write failing tests** (append to `tests/engine/vehicle.test.ts`):

```ts
describe('moving with a vehicle', () => {
  it('water needs a vehicle; the vehicle needs water; landing keeps you aboard', () => {
    const s = stateWith(boatWorld, { room: 'shed' });
    s.locations.key = 'player';
    expect(run(s, { action: 'go', target: 'down' }).lines).toEqual(['You can’t go there without a vehicle.']);
    expect(s.currentRoom).toBe('shed');
    s.locations.raft = 'shed';
    s.aboard = 'raft';
    expect(run(s, { action: 'go', target: 'south' }).lines).toEqual(['You can’t go there in a raft.']);
    run(s, { action: 'go', target: 'down' });
    expect(s.currentRoom).toBe('cellar');
    expect(s.locations.raft).toBe('cellar');
    const up = run(s, { action: 'go', target: 'up' }).lines;
    expect(up[0]).toBe('The raft comes to a rest on the shore.');
    expect(s.currentRoom).toBe('shed');
    expect(s.aboard).toBe('raft');
    expect(s.locations.raft).toBe('shed');
  });
  it('a scripted move takes the vehicle along', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    s.aboard = 'raft';
    runSteps([{ go: 'living' }], boatWorld, s);
    expect(s.locations.raft).toBe('living');
  });
  it('the vehicle’s rules come before the room’s, and its onEnd replaces the room’s', () => {
    const w: World = {
      ...boatWorld,
      items: { ...boatWorld.items, raft: { ...boatWorld.items.raft, instead: { go: [{ say: ['Read the label.'] }] }, onEnd: [{ if: 'aboard:raft', then: ['The raft bobs.'] }] } },
      rooms: { ...boatWorld.rooms, yard: { ...boatWorld.rooms.yard, onEnd: [{ if: 'in:yard', then: ['Birds sing.'] }] } },
    };
    const s = stateWith(w, { room: 'yard' });
    s.aboard = 'raft';
    expect(run(s, { action: 'go', target: 'north' }, w).lines).toEqual(['Read the label.', 'The raft bobs.']);
  });
  it('the header names the vehicle; its contents are listed, it isn’t', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    s.aboard = 'raft';
    s.locations.key = 'raft';
    const look = run(s, { action: 'look' }).lines;
    expect(look[0]).toBe('📍 Yard, in the raft');
    expect(look.join(' ')).not.toMatch(/There is a raft here/);
    expect(look.join(' ')).toMatch(/The raft contains:/);
  });
  it('brass worlds without vehicles keep their header', () => {
    const s = stateWith(fixtureWorld, { room: 'yard' });
    expect(execute({ action: 'look' }, { world: fixtureWorld, state: s }).lines[0]).toBe('📍 Yard');
  });
  it('dying clears aboard and leaves the vehicle where you died', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    s.aboard = 'raft';
    runSteps([{ die: 'Splash.' }], boatWorld, s);
    expect(s.aboard).toBeUndefined();
    expect(s.locations.raft).toBe('yard');
  });
});
```

And in `tests/stores/game.test.ts` (happy-dom): with the fixture world mutated in a try/finally to add the raft (as 5a's capture store test does), BOARD then UNDO restores `aboard` undefined and the raft's place (Review Focus 3).

(The fixture's `shed` requires `has:key`; that's why the test carries the key. `shed`'s `down` goes to `cellar`, `south` to `yard`.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/vehicle.test.ts tests/stores/game.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `followExit`, after denials and before `enterRoom`: `const v = state.aboard; const toWater = isWater(world, state, to);` — not aboard and `toWater` → `ok(['You can’t go there without a vehicle.'])` (understood, no move, Zork's NO-GO-TELL takes a turn); aboard and (`!toWater && !isWater(world, state)` or the vehicle can't travel `toWater`'s kind) → `ok([\`You can’t go there in a ${name}.\`])`.
  - `enterRoom`: remember `const fromWater = isWater(world, state)` before moving; after `state.currentRoom = targetId`, if aboard move the vehicle there (`state.locations[aboard] = targetId`); if aboard and `fromWater && !isWater(world, state, targetId)`, prepend `The ${name} comes to a rest on the shore.` and `''`.
  - `findRule`: when `state.aboard`, the vehicle's item rules are asked after item/NPC owners and **before** the room (Zork's M-BEG to the vehicle). Implement by adding `[world.items[state.aboard], ids.indirect ?? ids.target, undefined]` before the room owner (findRule needs `state`; it has it).
  - `roomEnd`: `const owner = state.aboard ? world.items[state.aboard] : world.rooms[state.currentRoom]; for (const e of owner?.onEnd ?? [])…`. Type: `Item.onEnd?`.
  - `describeRoom`: header `📍 ${room.name}` + (aboard: infocom `, in the ${name}`, brass ` (in the ${name})`); exclude `state.aboard` from `visibleItemsIn`'s list; after the room's things, push `contentsLines(world, state, state.aboard)` (it prints “The raft contains:” lines for an open container).
  - `die()`: clear `state.aboard` at the start (before scatter, so the vehicle isn't carried).
  - Audit: item `onEnd` conditions and events, like rooms'.

- [ ] **Step 4: Run** — `npx vitest run --exclude "tests/zz/**"`. Expected: PASS (whole suite: Review Focus 5).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Vehicles: moving, rules and description"`

---

### Task 3: Dark moves

**Files:**
- Modify: `src/types/world.ts` (`darkness.stumble`), `src/engine/verbs/movement.ts` (`enterRoom` and the `blunder` water guard), `src/worlds/zork1.ts` (the stumble block), `tests/helpers/audit.ts`
- Test: `tests/engine/light.test.ts`, `tests/worlds/zork1.test.ts`

**Interfaces:**
- Produces: `darkness.stumble?: { chance: number; then: EventStep[]; aboard?: EventStep[] }`.

- [ ] **Step 1: Write failing tests** (append to `tests/engine/light.test.ts`):

```ts
describe('dark moves (5b)', () => {
  const w = async () => {
    const { fixtureWorld } = await import('../fixtures/world');
    return {
      ...fixtureWorld,
      rooms: { ...fixtureWorld.rooms, shed: { ...fixtureWorld.rooms.shed, dark: true, requires: undefined } },
      darkness: { ...fixtureWorld.darkness, stumble: { chance: 100, then: [{ die: 'Grue.' }] } },
    };
  };
  it('unlit to unlit may kill', async () => {
    const world = await w();
    const { stateWith } = await import('../helpers/state');
    const { execute } = await import('@/engine/engine');
    const s = stateWith(world, { room: 'shed' });
    expect(execute({ action: 'go', target: 'down' }, { world, state: s }).lines[0]).toBe('Grue.');
  });
  it('never with a light, never from a lit room, never into water', async () => {
    const world = await w();
    const { stateWith } = await import('../helpers/state');
    const { execute } = await import('@/engine/engine');
    const lit = stateWith(world, { room: 'shed', carrying: ['lamp'] });
    lit.itemState.lamp = { on: true };
    expect(execute({ action: 'go', target: 'down' }, { world, state: lit }).lines[0]).not.toBe('Grue.');
    const fromLit = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'go', target: 'north' }, { world, state: fromLit }).lines[0]).not.toBe('Grue.');
    const wet = { ...world, rooms: { ...world.rooms, cellar: { ...world.rooms.cellar, water: true } } };
    const s = stateWith(wet, { room: 'shed' });
    s.locations.raft = 'shed';
    expect(execute({ action: 'go', target: 'down' }, { world: wet, state: s }).lines[0]).not.toBe('Grue.');
  });
});
```

(Check the fixture's lamp is a light in reach when carried and on; Review Focus 4.) And in `zork1.test.ts`: from the dark cellar without a light, `north` into the dark Troll Room… only if the Troll Room is dark natively; otherwise East of Chasm → Gallery? Pick two adjacent dark native rooms (the maze: `maze_1` → `maze_2`), and assert that over 400 seeds about 80% die with GRUE (tolerance ±6%).

- [ ] **Step 2: Run** — `npx vitest run tests/engine/light.test.ts tests/worlds/zork1.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** in `enterRoom`: `const wasLit = isLit(world, state)` before moving; after moving (before onEnter/describe), if `world.darkness?.stumble && !wasLit && !isLit(world, state) && !isWater(world, state)`, roll `nextRandom(state) * 100 < chance`; on a hit return `runSteps(state.aboard && stumble.aboard ? stumble.aboard : stumble.then, world, state)`. Don't roll for `{ go, quiet }` moves? Zork's GOTO rolls for every GOTO; keep it for all moves except resurrection respawns (die's goTo: pass a flag or roll only when `wasLit` is computed from a room the player was alive in — simplest: skip when `state.gameOver` or the move comes from `die`; add `opts.noStumble` used by death). In `handleGo`'s blunder branch add `&& !isWater(world, state)`. zork1: `darkness.stumble: { chance: 80, then: [{ die: GRUE }], aboard: [{ die: 'Oh, no! A lurking grue slithered into the magic boat and devoured you!' }] }` (exact text from GOTO in gverbs.zil). Audit: steps in `stumble`.

- [ ] **Step 4: Run** — `npx vitest run --exclude "tests/zz/**"`. Expected: PASS (5a sessions keep a lamp lit; if one walks dark-to-dark unlit, its seeds may need re-finding — ledger it).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Zork's grue for dark-to-dark moves"`

---

### Task 4: The boat

**Files:**
- Modify: `src/worlds/zork1.ts`, `tests/worlds/zsession.ts` (a longer prefix for boat sessions), `tests/worlds/zork1-sessions.ts`, `tests/worlds/zork1-sessions.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: items `inflatable_boat` (existing pile), `inflated_boat` (the magic boat: `vehicle: { travels: 'water' }`, open container, `onEnd`/`instead.go` per RBOAT-FUNCTION), `punctured_boat`, `boat_label` (tan label, readable); world verbs `inflate`, `deflate`, `pump`, `blow`, `launch`, `land` (`go: true`); flags `deflate` (White Cliffs) and `boat_label_touched`; `BOAT_PREFIX` in zsession: PREFIX + to Reservoir North at low tide for the pump, back to Dam Base.

- [ ] **Step 1: Transcribe from ZIL:** IBOAT-FUNCTION, RBOAT-FUNCTION, DBOAT-FUNCTION, V-INFLATE, V-DEFLATE, V-PUMP, V-BREATHE, V-BLOW-IN (gverbs), PRE-BOARD's weapon puncture check, BOAT-LABEL text, and the puncture/repair texts; RBOAT M-BEG's walk refusals (“Read the label for the boat’s instructions.” for every direction except LAND, east, west; plus north/south at the Reservoir, south at the Stream) as the magic boat's `instead.go` rules with conditions on the room; DROP/PUT/attack-with a weapon aboard → puncture (lines, items to the room, player off the boat; on water, the right death).
- [ ] **Step 2: Write sessions** (in `zork1-sessions.ts`, a `BOAT_SESSIONS` table, run from `BOAT_PREFIX`'s end at Dam Base, carrying the pump and the putty; build the prefix from 5a's routes: drain the reservoir, take the pump at Reservoir North, the putty from the Maintenance Room's tube, back to Dam Base, and drop the sword so boarding doesn't puncture):
  - `inflate`: `look`, `inflate plastic`, `inflate plastic with lungs`, `blow in plastic`, `inflate plastic with screwdriver` (or another carried tool), `inflate plastic with pump`, `look`, `inflate boat with pump`, `read label`, `deflate boat`, `inflate plastic with pump`.
  - `board`: `inflate plastic with pump`, `board boat`, `board boat`, `look`, `north`, `take boat`, `drop pump`, `look`, `disembark`, `disembark`, `take pump`.
  - `puncture`: `inflate plastic with pump`, `take sword` (from where the prefix dropped it, or carry it), `board boat`, `inflate boat with pump`, `put gunk on boat`, `inflate plastic with pump`.
  Write each list in full; pin seeds with `tests/zz/seeds.test.ts`; register the table in `zork1-sessions.test.ts`'s `GROUPS` and `SEEDS`.
- [ ] **Step 3: Run** — `npx vitest run tests/worlds/zork1-sessions.test.ts -t boat`. Expected: FAIL.
- [ ] **Step 4: Implement** Step 1; iterate to match.
- [ ] **Step 5: Run** — `npx vitest run tests/worlds`. Expected: PASS.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "Zork I: the boat"`

---

### Task 5: The river and the stream

**Files:**
- Modify: `src/worlds/zork1.ts`, session files

**Interfaces:**
- Consumes: Task 4's boat and `launch`/`land` verbs.
- Produces: rooms `river_1`..`river_5`, `in_stream` (water), the Reservoir with `water: '!flag:low_tide'` (replacing its 5a denials with real exits: up/west to `in_stream`), Stream View's launch; fuse `river_current`; RIVER-LAUNCH as per-room `instead.launch` rules.

- [ ] **Step 1: Transcribe from ZIL:** RIVER-1..5 and IN-STREAM rooms (1dungeon 2190–2404), RIVR4-ROOM, RIVER-FUNCTION, I-RIVER, RIVER-SPEEDS, RIVER-NEXT, RIVER-LAUNCH, STREAM-FUNCTION; launch replies (“You are on the river, or have you forgotten?” with reservoir/stream; “You can’t launch it here.”; not aboard: “You can’t launch that by saying “launch”!”). The current: launching schedules `river_current` in `speed - 1`; the fuse prints “The flow of the river carries you downstream.”, a blank line, `{ go: next }`, and schedules itself in the new room's speed; at River 5, the falls death; off the river, nothing (and no re-queue). Launching from the Shore (speed 1) runs the current at once with `{ run: 'river_current' }`.
- [ ] **Step 2: Write sessions** (`RIVER_SESSIONS`): `downriver` (launch at Dam Base, `wait`s until the falls — dying, so drop things first), `landings` (launch, land at White Cliffs North on River 3, launch again, land at Sandy Beach on River 4, … the Shore), `stream` (Stream View: launch, `east`/`down` into the Reservoir at high tide, `look`, `land` at Reservoir South), `wrong-launch` (`launch` not aboard; aboard on land at the Dam; on the river).
- [ ] **Step 3–6:** run (FAIL), implement, run `tests/worlds` (PASS), commit `Zork I: the river and the stream`.

---

### Task 6: The banks: White Cliffs, Sandy Beach and Cave, the Shore, the buoy

**Files:**
- Modify: `src/worlds/zork1.ts`, session files

**Interfaces:**
- Produces: rooms `white_cliffs_north`, `white_cliffs_south`, `sandy_beach`, `sandy_cave`, `shore`; items `shovel`, `scarab` (hidden; `treasure: 5`), `buoy` (closed container, FDESC), `emerald` (`treasure: 10`, scored on opening the buoy); var `beach_dig`; Damp Cave's east exit → `white_cliffs_north`.

- [ ] **Step 1: Transcribe from ZIL:** the five rooms, WHITE-CLIFFS-FUNCTION (the narrow paths and DEFLATE), SAND-FUNCTION and BDIGS (dig counter, scarab, collapse death), V-DIG's replies, the buoy (TREASURE-INSIDE: the emerald scores on OPEN — a `took_emerald` flag set by the buoy's `after.open`), the shovel.
- [ ] **Step 2: Write sessions** (`BANK_SESSIONS`): `cliffs` (on foot with the folded boat: the paths; with the inflated boat carried: “The path is too narrow.”), `dig` (`dig sand`, `dig sand with pump`, four `dig in sand with shovel`, `take scarab`, `dig in sand with shovel` → collapse; drop things first), `buoy` (on River 4: `take buoy`, land, `open buoy`, `take emerald`, `score`).
- [ ] **Step 3–6:** run (FAIL), implement, run (PASS), commit `Zork I: the river banks`.

---

### Task 7: The rainbow and the canyon

**Files:**
- Modify: `src/worlds/zork1.ts`, session files

**Interfaces:**
- Produces: rooms `aragain_falls`, `on_rainbow`, `end_of_rainbow`, `canyon_bottom`, `rocky_ledge`, `canyon_view`; item `pot_of_gold` (hidden, `treasure: 10`); flag `rainbow_flag`; world verbs `wave` (also `raise`), `cross`; Clearing's east and Forest 3's east (check the ZIL) exits → `canyon_view`; `canyon_view` in `death.scatter`.

- [ ] **Step 1: Transcribe from ZIL:** the six rooms, FALLS-ROOM, RAINBOW-FCN, SCEPTRE-FUNCTION (on/off texts, the pot revealed, treasures on the rainbow lost via ROB to the wall, death on the rainbow, the dazzling display elsewhere), CROSS RAINBOW and its refusals, LOOK UNDER RAINBOW, CANYON-VIEW-F (“Nice view, lousy place to jump.”), CLIFF objects, the river/stream objects' lines.
- [ ] **Step 2: Write sessions** (`RAINBOW_SESSIONS`): `rainbow` (to the Falls with the sceptre: `wave sceptre`, `look`, `west`, `look`, `east`?, to End of Rainbow, `take pot`, `wave sceptre`, `score`), `rainbow-off` (drop a treasure on the rainbow, `wave sceptre` from the end), `canyon` (End of Rainbow → Canyon Bottom → Rocky Ledge → Canyon View → the Clearing), `jump-falls` (JUMPLOSS; seed with `SAME_LAST`).
- [ ] **Step 3–6:** run (FAIL), implement, run (PASS), commit `Zork I: the rainbow and the canyon`.

---

### Task 8: Follow-ups, scoring and the grue

**Files:**
- Modify: `src/worlds/zork1.ts` (I-MAINT-ROOM's boat branch, the thief keeping off water rooms, the stumble wording), `tests/worlds/zork1.test.ts`, `tests/worlds/zork1-thief-unit.test.ts`, session files

- [ ] **Step 1: Failing tests:** the three treasures' VALUE/TVALUE (as 5a's scoring test: emerald 5/10 scored on opening the buoy, scarab 5/5, pot of gold 10/10); the thief never enters a water room (route test: none of `river_*`, `in_stream`, and the Reservoir only at low tide); the maintenance flood carries an aboard player over the dam (“The rising water carries the boat over the dam, down the river, and over the falls. Tsk, tsk.”); a `grue` session: dark-to-dark without a light on both sides, seeded so the branch agrees (`SAME_LAST`).
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Zork I: 5b's treasures, the thief off the water, the boat in the flood`.

---

### Task 9: Docs, a recipe, 1.10.0

**Files:**
- Create: `src/worlds/examples/raft.ts` (a pond with a raft: BOARD, the water room, landing), snapshot test in `tests/worlds/examples/recipes.test.ts`, audit entry
- Modify: `docs/reference/world-schema.md` (vehicles, `water`, `aboard`, `darkness.stumble`, item `onEnd`), `docs/reference/conditions-and-events.md` (`aboard`, `water:`, `{ board }`, `{ disembark }`), `docs/reference/commands.md` (BOARD, DISEMBARK), `docs/guide/building-worlds/recipes.md` + `index.md`, `docs/guide/porting-zork.md` (VEHBIT/VTYPE, NONLANDBIT, I-RIVER, the rainbow, the dark-move grue; coverage and What's next), `docs/guide/how-it-works.md` (vehicles in movement), `CHANGELOG.md` (1.10.0), `package.json` + `server/package.json` (1.10.0; lockfiles via `npm install --package-lock-only --ignore-scripts`), `docs/superpowers/backlog.md`, the zork1 intro's coverage line.

- [ ] Steps: recipe + snapshot (write, run, read the snapshot), docs, `npm run docs:build && npm run lint && npm run type-check && npx vitest run --coverage --exclude "tests/zz/**" && (cd server && npm test)`, commit `1.10.0: docs and a recipe for vehicles`.

---

### Task 10: Office Space

- [ ] Sync with `scripts/sync-from-public.sh ../brass-lantern` on a new branch `engine-parity-stage-5b` (the tree must be clean); its tests should pass unchanged. Check visible changes against the real world with a throwaway test (BOARD *thing*: “You have a theory on how to board a *thing*, perhaps?”; DISEMBARK: “You’re not in that!”; EXIT/STAND now mean DISEMBARK — check Office Space has no `exit` exit labels that this would shadow). Bump to 1.10.0 with a CHANGELOG entry; lint, type-check, coverage, build, server tests; commit, push, PR. After the final review and CI, with the owner's go-ahead: merge both, tag `v1.10.0` on each, publish the brass-lantern release, check the live site.

---

## Self-review notes

- **Spec coverage:** vehicles (state, verbs, movement, rules while aboard, description, death) → 1, 2; dark moves → 3; small additions (land exits, LAUNCH/LAND verbs, `{ run }` for same-turn fuses) → 4, 5; the boat → 4; the river and stream → 5; the banks and buoy → 6; the rainbow and canyon → 7; follow-ups and treasures → 8; testing → 1–8; docs and release → 9, 10.
- **Deferred to execution with rulings:** exact routes, seeds, Zork's exact strings (from the ZIL, then the story file), the boat-prefix route.
- **Type consistency:** `aboard`, `isWater`, `vehicle`, `water`, `handleBoard`, `handleDisembark`, `Item.onEnd`, `darkness.stumble`, `BOAT_PREFIX` are used under these names throughout.
