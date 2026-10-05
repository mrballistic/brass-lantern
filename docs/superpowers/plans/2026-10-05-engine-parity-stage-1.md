# Engine Parity Stage 1 (World Model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the native engine Zork's world model (an object tree, containers, doors, rules, world verbs) and prove it with a native Zork I slice that matches the real Z-machine game line for line.

**Architecture:** `GameState.locations` (every item's parent) replaces the inventory and room deltas, with a 1.0 → 2.0 save migration. `engine.ts` splits into `model.ts` (places, reachability), `rules.ts` (events, instead/after rules), `describe.ts` (text) and `verbs/*.ts`. World verbs are declared in world data, and the parser, dispatcher and intent server learn them from there.

**Tech Stack:** Vue 3, TypeScript 6, Pinia, Vitest 5 (happy-dom), Express 5 intent server; ifvms 1.1.6 for the differential harness.

**Spec:** `docs/superpowers/specs/2026-10-05-engine-parity-stage-1-design.md`

## Global Constraints

- The engine never branches on a world's IDs.
- An engine miss never mutates state: a miss leaves `GameState` deep-equal to before.
- The LLM only classifies; replies are reduced to verbs plus identifiers matching `^[a-z0-9_]{1,48}$`.
- Conditions are parsed only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Existing worlds keep working; schema changes are additive (the removed SNOOZE/INSTALL engine verbs are the stated exception, replaced by world verbs).
- Player-facing text uses curly quotes and apostrophes (’ “ ”).
- Coverage thresholds: 80% lines/functions/statements, 75% branches.
- `'player'` is a reserved place ID.
- Checks before every commit: `npm run lint && npm run type-check && npx vitest run` (frontend). Server changes also: `cd server && npm run lint && npm run type-check && npm test`.

## Review Focus

1. A 1.0 save of a game where the player dropped an item in a different room than it started in: after migration the item is in the drop room, not back at its start.
2. PUT a container into itself or into something it contains: refused, state unchanged.
3. An item inside a closed container inside an open one: not reachable, not matchable by TAKE, and not listed.
4. A world verb whose word collides with a built-in (a world declaring `open`): the built-in wins and the audit reports it.
5. The intent server receiving a `context.verbs` entry that is not an identifier, or more than 50 of them: rejected or dropped, never echoed.

Each has a test in the owning task (Tasks 3, 6, 6, 5 and 5).

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/engine/result.ts` | `EngineResult`, `ok()`, `miss()` | 1 |
| `src/engine/rules.ts` | events (`runEvent`, effects), rule lookup and application | 1, 5 |
| `src/engine/describe.ts` | room, contents and inventory text, exit list | 1, 6, 8 |
| `src/engine/model.ts` | places, initial state, reachability and visibility, matchers | 1, 2, 6 |
| `src/engine/verbs/movement.ts` | go, enter, climb, idle, room entry | 1, 7 |
| `src/engine/verbs/objects.ts` | take, drop, examine, inventory, use, wear, smash, finale, read, switch | 1, 6, 8 |
| `src/engine/verbs/containers.ts` | open, close, lock, unlock, put, take-from, search | 6 |
| `src/engine/verbs/people.ts` | talk, give | 1 |
| `src/engine/verbs/meta.ts` | hint, score, help, unknown | 1 |
| `src/engine/verbs/world-verbs.ts` | dispatching world-declared verbs | 5 |
| `src/engine/engine.ts` | `execute`, dispatcher, turn bookkeeping, public API | 1, 5 |
| `src/engine/migrate.ts` | save migration 1.0 → 2.0 | 3 |
| `src/engine/conditions.ts` | conditions (gains `world` param and new kinds) | 4 |
| `src/engine/parser.ts` | built-in verbs + world verbs | 5, 6, 7, 8 |
| `src/engine/fuzzy.ts` | diagonals, exit specs | 7 |
| `src/types/world.ts`, `src/types/game.ts` | schema and state | 2, 5, 6, 7, 8 |
| `src/worlds/zork1.ts` | native Zork I slice | 9 |
| `tests/worlds/zork1-diff.test.ts`, `tests/worlds/zork1-allowlist.ts` | differential harness | 10 |
| `tests/helpers/state.ts` | test helpers for building states | 2 |

---

### Task 1: Split engine.ts by concern (no behavior change)

**Files:**
- Create: `src/engine/result.ts`, `src/engine/rules.ts`, `src/engine/describe.ts`, `src/engine/model.ts`, `src/engine/verbs/{movement,objects,people,meta}.ts`
- Modify: `src/engine/engine.ts` (becomes the dispatcher and public API)
- Test: the existing suite, unchanged

**Interfaces:**
- Produces:
  - `result.ts`: `EngineResult`, `ok(lines, mutated?)`, `miss(line)`.
  - `rules.ts`: `runEvent(key, world, state): string[]`, `applyEventEffects(key, world, state): void`, `findUseRule(...)`, `applyUseRule(rule, world, state): EngineResult`.
  - `describe.ts`: `describeRoom(roomId, world, state): string[]`, `exitList(room): string`, `COMPASS`.
  - `model.ts`: `visibleItemsIn`, `reachableItems`, `matchItem`, `matchNpc`, `itemCandidates`.
  - `verbs/*`: one exported `handleX` per verb, with the signatures they have today.
  - `engine.ts` keeps exporting `execute`, `initialState`, `openingLines`, `describeCurrentRoom`, `visibleItemsIn` (re-export), `EngineResult` (re-export), `__test`.

- [ ] **Step 1: Record the baseline**

Run: `npx vitest run 2>&1 | tail -4`
Expected: all tests pass (392 at plan time). Note the count.

- [ ] **Step 2: Move code verbatim**

Move each function from `src/engine/engine.ts` to its new home, unchanged, adding `export` and imports:

| Function(s) | To |
|---|---|
| `EngineResult`, `ok`, `miss` | `result.ts` |
| `applyEventEffects`, `itemIdForName`, `runEvent`, `findUseRule`, `applyUseRule` | `rules.ts` |
| `COMPASS`, `exitList`, `describeRoom` | `describe.ts` |
| `visibleItemsIn`, `itemCandidates`, `reachableItems`, `matchItem`, `matchNpc` | `model.ts` |
| `runOnEnter`, `GENERIC_DENIAL`, `enterRoom`, `handleGo`, `handleIdle` | `verbs/movement.ts` |
| `handleLook`, `handleInventory`, `ALL`, `handleTake`, `handleDrop`, `handleExamine`, `handleUse`, `handleWear`, `PRONOUN`, `handleSmash`, `smashedHere`, `runFinale`, `handleSnooze`, `handleInstall` | `verbs/objects.ts` |
| `handleTalk`, `handleGive` | `verbs/people.ts` |
| `scoreLines`, `handleHint`, `handleScore`, `handleHelp`, `handleUnknown` | `verbs/meta.ts` |

`engine.ts` keeps `EngineDeps`, `initialState`, `execute`, `ambientLines`, `dispatch`, `openingLines` and `describeCurrentRoom`, and adds:

```ts
export type { EngineResult } from './result';
export { visibleItemsIn } from './model';
export const __test = { enterRoom, scoreLines };
```

Keep `runFinale` in `objects.ts` next to `handleSmash`; `scoreLines` is imported from `meta.ts`.

- [ ] **Step 3: Verify nothing changed**

Run: `npm run lint && npm run type-check && npx vitest run 2>&1 | tail -4`
Expected: lint and types clean; the same test count passes.

- [ ] **Step 4: Commit**

```bash
git add src/engine
git commit -m "Split engine.ts by concern, no behavior change"
```

---

### Task 2: State 2.0: the object tree

**Files:**
- Modify: `src/types/game.ts`, `src/types/world.ts`, `src/engine/model.ts`, `src/engine/engine.ts`, `src/engine/rules.ts`, `src/engine/verbs/objects.ts`, `src/engine/verbs/people.ts`, `src/engine/verbs/movement.ts`, `src/stores/game.ts`, `src/engine/conditions.ts` (only `has:` switches to locations)
- Create: `tests/helpers/state.ts`, `tests/engine/model.test.ts`
- Modify tests: `tests/engine/engine-hooks.test.ts`, `tests/engine/conditions.test.ts`, `tests/stores/game.test.ts`, `tests/services/persistence.test.ts`, `tests/worlds/tutorial.test.ts` (only where they read or build `inventory`/`itemsRemoved`/`itemsAdded`)

**Interfaces:**
- Consumes: Task 1's modules.
- Produces:

```ts
// src/types/game.ts
export type Place = string | null;
export interface ItemState { open?: boolean; locked?: boolean; on?: boolean; moved?: boolean }
export interface GameState {
  currentRoom: string;
  locations: Record<string, Place>;
  itemState: Record<string, ItemState>;
  visited: string[];
  flags: Record<string, boolean>;
  moveCount: number;
  gameOver: boolean;
  firedEvents: string[];
  misses?: number;
  turns?: number;
}
export const SAVE_VERSION = '2.0' as const;

// src/types/world.ts, Item gains
contains?: string[];

// src/engine/model.ts
export const PLAYER = 'player';
export function initialLocations(world: World): Record<string, Place>;
export function parentOf(state: GameState, id: string): Place;
export function childrenOf(world: World, state: GameState, place: string): string[]; // world declaration order
export function inventoryOf(world: World, state: GameState): string[];
export function isCarried(state: GameState, id: string): boolean;
export function moveItem(state: GameState, id: string, place: Place): void;
```

- [ ] **Step 1: Write the failing model test**

`tests/engine/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { childrenOf, initialLocations, inventoryOf, moveItem, parentOf, PLAYER } from '@/engine/model';
import { initialState } from '@/engine/engine';
import { fixtureWorld as world } from '../fixtures/world';

describe('the object tree', () => {
  it('places items from room lists, and leaves unlisted items offstage', () => {
    const loc = initialLocations(world);
    expect(loc.key).toBe('living');
    expect(loc.crate).toBe('shed');
    expect(loc.lit_lamp).toBeNull();
  });

  it('lists children in world order and moves items between places', () => {
    const state = initialState(world);
    expect(childrenOf(world, state, 'living')).toEqual(['key', 'wallet', 'shirt']);
    moveItem(state, 'shirt', PLAYER);
    moveItem(state, 'key', PLAYER);
    expect(inventoryOf(world, state)).toEqual(['key', 'shirt']);
    expect(childrenOf(world, state, 'living')).toEqual(['wallet']);
    moveItem(state, 'key', 'yard');
    expect(parentOf(state, 'key')).toBe('yard');
  });

  it('a fresh game starts with the start room visited and no item state', () => {
    const state = initialState(world);
    expect(state.visited).toEqual(['bedroom']);
    expect(state.itemState).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/engine/model.test.ts`
Expected: FAIL; `initialLocations` is not exported.

- [ ] **Step 3: Implement the model**

Add to `src/engine/model.ts`:

```ts
import type { GameState, Place } from '@/types/game';
import type { World } from '@/types/world';

export const PLAYER = 'player';

/** Every item's starting parent: rooms' `items`, then items' `contains`. Unlisted items are offstage. */
export function initialLocations(world: World): Record<string, Place> {
  const loc: Record<string, Place> = {};
  for (const id of Object.keys(world.items)) loc[id] = null;
  for (const [roomId, room] of Object.entries(world.rooms)) {
    for (const id of room.items) loc[id] = roomId;
  }
  for (const [id, item] of Object.entries(world.items)) {
    for (const child of item.contains ?? []) loc[child] = id;
  }
  return loc;
}

export function parentOf(state: GameState, id: string): Place {
  return state.locations[id] ?? null;
}

export function childrenOf(world: World, state: GameState, place: string): string[] {
  return Object.keys(world.items).filter((id) => state.locations[id] === place);
}

export function inventoryOf(world: World, state: GameState): string[] {
  return childrenOf(world, state, PLAYER);
}

export function isCarried(state: GameState, id: string): boolean {
  return state.locations[id] === PLAYER;
}

export function moveItem(state: GameState, id: string, place: Place): void {
  state.locations[id] = place;
}
```

`visibleItemsIn(roomId, world, state)` becomes `childrenOf(world, state, roomId)` (Task 6 adds scenery and nesting). `reachableItems` becomes `[...childrenOf(world, state, state.currentRoom), ...inventoryOf(world, state)]`.

`initialState(world)` in `engine.ts` returns:

```ts
{
  currentRoom: world.startRoom,
  locations: initialLocations(world),
  itemState: {},
  visited: [world.startRoom],
  flags: {}, moveCount: 0, gameOver: false, firedEvents: [], misses: 0, turns: 0,
}
```

- [ ] **Step 4: Switch every reader and writer of the old fields**

Make these replacements:

| Where | Old | New |
|---|---|---|
| `rules.ts` `applyEventEffects` | push to `state.inventory` | `moveItem(state, itemId, PLAYER)` |
| `rules.ts` consumed | filter `state.inventory` | `if (isCarried(state, itemId)) moveItem(state, itemId, null)` |
| `objects.ts` `handleTake` | push inventory + `itemsRemoved` | `moveItem(state, itemId, PLAYER); (state.itemState[itemId] ??= {}).moved = true;` |
| `objects.ts` take: "already have" | `matchItem(target, state.inventory, …)` | `matchItem(target, inventoryOf(world, state), …)` |
| `objects.ts` `handleDrop` | inventory + added/removed | `moveItem(state, itemId, state.currentRoom)` |
| `objects.ts` `handleWear`/`handleUse` | `state.inventory` | `inventoryOf(world, state)` / `isCarried(state, id)` |
| `objects.ts` `handleSmash` | `state.inventory.includes(finale.with)` | `isCarried(state, finale.with)` |
| `objects.ts` onSmash removal | `itemsRemoved` | `moveItem(state, itemId, null)` |
| `objects.ts` `handleInventory` | `state.inventory` | `inventoryOf(world, state)` |
| `people.ts` `handleGive` | inventory filter | `moveItem(state, itemId, null)` |
| `movement.ts` `enterRoom` | after setting `currentRoom` | `if (!state.visited.includes(targetId)) state.visited.push(targetId);` |
| `conditions.ts` `has:` | `state.inventory.includes(value)` | `state.locations[value] === 'player'` |
| `stores/game.ts` `reinterpret` | `this.game.inventory` | `inventoryOf(world, this.game)` |

`smashedHere` keeps reading `world.rooms[...].items` (the starting room).

- [ ] **Step 5: Add the state test helper and update tests**

`tests/helpers/state.ts`:

```ts
import { initialState } from '@/engine/engine';
import { moveItem, PLAYER } from '@/engine/model';
import type { GameState } from '@/types/game';
import type { World } from '@/types/world';

/** A fresh game in `room`, carrying `items`. */
export function stateWith(world: World, opts: { room?: string; carrying?: string[]; flags?: string[] } = {}): GameState {
  const state = initialState(world);
  if (opts.room) state.currentRoom = opts.room;
  for (const id of opts.carrying ?? []) moveItem(state, id, PLAYER);
  for (const f of opts.flags ?? []) state.flags[f] = true;
  return state;
}
```

In the tests listed under Files:
- replace literal `inventory: [...]` states with `stateWith(world, { carrying: [...] })`;
- replace assertions on `state.inventory` with `inventoryOf(world, state)`;
- replace assertions on `itemsRemoved`/`itemsAdded` with `parentOf(state, id)`.

Do not change any expected output text.

`persistence.test.ts` builds states with the old shape; give them the new shape via `initialState(fixtureWorld)` and set `version: '2.0'` where a test writes a raw payload.

- [ ] **Step 6: Run everything**

Run: `npm run lint && npm run type-check && npx vitest run 2>&1 | tail -4`
Expected: all pass. The only intended behavior difference is inventory order, which follows world order. If a test fails only because of inventory order, update its expected order and note it in the commit message.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "State 2.0: an object tree replaces inventory and room deltas"
```

---

### Task 3: Save migration 1.0 → 2.0

**Files:**
- Create: `src/engine/migrate.ts`, `tests/engine/migrate.test.ts`
- Modify: `src/services/persistence.ts` (stop discarding non-2.0 saves; return raw), `src/stores/game.ts` (migrate on load), `tests/services/persistence.test.ts`

**Interfaces:**
- Consumes: `initialLocations`, `moveItem`, `PLAYER` (Task 2).
- Produces:

```ts
// src/engine/migrate.ts
export interface SavedStateV1 {
  version: '1.0';
  savedAt: string;
  gameState: { currentRoom: string; inventory: string[]; flags: Record<string, boolean>; moveCount: number;
               gameOver: boolean; itemsRemoved: Record<string, string[]>; itemsAdded: Record<string, string[]>;
               firedEvents: string[]; misses?: number; turns?: number };
  outputHistory: OutputLine[];
}
/** Returns a 2.0 save, or null if the payload can't be read. */
export function migrateSave(world: World, raw: unknown): SavedState | null;
```

`persistence.load()` returns `unknown | null` (the parsed JSON) and is renamed `loadRaw()`. `stores/game.ts` calls `migrateSave(world, persistence.loadRaw())`.

- [ ] **Step 1: Write the failing tests**

`tests/engine/migrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { migrateSave } from '@/engine/migrate';
import { initialState } from '@/engine/engine';
import { fixtureWorld as world } from '../fixtures/world';

const v1 = (gameState: object) => ({
  version: '1.0',
  savedAt: '2026-10-01T00:00:00Z',
  outputHistory: [{ id: '1', text: 'hello', timestamp: 0, type: 'prose' }],
  gameState: {
    currentRoom: 'bedroom', inventory: [], flags: {}, moveCount: 0, gameOver: false,
    itemsRemoved: {}, itemsAdded: {}, firedEvents: [], ...gameState,
  },
});

describe('migrateSave', () => {
  it('passes a 2.0 save through', () => {
    const save = { version: '2.0', savedAt: '', outputHistory: [], gameState: initialState(world) };
    expect(migrateSave(world, save)).toEqual(save);
  });

  it('migrates an untouched 1.0 game to the initial places', () => {
    const out = migrateSave(world, v1({}))!;
    expect(out.version).toBe('2.0');
    expect(out.gameState.locations).toEqual(initialState(world).locations);
    expect(out.gameState.visited).toEqual(['bedroom']);
    expect(out.gameState.itemState).toEqual({});
    expect(out.outputHistory).toHaveLength(1);
    expect(out.gameState).not.toHaveProperty('inventory');
    expect(out.gameState).not.toHaveProperty('itemsRemoved');
  });

  it('carried items go to the player; dropped items stay where they were dropped', () => {
    // Took the key in the living room, dropped the wallet in the yard, and is carrying the shirt.
    const out = migrateSave(world, v1({
      currentRoom: 'yard',
      inventory: ['key', 'shirt'],
      itemsRemoved: { living: ['key', 'wallet', 'shirt'] },
      itemsAdded: { yard: ['wallet'] },
      flags: { entered_living: true },
      moveCount: 3,
    }))!;
    expect(out.gameState.locations.key).toBe('player');
    expect(out.gameState.locations.shirt).toBe('player');
    expect(out.gameState.locations.wallet).toBe('yard');
    expect(out.gameState.locations.bat).toBe('yard');
    expect(out.gameState.flags).toEqual({ entered_living: true });
    expect(out.gameState.moveCount).toBe(3);
    expect(out.gameState.visited).toEqual(['yard']);
  });

  it('a smashed item that left the room is offstage', () => {
    const out = migrateSave(world, v1({ itemsRemoved: { bedroom: ['alarm'] }, firedEvents: ['smash_alarm'] }))!;
    expect(out.gameState.locations.alarm).toBeNull();
  });

  it('an item added by an event and still carried is carried', () => {
    const out = migrateSave(world, v1({ inventory: ['lit_lamp'] }))!;
    expect(out.gameState.locations.lit_lamp).toBe('player');
  });

  it('rejects anything it can’t read', () => {
    expect(migrateSave(world, null)).toBeNull();
    expect(migrateSave(world, { version: '9.9' })).toBeNull();
    expect(migrateSave(world, { version: '1.0', gameState: { currentRoom: 3 } })).toBeNull();
    expect(migrateSave(world, 'nonsense')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/engine/migrate.test.ts`
Expected: FAIL; the module doesn't exist.

- [ ] **Step 3: Implement**

`src/engine/migrate.ts`:

```ts
import type { GameState, OutputLine, SavedState } from '@/types/game';
import { SAVE_VERSION } from '@/types/game';
import type { World } from '@/types/world';
import { initialLocations, moveItem, PLAYER } from './model';

interface V1Game {
  currentRoom: string;
  inventory?: string[];
  flags?: Record<string, boolean>;
  moveCount?: number;
  gameOver?: boolean;
  itemsRemoved?: Record<string, string[]>;
  itemsAdded?: Record<string, string[]>;
  firedEvents?: string[];
  misses?: number;
  turns?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function history(raw: Record<string, unknown>): OutputLine[] {
  return Array.isArray(raw.outputHistory) ? (raw.outputHistory as OutputLine[]) : [];
}

function fromV1(world: World, g: V1Game): GameState {
  const state: GameState = {
    currentRoom: g.currentRoom,
    locations: initialLocations(world),
    itemState: {},
    visited: [g.currentRoom],
    flags: { ...(g.flags ?? {}) },
    moveCount: g.moveCount ?? 0,
    gameOver: Boolean(g.gameOver),
    firedEvents: [...(g.firedEvents ?? [])],
    misses: g.misses ?? 0,
    turns: g.turns ?? 0,
  };
  for (const ids of Object.values(g.itemsRemoved ?? {})) for (const id of ids) moveItem(state, id, null);
  for (const [room, ids] of Object.entries(g.itemsAdded ?? {})) for (const id of ids) moveItem(state, id, room);
  for (const id of g.inventory ?? []) moveItem(state, id, PLAYER);
  return state;
}

export function migrateSave(world: World, raw: unknown): SavedState | null {
  if (!isRecord(raw) || !isRecord(raw.gameState)) return null;
  const g = raw.gameState;
  if (typeof g.currentRoom !== 'string') return null;
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : '';
  try {
    if (raw.version === SAVE_VERSION) {
      return { version: SAVE_VERSION, savedAt, gameState: g as unknown as GameState, outputHistory: history(raw) };
    }
    if (raw.version === '1.0') {
      return { version: SAVE_VERSION, savedAt, gameState: fromV1(world, g as unknown as V1Game), outputHistory: history(raw) };
    }
  } catch {
    return null;
  }
  return null;
}
```

In `persistence.ts`, replace `load()` with:

```ts
loadRaw(): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
},
```

and update the `PersistenceService` interface to `loadRaw(): unknown`. In `stores/game.ts`, both `initialize` and the LOAD meta command use `const saved = migrateSave(world, persistence.loadRaw());`.

- [ ] **Step 4: Run the migration, persistence and store tests**

Run: `npx vitest run tests/engine/migrate.test.ts tests/services tests/stores`
Expected: PASS after updating `persistence.test.ts` to call `loadRaw()`. Its "discards a different version" test becomes "returns the raw payload; migrateSave decides".

- [ ] **Step 5: Store-level test: a 1.0 save resumes**

Add to `tests/stores/game.test.ts`:

```ts
it('resumes a 1.0 save after migrating it', () => {
  localStorage.setItem('test:save', JSON.stringify({
    version: '1.0', savedAt: '', outputHistory: [{ id: 'x', text: '> west', timestamp: 0, type: 'input' }],
    gameState: { currentRoom: 'living', inventory: ['key'], flags: {}, moveCount: 1, gameOver: false,
                 itemsRemoved: { living: ['key'] }, itemsAdded: {}, firedEvents: ['enter_living'] },
  }));
  const store = useGameStore();
  store.initialize();
  expect(store.restored).toBe(true);
  expect(store.game.locations.key).toBe('player');
  expect(store.game.currentRoom).toBe('living');
});
```

Use the save key the file's mock config gives the fixture cartridge (check the `vi.mock` at the top of `game.test.ts`; adjust `'test:save'` to match).

Run: `npx vitest run tests/stores/game.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "Save format 2.0 with a migration from 1.0"
```

---

### Task 4: Conditions with the world: open, locked, on, here, visited, inside

**Files:**
- Modify: `src/engine/conditions.ts`, every caller of `evaluateCondition` (`rules.ts`, `verbs/*.ts`, `engine.ts`, `describe.ts`), `tests/engine/conditions.test.ts`
- Modify: `src/engine/model.ts` (add `isOpen`, `isLocked`, `isOn`; `isReachable` is a stub here and completed in Task 6)

**Interfaces:**
- Produces:

```ts
export function evaluateCondition(condition: string, state: GameState, world?: World): boolean;
// model.ts
export function isOpen(world: World, state: GameState, id: string): boolean;
export function isLocked(world: World, state: GameState, id: string): boolean;
export function isOn(state: GameState, id: string): boolean;
export function isReachable(world: World, state: GameState, id: string): boolean;
```

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/conditions.test.ts`:

```ts
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

describe('world conditions', () => {
  it('visited, inside and has read the object tree', () => {
    const s = stateWith(fixtureWorld, { carrying: ['key'] });
    expect(evaluateCondition('visited:bedroom', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('visited:yard', s, fixtureWorld)).toBe(false);
    expect(evaluateCondition('inside:key:player', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('inside:wallet:living', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('!inside:wallet:yard', s, fixtureWorld)).toBe(true);
  });

  it('open, locked and on read item state', () => {
    const s = stateWith(fixtureWorld);
    s.itemState.lamp = { on: true };
    expect(evaluateCondition('on:lamp', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('on:bat', s, fixtureWorld)).toBe(false);
    expect(evaluateCondition('open:bat', s, fixtureWorld)).toBe(false);
    expect(evaluateCondition('locked:bat', s, fixtureWorld)).toBe(false);
  });

  it('here: is false without a world, so old callers stay safe', () => {
    const s = stateWith(fixtureWorld, { carrying: ['key'] });
    expect(evaluateCondition('here:key', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('here:key', s)).toBe(false);
    expect(evaluateCondition('here:crate', s, fixtureWorld)).toBe(false);
  });
});
```

(Container-specific `open:`/`locked:` cases are added in Task 6, when the fixture gains containers.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/engine/conditions.test.ts`
Expected: FAIL; the new kinds evaluate to false.

- [ ] **Step 3: Implement**

`model.ts`:

```ts
export function isOpen(world: World, state: GameState, id: string): boolean {
  const c = world.items[id]?.container;
  if (!c) return false;
  if (!c.openable) return true;
  return state.itemState[id]?.open ?? c.open ?? false;
}
export function isLocked(world: World, state: GameState, id: string): boolean {
  const c = world.items[id]?.container;
  if (!c) return false;
  return state.itemState[id]?.locked ?? c.locked ?? false;
}
export function isOn(state: GameState, id: string): boolean {
  return Boolean(state.itemState[id]?.on);
}
/** Stage-1 stub: the room's items and the inventory. Task 6 adds containers and scenery. */
export function isReachable(world: World, state: GameState, id: string): boolean {
  return reachableItems(world, state).includes(id);
}
```

`conditions.ts`: `split(':', 2)` becomes `const [kind, value, extra] = body.split(':');`, and the switch gains:

```ts
case 'has':
  result = state.locations[value] === 'player';
  break;
case 'visited':
  result = state.visited.includes(value);
  break;
case 'inside':
  result = (state.locations[value] ?? null) === (extra ?? null);
  break;
case 'on':
  result = Boolean(state.itemState[value]?.on);
  break;
case 'open':
  result = world ? isOpen(world, state, value) : false;
  break;
case 'locked':
  result = world ? isLocked(world, state, value) : false;
  break;
case 'here':
  result = world ? isReachable(world, state, value) : false;
  break;
```

Update the doc comment to list every kind. Pass `world` at every call site: `evaluateCondition(x, state, world)`.

To avoid an import cycle (`model.ts` doesn't import `conditions.ts`), keep `isOpen`/`isLocked`/`isReachable` in `model.ts`, with `conditions.ts` importing them.

- [ ] **Step 4: Run all tests**

Run: `npm run type-check && npx vitest run 2>&1 | tail -4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "Conditions: open, locked, on, here, visited, inside"
```

---

### Task 5: Rules and world verbs

**Files:**
- Modify: `src/types/world.ts` (Rule, `instead`, `after`, `verbs`, `style`, `emptyInventory`, `smashRefusal`; remove `onSnooze`), `src/engine/rules.ts`, `src/engine/parser.ts`, `src/engine/engine.ts`, `src/engine/verbs/objects.ts` (drop `handleSnooze`/`handleInstall`; use rules), `src/engine/verbs/meta.ts` (HELP), `src/engine/intent-client.ts`, `src/stores/game.ts`, `server/src/llm.ts`, `server/src/routes/parse-intent.ts`
- Create: `src/engine/verbs/world-verbs.ts`, `tests/engine/rules.test.ts`, `tests/engine/world-verbs.test.ts`
- Modify: `tests/fixtures/world.ts` (snooze becomes a world verb with an `instead` rule), `tests/engine/parser.test.ts`, `server/tests/*` (the existing llm/route tests)

**Interfaces:**
- Consumes: `evaluateCondition(c, state, world)` (Task 4), `reachableItems`, `matchItem` (Task 1).
- Produces:

```ts
// src/types/world.ts
export interface Rule { if?: string; with?: string; then?: string; say?: string[] }
export type UseRule = Rule;                      // kept for compatibility
export type RuleTable = Record<string, Rule[]>;
// Item and Room gain:
instead?: RuleTable;
after?: RuleTable;
// World gains:
verbs?: Record<string, WorldVerb>;
style?: 'brass' | 'infocom';
emptyInventory?: string;
smashRefusal?: string;
export interface WorldVerb {
  words: string[];
  target: 'none' | 'optional' | 'required';
  indirect?: string[];
  reply?: string;
  /** Treat as GO: to the target exit, or to the exit labeled with the verb ID when bare. */
  go?: boolean;
}

// src/engine/rules.ts
export function rulesFor(owner: Item | Room | undefined, phase: 'instead' | 'after', verb: string): Rule[];
export function findRule(world: World, state: GameState, phase: 'instead' | 'after', verb: string,
  ids: { target?: string | null; indirect?: string | null; room: string }, reach: string[]): Rule | null;
export function applyRule(rule: Rule, world: World, state: GameState): EngineResult;

// src/engine/parser.ts
export function fallbackParse(rawInput: string, verbs?: World['verbs']): ParsedAction | null;
export function splitCommands(rawInput: string, verbs?: World['verbs']): string[];
export const BUILT_IN_WORDS: ReadonlySet<string>;   // every built-in verb word, for the clash audit
export function verbClashes(verbs: World['verbs']): string[];

// src/engine/intent-client.ts, IntentContext gains
verbs: string[];

// server/src/llm.ts, IntentContext gains
verbs?: string[];
```

`rulesFor` returns `[...(owner?.[phase]?.[verb] ?? []), ...legacy]`, where legacy is `owner.onUse` for `('instead', 'use')` on items, and `{ then: owner.onTake }` for `('after', 'take')` on items. The one-shot behavior of `onTake` stays in `handleTake` (it checks `firedEvents` before applying the legacy rule, as today). `onWear`, `onSmash` and the finale keep their dedicated handlers.

> **Ruling:** the spec says the old hooks are normalized into one code path. `onUse` and `onTake` are; `onWear` and `onSmash` keep their handlers in stage 1, because they carry state rules can't yet express ("already wearing", "already in pieces" plus removing the item). Stage 2's event effects absorb them. `onSnooze` is removed rather than mapped, since SNOOZE leaves the engine; the fixture and Office Space convert it to `instead.snooze`.

- [ ] **Step 1: Write the failing rule tests**

`tests/engine/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (state: ReturnType<typeof stateWith>, action: string, target?: string, indirect?: string) =>
  execute({ action, target, indirect }, { world, state });

describe('instead and after rules', () => {
  it('an instead rule replaces the default, on the item first, then the room', () => {
    const s = stateWith(world, { room: 'yard' });
    // fixture: bat has instead.take [{ if: 'flag:paid', say: ['Not yours to take.'] }] (added in Step 3)
    s.flags.paid = true;
    const r = run(s, 'take', 'bat');
    expect(r.lines).toEqual(['Not yours to take.']);
    expect(s.locations.bat).toBe('yard');
  });

  it('a rule whose condition fails falls through to the default', () => {
    const s = stateWith(world, { room: 'yard' });
    run(s, 'take', 'bat');
    expect(s.locations.bat).toBe('player');
  });

  it('after rules run only when the default succeeded', () => {
    const s = stateWith(world, { room: 'yard' });
    // fixture: lamp has after.drop [{ say: ['The lamp rolls under the fence.'] }]
    run(s, 'take', 'lamp');
    expect(run(s, 'drop', 'lamp').lines).toContain('The lamp rolls under the fence.');
    expect(run(s, 'drop', 'lamp').lines).not.toContain('The lamp rolls under the fence.');
  });

  it('onUse is still honored, as instead.use', () => {
    const s = stateWith(world, { room: 'bedroom' });
    expect(run(s, 'use', 'bed').lines.join(' ')).toContain('You lie down');
  });
});
```

(The expected `You lie down` text must equal the fixture's `rest` event; read it from `tests/fixtures/world.ts` and adjust the expectation to the real first line.)

`tests/engine/world-verbs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse, splitCommands, verbClashes } from '@/engine/parser';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('world verbs', () => {
  it('parse from the world’s words, with and without a target', () => {
    expect(fallbackParse('snooze', world.verbs)).toEqual({ action: 'snooze' });
    expect(fallbackParse('hit the snooze button', world.verbs)).toEqual({ action: 'snooze' });
    expect(fallbackParse('ring bell', world.verbs)).toEqual({ action: 'ring', target: 'bell' });
    expect(fallbackParse('snooze', undefined)).toEqual({ action: 'go', target: 'snooze' });
  });

  it('dispatch to rules on the room’s items when they take no target', () => {
    const s = stateWith(world, { room: 'bedroom' });
    const before = structuredClone(s);
    const r = execute({ action: 'snooze' }, { world, state: s });
    expect(r.lines).toEqual(['😴 You hit snooze.']);
    expect(r.understood).not.toBe(false);
    expect(s).toEqual({ ...before, turns: 1 });
  });

  it('with no matching rule, print the reply and change nothing', () => {
    const s = stateWith(world, { room: 'yard' });
    const r = execute({ action: 'snooze' }, { world, state: s });
    expect(r.lines).toEqual(['There is nothing here to snooze.']);
  });

  it('a go verb moves through the named exit', () => {
    const s = stateWith(world, { room: 'yard' });
    execute({ action: 'wander', target: 'shed' }, { world, state: { ...s, locations: { ...s.locations, key: 'player' } } });
    const s2 = stateWith(world, { room: 'yard', carrying: ['key'] });
    execute({ action: 'wander', target: 'shed' }, { world, state: s2 });
    expect(s2.currentRoom).toBe('shed');
  });

  it('an unknown target for a world verb is a miss that changes nothing', () => {
    const s = stateWith(world, { room: 'yard' });
    const before = structuredClone(s);
    const r = execute({ action: 'ring', target: 'trombone' }, { world, state: s });
    expect(r.understood).toBe(false);
    expect(s).toEqual(before);
  });

  it('splitCommands treats world verbs as commands', () => {
    expect(splitCommands('snooze and ring bell', world.verbs)).toEqual(['snooze', 'ring bell']);
  });

  it('reports a world verb word that clashes with a built-in', () => {
    expect(verbClashes({ shut: { words: ['open', 'shut'], target: 'required' } })).toEqual(['open']);
    expect(verbClashes(world.verbs)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/engine/rules.test.ts tests/engine/world-verbs.test.ts`
Expected: FAIL (no `verbs` in the fixture, no `verbClashes`).

- [ ] **Step 3: Extend the fixture world**

In `tests/fixtures/world.ts`:
- remove `onSnooze` from `alarm`; add `instead: { snooze: [{ say: ['😴 You hit snooze.'] }] }` to `alarm`;
- add a `bell` item to the yard: `bell: { name: 'bell', description: 'A brass bell on a post.', portable: false, tags: [], instead: { ring: [{ say: ['Ding.'] }] } }`, and `'bell'` to `yard.items`;
- add `instead: { take: [{ if: 'flag:paid', say: ['Not yours to take.'] }] }` to `bat`;
- add `after: { drop: [{ if: '!flag:lamp_rolled', then: 'lamp_rolls' }] }` to `lamp`, the event `lamp_rolls: ['The lamp rolls under the fence.', '[Flag set: lamp rolled]']`, and the flag label `'lamp rolled': 'lamp_rolled'`;
- add:

```ts
verbs: {
  snooze: { words: ['snooze', 'hit snooze', 'hit the snooze button', 'press snooze'], target: 'none', reply: 'There is nothing here to snooze.' },
  ring: { words: ['ring'], target: 'required' },
  wander: { words: ['wander', 'wander to'], target: 'optional', go: true },
},
```

Remove `snooze_alarm` from `events` if nothing references it.

- [ ] **Step 4: Implement rules**

`src/engine/rules.ts` additions:

```ts
import type { Item, Room, Rule, World } from '@/types/world';

export function rulesFor(owner: Item | Room | undefined, phase: 'instead' | 'after', verb: string): Rule[] {
  if (!owner) return [];
  const own = owner[phase]?.[verb] ?? [];
  const item = owner as Item;
  if (phase === 'instead' && verb === 'use' && item.onUse) return [...own, ...item.onUse];
  if (phase === 'after' && verb === 'take' && item.onTake) return [...own, { then: item.onTake }];
  return own;
}

function ruleApplies(rule: Rule, other: string | null | undefined, reach: string[], world: World, state: GameState): boolean {
  if (rule.with) {
    if (!reach.includes(rule.with)) return false;
    if (other && other !== rule.with) return false;
  }
  return !rule.if || evaluateCondition(rule.if, state, world);
}

/** Target item, then indirect item, then the room. First applicable rule wins. */
export function findRule(
  world: World, state: GameState, phase: 'instead' | 'after', verb: string,
  ids: { target?: string | null; indirect?: string | null; room: string }, reach: string[],
): Rule | null {
  const owners: Array<[Item | Room | undefined, string | null | undefined]> = [
    [ids.target ? world.items[ids.target] : undefined, ids.indirect],
    [ids.indirect ? world.items[ids.indirect] : undefined, ids.target],
    [world.rooms[ids.room], ids.indirect ?? ids.target],
  ];
  for (const [owner, other] of owners) {
    for (const rule of rulesFor(owner, phase, verb)) {
      if (ruleApplies(rule, other, reach, world, state)) return rule;
    }
  }
  return null;
}

export function applyRule(rule: Rule, world: World, state: GameState): EngineResult {
  const lines: string[] = [];
  if (rule.then) lines.push(...runEvent(rule.then, world, state));
  if (rule.say) lines.push(...rule.say);
  return ok(lines, Boolean(rule.then));
}
```

`findUseRule`/`applyUseRule` are deleted; `handleUse` calls `findRule(world, state, 'instead', 'use', { target: itemId, indirect: otherId, room: state.currentRoom }, reach)`. Keep the existing fallback to `handleWear` and the miss.

Engine-wide `instead`/`after` for built-in verbs: in `engine.ts`, wrap the dispatch of every built-in verb that has a resolvable target (`take`, `drop`, `examine`, `wear`, `smash`, `give`, and in later tasks `open`, `close`, `lock`, `unlock`, `put`, `search`, `read`, `turn_on`, `turn_off`, `enter`, `climb`):

```ts
function withRules(verb: string, action: ParsedAction, world: World, state: GameState,
                   run: () => EngineResult): EngineResult {
  const reach = reachableItems(world, state);
  const target = action.target ? matchItem(action.target, reach, world) : null;
  const indirect = action.indirect ? matchItem(action.indirect, reach, world) : null;
  const ids = { target, indirect, room: state.currentRoom };
  const instead = findRule(world, state, 'instead', verb, ids, reach);
  if (instead) return applyRule(instead, world, state);
  const result = run();
  if (result.understood === false || !result.mutated) return result;
  const after = findRule(world, state, 'after', verb, ids, reachableItems(world, state));
  if (!after || (verb === 'take' && after.then && state.firedEvents.includes(after.then))) return result;
  const extra = applyRule(after, world, state);
  return { ...result, lines: [...result.lines, ...extra.lines] };
}
```

Remove the inline `onTake` handling from `handleTake` (it's now the legacy `after.take` rule, with the same one-shot guard in `withRules`).

- [ ] **Step 5: Implement world verbs**

`src/engine/verbs/world-verbs.ts`:

```ts
import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { matchItem, reachableItems } from '../model';
import { miss, ok, type EngineResult } from '../result';
import { applyRule, findRule } from '../rules';
import { handleGo } from './movement';

export function handleWorldVerb(action: ParsedAction, world: World, state: GameState): EngineResult | null {
  const verb = world.verbs?.[action.action];
  if (!verb) return null;
  if (verb.go) return handleGo(action.target ?? action.action, world, state);
  const reach = reachableItems(world, state);
  const target = action.target ? matchItem(action.target, reach, world) : null;
  if (action.target && !target) return miss(`You don’t see a “${action.target}” here.`);
  if (verb.target === 'required' && !target) return ok([`${capitalize(action.action)} what?`]);
  const indirect = action.indirect ? matchItem(action.indirect, reach, world) : null;
  if (action.indirect && !indirect) return miss(`You don’t see a “${action.indirect}” here.`);
  const room = state.currentRoom;
  let rule = findRule(world, state, 'instead', action.action, { target, indirect, room }, reach);
  // A verb with no target looks for a rule on anything in reach (SNOOZE finds the alarm clock).
  if (!rule && !target) {
    for (const id of reach) {
      rule = findRule(world, state, 'instead', action.action, { target: id, indirect: null, room }, reach);
      if (rule) break;
    }
  }
  if (rule) return applyRule(rule, world, state);
  return ok([verb.reply ?? 'Nothing happens.']);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
```

In `engine.ts` `dispatch`, before `default: return handleUnknown(...)`, try `handleWorldVerb(action, world, state)` and return it when non-null. Delete the `snooze` and `install` cases and their handlers from `objects.ts`. Add `world.emptyInventory ?? 'You are empty-handed.'` in `handleInventory` and `world.smashRefusal ?? 'Violence isn’t the answer to this one.'` in `handleSmash`.

> Both neutral defaults are the engine's own copy; Office Space restores its lines through the new fields in Task 12.

- [ ] **Step 6: Parse world verbs**

In `parser.ts`:
- remove `RE.snooze`, `RE.install`, `RE.sleep`, `RE.drive`, `RE.driveBare`, and the `install` single word;
- remove `drive`, `gut|clean|drink|unplug|disconnect|answer|pick\s+up\s+the\s+phone` and `staple|clip` from the remaining patterns (they become world verbs in Office Space, Task 12);
- remove `load` from the `install` pattern (LOAD stays a single-word meta command).

Then add:

```ts
function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

/** Patterns for the world's own verbs, longest words first so "hit the snooze button" beats "hit". */
function worldPatterns(verbs: World['verbs']): Array<[RegExp, string, WorldVerb]> {
  const out: Array<[RegExp, string, WorldVerb]> = [];
  for (const [id, v] of Object.entries(verbs ?? {})) {
    for (const word of v.words) {
      if (BUILT_IN_WORDS.has(word.toLowerCase())) continue;
      const preps = (v.indirect ?? []).map(escape).join('|');
      const obj = v.target === 'none' ? '' : `(?:\\s+(?:the\\s+)?(.+?))${v.target === 'required' ? '' : '?'}`;
      const ind = preps && v.target !== 'none' ? `(?:\\s+(?:${preps})\\s+(?:the\\s+)?(.+))?` : '';
      out.push([new RegExp(`^${escape(word)}${obj}${ind}$`, 'i'), id, v]);
    }
  }
  return out.sort((a, b) => b[0].source.length - a[0].source.length);
}
```

`parse(rawInput, allowBareWord, verbs)` tries, in order: `SINGLE_WORD`, `DIRECTIONS`, the built-in `VERB_PATTERNS`, `sit`/`wait`, then the world patterns (a world verb with `target: 'none'` returns `{ action: id }`; otherwise `{ action: id, target, indirect? }` from the captures), then the bare-word GO fallback. `fallbackParse`, `strictParse` and `splitCommands` take `verbs?: World['verbs']` and pass it through; `splitClause` passes it to `strictParse`.

`BUILT_IN_WORDS` is the set of every leading word in `SINGLE_WORD`, `DIRECTIONS` and the built-in regexes, maintained as an explicit list next to `RE`:

```ts
export const BUILT_IN_WORDS: ReadonlySet<string> = new Set([
  'go', 'move', 'walk', 'head', 'run', 'exit', 'enter', 'into', 'take', 'get', 'grab', 'pick up',
  'drop', 'put down', 'leave', 'examine', 'inspect', 'look at', 'x', 'use', 'operate', 'insert', 'put',
  'slide', 'stick', 'feed', 'plug', 'attach', 'give', 'hand', 'offer', 'return', 'wear', 'put on',
  'talk', 'speak', 'chat', 'ask', 'question', 'smash', 'destroy', 'break', 'kill', 'hit', 'attack',
  'wreck', 'whack', 'beat', 'sit', 'relax', 'wait', 'z', ...Object.keys(SINGLE_WORD), ...Object.keys(DIRECTIONS),
]);
export function verbClashes(verbs: World['verbs']): string[] {
  return Object.values(verbs ?? {}).flatMap((v) => v.words.filter((w) => BUILT_IN_WORDS.has(w.toLowerCase())));
}
```

Tasks 6–8 add their new built-in words to this list in the same commit as their patterns.

Note `hit` is built in (smash), so the fixture's `hit snooze` word is checked as a whole phrase: `BUILT_IN_WORDS.has('hit snooze')` is false, so it's kept, and because world patterns are tried after built-ins, **move the world-pattern check before the built-in `VERB_PATTERNS` for multi-word world phrases**: world patterns whose word contains a space are tried before `VERB_PATTERNS`; single-word world verbs after. (This preserves today's "hit snooze is not smash" behavior.)

In `stores/game.ts`, pass `world.verbs` to `fallbackParse` and `splitCommands`.

- [ ] **Step 7: Teach the intent client and server about world verbs**

`intent-client.ts`: `buildContext(..)` adds `verbs: Object.keys(world.verbs ?? {})`.

`server/src/llm.ts`:
- `IntentContext` gains `verbs?: string[]`;
- remove `'snooze'` and `'install'` from `ACTION_VOCAB`;
- `sanitize(raw, ctx?)` accepts `r.action` if `ACTIONS.has(r.action)` or `ctx?.verbs?.includes(r.action)`, with the action also passing `TARGET_RE`;
- the response schema's `enum` becomes `[...ACTION_VOCAB, ...(ctx.verbs ?? [])]` (build the schema per request);
- the system instruction adds a line `World verbs (use when they fit better): ${ctx.verbs.join(', ')}` when there are any.

`server/src/routes/parse-intent.ts`: `contextIsBounded` also checks `verbs` (optional; when present: an array of at most 50 strings, each matching `^[a-z0-9_]{1,48}$`). A context failing that gets the existing 400 response.

Server tests to add (in the existing llm and route test files):

```ts
it('accepts a world verb named in the context, and drops one that isn’t', () => {
  expect(sanitize({ action: 'pray' }, { ...ctx, verbs: ['pray'] })).toEqual({ action: 'pray' });
  expect(sanitize({ action: 'pray' }, ctx)).toEqual({ action: 'unknown' });
});
```

```ts
it('rejects a context whose verbs aren’t identifiers or are too many', async () => {
  const bad = await request(app).post('/api/parse-intent').send({ input: 'pray', context: { ...ctx, verbs: ['Pray Now!'] } });
  expect(bad.status).toBe(400);
  const many = await request(app).post('/api/parse-intent').send({ input: 'pray', context: { ...ctx, verbs: Array.from({ length: 51 }, (_, i) => `v${i}`) } });
  expect(many.status).toBe(400);
});
```

(Use the file's existing `ctx` fixture and `app` import names.)

- [ ] **Step 8: Update HELP**

`meta.ts` `handleHelp`: remove the SNOOZE and SLEEP lines, and change SCORE's line to `'SCORE                    Your score so far'`. World verbs are listed after the built-ins when the world has any: `HELP` takes `world` and appends `` `${id.toUpperCase().padEnd(25)}${v.words.slice(1).join(', ')}` `` for each.

- [ ] **Step 9: Run everything**

Run: `npm run lint && npm run type-check && npx vitest run 2>&1 | tail -4 && cd server && npm run lint && npm run type-check && npm test 2>&1 | tail -4`
Expected: all pass. The tutorial must still pass unchanged. If the tutorial used a removed synonym (check `tests/worlds/tutorial.test.ts` for `drink`, `answer`, `unplug`, etc.), give `tutorial.ts` a world verb for it, and keep `docs/guide/your-first-world.md` in sync.

- [ ] **Step 10: Commit**

```bash
git add src tests server
git commit -m "Instead/after rules and world-declared verbs; SNOOZE and INSTALL leave the engine"
```

---

### Task 6: Containers, surfaces, scenery and visibility

**Files:**
- Modify: `src/types/world.ts` (Item: `container`, `surface`, `scenery`, `door`, `article`, `contentsHeading`; Room: `scenery`), `src/engine/model.ts`, `src/engine/describe.ts`, `src/engine/verbs/objects.ts`, `src/engine/parser.ts`, `src/engine/engine.ts`, `server/src/llm.ts`
- Create: `src/engine/verbs/containers.ts`, `tests/engine/containers.test.ts`
- Modify: `tests/fixtures/world.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:

```ts
// world.ts, Item gains
container?: { openable?: boolean; open?: boolean; locked?: boolean; key?: string; transparent?: boolean; capacity?: number };
surface?: boolean;
scenery?: boolean;
door?: boolean;
/** "a", "an", "some", or "" for the listing article. Default by first letter. */
article?: string;
/** Heading over this container's contents in listings, e.g. “Your collection of treasures consists of:”. */
contentsHeading?: string;
// Room gains
scenery?: string[];

// model.ts
export function canSeeInside(world: World, state: GameState, id: string): boolean;   // surface, open, or transparent
export function canReachInside(world: World, state: GameState, id: string): boolean; // surface or open
export function visibleItems(world: World, state: GameState): string[];
export function reachableItems(world: World, state: GameState): string[];            // replaces the Task 1 version
export function isInside(state: GameState, id: string, ancestor: string): boolean;   // any depth

// containers.ts
export function handleOpen(target, world, state): EngineResult;
export function handleClose(target, world, state): EngineResult;
export function handleLock(target, indirect, world, state): EngineResult;
export function handleUnlock(target, indirect, world, state): EngineResult;
export function handlePut(target, indirect, prep: 'in' | 'on', world, state): EngineResult;
export function handleTakeFrom(target, indirect, world, state): EngineResult;
export function handleSearch(target, world, state): EngineResult;
```

New built-in actions: `open`, `close`, `lock`, `unlock`, `put` (with `ParsedAction.prep?: 'in' | 'on'`), `search`. `take` with an indirect object is take-from. Add them to `ACTION_VOCAB`, to HELP, and to `BUILT_IN_WORDS`.

> **Ruling (style):** Zork's listings ("There is a sword here.", "The small mailbox contains:", "Taken.") differ from Brass Lantern's ("You can see: sword.", "Taken: sword."). A world-level `style: 'infocom'` selects Zork's formats; the default `'brass'` keeps today's output, so existing worlds don't change. Container and surface listings are new, so both styles use Zork's wording for them. Cost if wrong: one field to remove.

> **Ruling (PUT fallback):** like OPEN, PUT falls back to the target's `onUse`/`instead.use` rules when the indirect object is neither a container nor a surface, so "put the disk in the drive" keeps working in worlds that modeled it as USE.

- [ ] **Step 1: Extend the fixture**

Add to `tests/fixtures/world.ts`:
- **items:**
  - `chest`: `{ name: 'wooden chest', aliases: ['chest'], description: 'A heavy wooden chest.', portable: false, tags: [], container: { openable: true, locked: true, key: 'key', capacity: 2 }, contains: ['coin'] }`;
  - `coin`: `{ name: 'gold coin', aliases: ['coin'], description: 'A gold coin.', portable: true, tags: [] }`;
  - `jar`: `{ name: 'glass jar', aliases: ['jar'], description: 'A glass jar.', portable: true, tags: [], container: { openable: true, transparent: true }, contains: ['marble'] }`;
  - `marble`: `{ name: 'marble', description: 'A blue marble.', portable: true, tags: [] }`;
  - `shelf`: `{ name: 'shelf', description: 'A sturdy shelf.', portable: false, tags: [], surface: true, contains: ['book'] }`;
  - `book`: `{ name: 'book', description: 'A dog-eared book.', portable: true, tags: [] }`;
  - `fence`: `{ name: 'fence', description: 'A white picket fence.', portable: false, tags: [], scenery: true }`;
  - `sky`: `{ name: 'sky', description: 'Blue, mostly.', portable: false, tags: [] }`.
- **rooms:** add `chest`, `jar` and `shelf` to `shed.items`; `fence` to `yard.items`; `scenery: ['sky']` to both `yard` and `shed`.

- [ ] **Step 2: Write the failing tests**

`tests/engine/containers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute } from '@/engine/engine';
import { reachableItems, visibleItems } from '@/engine/model';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const shed = () => stateWith(world, { room: 'shed', carrying: ['key'] });
const run = (s: ReturnType<typeof shed>, action: string, target?: string, indirect?: string, prep?: 'in' | 'on') =>
  execute({ action, target, indirect, ...(prep ? { prep } : {}) }, { world, state: s });
const unchanged = (s: ReturnType<typeof shed>, f: () => { understood?: boolean }) => {
  const before = structuredClone(s);
  f();
  expect(s).toEqual({ ...before, turns: s.turns });
};

describe('reach and sight', () => {
  it('sees into transparent containers but reaches only into open ones and surfaces', () => {
    const s = shed();
    expect(visibleItems(world, s)).toEqual(expect.arrayContaining(['marble', 'book', 'sky']));
    expect(reachableItems(world, s)).toContain('book');
    expect(reachableItems(world, s)).not.toContain('marble');
    expect(reachableItems(world, s)).not.toContain('coin');
    expect(visibleItems(world, s)).not.toContain('coin');
  });

  it('a closed container inside an open one hides its contents', () => {
    const s = shed();
    run(s, 'unlock', 'chest', 'key');
    run(s, 'open', 'chest');
    s.locations.jar = 'chest'; // the jar (closed, but transparent) inside the open chest
    expect(visibleItems(world, s)).toContain('marble');
    expect(reachableItems(world, s)).not.toContain('marble');
    s.locations.marble = 'chest';
    s.locations.coin = 'jar';
    world.items.jar.container!.transparent = false;
    try {
      expect(visibleItems(world, s)).not.toContain('coin');
      expect(run(s, 'take', 'coin').understood).toBe(false);
    } finally {
      world.items.jar.container!.transparent = true;
    }
  });
});

describe('open, close, lock, unlock', () => {
  it('a locked chest won’t open until unlocked with its key', () => {
    const s = shed();
    expect(run(s, 'open', 'chest').lines).toEqual(['The wooden chest is locked.']);
    expect(run(s, 'unlock', 'chest', 'key').lines).toEqual(['Unlocked.']);
    expect(run(s, 'open', 'chest').lines).toEqual(['Opening the wooden chest reveals a gold coin.']);
    expect(run(s, 'open', 'chest').lines).toEqual(['It’s already open.']);
    expect(run(s, 'close', 'chest').lines).toEqual(['Closed.']);
    expect(run(s, 'lock', 'chest', 'key').lines).toEqual(['Locked.']);
  });

  it('refusals are understood and change nothing', () => {
    const s = shed();
    unchanged(s, () => run(s, 'open', 'chest'));
    unchanged(s, () => run(s, 'unlock', 'chest', 'book'));
    unchanged(s, () => run(s, 'close', 'shelf'));
    expect(run(s, 'unlock', 'chest', 'book').lines).toEqual(['The book doesn’t fit the lock.']);
    expect(run(s, 'close', 'shelf').lines).toEqual(['You can’t close that.']);
  });

  it('an unknown target is a miss', () => {
    const s = shed();
    unchanged(s, () => expect(run(s, 'open', 'trombone').understood).toBe(false));
  });
});

describe('put and take from', () => {
  it('puts into an open container with room, and onto a surface', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key', 'wallet', 'bat'] });
    run(s, 'unlock', 'chest', 'key');
    run(s, 'open', 'chest');
    expect(run(s, 'put', 'wallet', 'chest', 'in').lines).toEqual(['Done.']);
    expect(s.locations.wallet).toBe('chest');
    expect(run(s, 'put', 'bat', 'chest', 'in').lines).toEqual(['There’s no room in the wooden chest.']);
    expect(run(s, 'put', 'bat', 'shelf', 'on').lines).toEqual(['Done.']);
    expect(s.locations.bat).toBe('shelf');
  });

  it('won’t put a container inside itself or its own contents', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['jar'] });
    run(s, 'open', 'jar');
    unchanged(s, () => expect(run(s, 'put', 'jar', 'jar', 'in').lines).toEqual(['You can’t put the glass jar inside itself.']));
    s.locations.marble = 'player';
    s.itemState.marble = {};
    world.items.marble.container = { openable: false };
    try {
      run(s, 'put', 'marble', 'jar', 'in');
      unchanged(s, () => expect(run(s, 'put', 'jar', 'marble', 'in').lines).toEqual(['You can’t put the glass jar inside itself.']));
    } finally {
      delete world.items.marble.container;
    }
  });

  it('takes from a container or surface', () => {
    const s = shed();
    expect(run(s, 'take', 'book', 'shelf').lines).toEqual(['Taken: book.']);
    expect(s.locations.book).toBe('player');
    expect(run(s, 'take', 'marble', 'jar').lines).toEqual(['The glass jar is closed.']);
  });

  it('PUT into something that isn’t a container falls back to its use rules', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['lamp'] });
    expect(run(s, 'put', 'lamp', 'socket', 'in').lines.join(' ')).toContain(world.events.plug_lamp[0]);
  });
});

describe('listings', () => {
  it('lists what’s on surfaces and in open or transparent containers; hides scenery', () => {
    const lines = describeCurrentRoom(world, shed());
    expect(lines).toContain('Sitting on the shelf is:');
    expect(lines).toContain('  A book');
    expect(lines).toContain('The glass jar contains:');
    expect(lines).toContain('  A marble');
    expect(lines.join('\n')).not.toContain('sky');
    expect(lines.join('\n')).not.toContain('gold coin');
    expect(describeCurrentRoom(world, stateWith(world, { room: 'yard' })).join('\n')).not.toContain('fence');
  });

  it('scenery and shared objects can be examined but not taken', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(run(s, 'examine', 'fence').lines).toEqual(['A white picket fence.']);
    expect(run(s, 'examine', 'sky').lines).toEqual(['Blue, mostly.']);
    expect(run(s, 'take', 'sky').lines).toEqual(['You can’t take the sky.']);
  });

  it('search lists contents when it can see inside', () => {
    const s = shed();
    expect(run(s, 'search', 'jar').lines).toEqual(['The glass jar contains:', '  A marble']);
    expect(run(s, 'search', 'chest').lines).toEqual(['The wooden chest is closed.']);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/engine/containers.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement visibility in `model.ts`**

```ts
export function canSeeInside(world: World, state: GameState, id: string): boolean {
  const item = world.items[id];
  if (!item) return false;
  if (item.surface) return true;
  if (!item.container || item.door) return false;
  return isOpen(world, state, id) || Boolean(item.container.transparent);
}

export function canReachInside(world: World, state: GameState, id: string): boolean {
  const item = world.items[id];
  if (!item) return false;
  return Boolean(item.surface) || (Boolean(item.container) && !item.door && isOpen(world, state, id));
}

function collect(world: World, state: GameState, roots: string[], into: (id: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    if (into(id)) for (const child of childrenOf(world, state, id)) walk(child);
  };
  roots.forEach(walk);
  return out;
}

function roots(world: World, state: GameState): string[] {
  const room = state.currentRoom;
  return [...childrenOf(world, state, room), ...(world.rooms[room]?.scenery ?? []), ...inventoryOf(world, state)];
}

export function visibleItems(world: World, state: GameState): string[] {
  return collect(world, state, roots(world, state), (id) => canSeeInside(world, state, id));
}

export function reachableItems(world: World, state: GameState): string[] {
  return collect(world, state, roots(world, state), (id) => canReachInside(world, state, id));
}

export function isInside(state: GameState, id: string, ancestor: string): boolean {
  for (let p = state.locations[id]; p; p = state.locations[p]) if (p === ancestor) return true;
  return false;
}
```

`isReachable` (Task 4) becomes `reachableItems(world, state).includes(id)` with this new `reachableItems`. `visibleItemsIn(roomId, …)` stays for the store getter but returns `childrenOf(world, state, roomId).filter((id) => !world.items[id]?.scenery)`. Matching for verbs that need to touch something uses `reachableItems`; EXAMINE and SEARCH use `visibleItems`. TAKE matching a visible-but-unreachable item replies `The ${container name} is closed.` (understood, no change).

- [ ] **Step 5: Implement the verbs (`containers.ts`)**

Each handler matches its target with `matchItem(target, visibleItems(world, state), world)`. A null match is `miss(...)`. It then checks everything **before** mutating:

```ts
export function handleOpen(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Open what?']);
  const id = matchItem(target, visibleItems(world, state), world);
  if (!id) return miss(`You don’t see a “${target}” here.`);
  const item = world.items[id];
  if (!item.container?.openable) {
    // Worlds that modeled OPEN as USE keep working.
    const rule = findRule(world, state, 'instead', 'use', { target: id, room: state.currentRoom }, reachableItems(world, state));
    return rule ? applyRule(rule, world, state) : ok(['You can’t open that.']);
  }
  if (isOpen(world, state, id)) return ok(['It’s already open.']);
  if (isLocked(world, state, id)) return ok([`The ${item.name} is locked.`]);
  (state.itemState[id] ??= {}).open = true;
  const inside = childrenOf(world, state, id);
  if (item.door || inside.length === 0 || item.container.transparent) return ok(['Opened.'], true);
  return ok([`Opening the ${item.name} reveals ${listPhrase(world, inside)}.`], true);
}
```

- `handleClose`: not openable → `You can’t close that.`; closed → `It’s already closed.`; else `itemState.open = false`, `Closed.`.
- `handleLock`/`handleUnlock`:
  - no `container.key` → `You can’t lock that.` / `You can’t unlock that.`;
  - no indirect → `Unlock it with what?`;
  - indirect not carried → `You aren’t carrying the ${name}.`;
  - wrong key → `The ${name} doesn’t fit the lock.`;
  - lock while open → `You’ll have to close it first.`;
  - already in that state → `It’s already locked.` / `It’s already unlocked.`;
  - else set `locked` and print `Locked.` / `Unlocked.`.
- `handlePut(target, indirect, prep)`:
  - target must be carried (`You aren’t carrying a “X”.` miss if unmatched);
  - indirect matched in `visibleItems`;
  - if the indirect is neither a container nor a surface → use-rule fallback (as in OPEN), else `You can’t put things ${prep} that.`;
  - `id === dest || isInside(state, dest, id)` → `You can’t put the ${name} inside itself.`;
  - surface with `prep === 'in'` or container with `'on'` → use the right one silently;
  - container not open → `The ${dest} is closed.`;
  - `capacity` and `childrenOf(dest).length >= capacity` → `There’s no room in the ${dest}.`;
  - else `moveItem(state, id, dest)`, `Done.`.
- `handleTakeFrom(target, indirect)`:
  - indirect matched in visible items;
  - can't reach inside → `The ${name} is closed.`;
  - target must be a child of it (matched against `childrenOf`), else `The ${target} isn’t in the ${name}.`;
  - then the normal take path (portable check, move to player, set `moved`).
- `handleSearch`:
  - can't see inside → `The ${name} is closed.` (container) or `You find nothing of interest.` (anything else);
  - else the contents heading plus indented items, as in listings below.

`listPhrase(world, ids)`: `a leaflet`, `a leaflet and a sword`, `a leaflet, a sword, and a lamp` (Zork's PRINT-CONTENTS uses the serial comma), each with the item's article (`item.article ?? (/^[aeiou]/i.test(name) ? 'an' : 'a')`, followed by a space unless the article is empty).

- [ ] **Step 6: Implement listings (`describe.ts`)**

```ts
function heading(world: World, id: string): string {
  const item = world.items[id];
  if (item.contentsHeading) return item.contentsHeading;
  return item.surface ? `Sitting on the ${item.name} is:` : `The ${item.name} contains:`;
}

/** “A leaflet” lines, nested two spaces per level, for everything visible inside `id`. */
export function contentsLines(world: World, state: GameState, id: string, level = 1): string[] {
  if (!canSeeInside(world, state, id)) return [];
  const kids = childrenOf(world, state, id).filter((k) => !world.items[k]?.scenery);
  if (kids.length === 0) return [];
  const pad = '  '.repeat(level - 1);
  const lines = [`${pad}${heading(world, id)}`];
  for (const k of kids) {
    lines.push(`${'  '.repeat(level)}${capitalizedArticle(world, k)}${world.items[k].name}`);
    lines.push(...contentsLines(world, state, k, level + 1));
  }
  return lines;
}
```

`capitalizedArticle` is `A `, `An `, `Some ` or the empty string, from the article rule above.

In `describeRoom`, after the description, for each listable item (room children, not scenery):
- in `style: 'infocom'`, the item's sentence is `There is ${article} ${name} here.` unless Task 8's descriptions apply;
- in `'brass'` style, items are gathered into the existing `You can see:` line;
- then `contentsLines(world, state, id)` for each listable item (both styles).

`handleInventory` uses `You are carrying:` followed by, in `'infocom'` style, `  ${capitalizedArticle}${name}` per item, or in `'brass'` style the existing `  - ${name}`, followed by `contentsLines` for carried containers at level 2. `style: 'infocom'` also omits the `Exits:` line and prints `Taken.`/`Dropped.` instead of `Taken: X.`/`Dropped: X.`.

- [ ] **Step 7: Parse the new verbs**

In `parser.ts`, replace `RE.use` and `RE.insert` with:

```ts
use: /^(?:use|operate)\s+(?:the\s+)?(.+?)(?:\s+(?:on|in|into|with)\s+(?:the\s+)?(.+))?$/i,
open: /^open\s+(?:the\s+)?(.+)$/i,
close: /^(?:close|shut)\s+(?:the\s+)?(.+)$/i,
lock: /^lock\s+(?:the\s+)?(.+?)(?:\s+with\s+(?:the\s+)?(.+))?$/i,
unlock: /^unlock\s+(?:the\s+)?(.+?)(?:\s+with\s+(?:the\s+)?(.+))?$/i,
putIn: /^(?:put|insert|place|slide|stick|feed|plug)\s+(?:the\s+|a\s+)?(.+?)\s+(?:in|into|inside)\s+(?:the\s+|my\s+)?(.+)$/i,
putOn: /^(?:put|place|set)\s+(?:the\s+|a\s+)?(.+?)\s+(?:on|onto)\s+(?:the\s+)?(.+)$/i,
takeFrom: /^(?:take|get|remove)\s+(?:the\s+)?(.+?)\s+(?:from|out\s+of|off)\s+(?:the\s+)?(.+)$/i,
search: /^(?:search|look\s+in|look\s+inside)\s+(?:the\s+)?(.+)$/i,
```

`VERB_PATTERNS` order: `takeFrom` before `take`; `putIn`, `putOn` after `wear` and `drop` (so "put on X" stays WEAR and "put down" stays DROP); `search` before `examine`. `putIn` yields `{ action: 'put', target, indirect, prep: 'in' }` and `putOn` yields `prep: 'on'`; `takeFrom` yields `{ action: 'take', target, indirect }`. Add `prep?: 'in' | 'on'` to `ParsedAction`. Add parser tests:

```ts
it('parses container verbs', () => {
  expect(fallbackParse('put the leaflet in the mailbox')).toEqual({ action: 'put', target: 'leaflet', indirect: 'mailbox', prep: 'in' });
  expect(fallbackParse('put book on shelf')).toEqual({ action: 'put', target: 'book', indirect: 'shelf', prep: 'on' });
  expect(fallbackParse('put on shirt')).toEqual({ action: 'wear', target: 'shirt' });
  expect(fallbackParse('take coin from chest')).toEqual({ action: 'take', target: 'coin', indirect: 'chest' });
  expect(fallbackParse('unlock chest with key')).toEqual({ action: 'unlock', target: 'chest', indirect: 'key' });
  expect(fallbackParse('look in jar')).toEqual({ action: 'search', target: 'jar' });
  expect(fallbackParse('open mailbox')).toEqual({ action: 'open', target: 'mailbox' });
});
```

Dispatch in `engine.ts` through `withRules`:

| Action | Handler |
|---|---|
| `open` | `handleOpen` |
| `close` | `handleClose` |
| `lock` | `handleLock` |
| `unlock` | `handleUnlock` |
| `put` | `handlePut(target, indirect, prep ?? 'in')` |
| `search` | `handleSearch` |
| `take` with an indirect | `handleTakeFrom` |

Add `open`, `close`, `lock`, `unlock`, `put`, `search` to the server's `ACTION_VOCAB`, and a system-prompt rule: "Putting something in or on something is put (prep in/on goes in indirect's meaning); opening is open." Update HELP with:

```
OPEN / CLOSE <thing>
LOCK / UNLOCK <thing> WITH <key>
PUT <item> IN|ON <thing>
TAKE <item> FROM <thing>
LOOK IN <thing>
```

The intent server can't express `prep`; the engine defaults a missing `prep` to the destination's kind (surface → on, else in), as in `handlePut`.

- [ ] **Step 8: Extend the miss invariant suite**

In `tests/engine/engine-hooks.test.ts`, the existing "misses never mutate" test iterates over actions; add `open`, `close`, `lock`, `unlock`, `put`, `search` with the target `'zz_nothing'`, and `take` with `('zz_nothing', 'chest')`.

- [ ] **Step 9: Run everything**

Run: `npm run lint && npm run type-check && npx vitest run 2>&1 | tail -4 && cd server && npm test 2>&1 | tail -3`
Expected: all pass, tutorial unchanged.

- [ ] **Step 10: Commit**

```bash
git add src tests server
git commit -m "Containers, surfaces, scenery and visibility; open, close, lock, unlock, put, take from, search"
```

---

### Task 7: Exits with conditions, doors, ENTER/CLIMB, diagonals

**Files:**
- Modify: `src/types/world.ts` (`Exit`, `exits: Record<string, string | Exit>`), `src/engine/fuzzy.ts`, `src/engine/describe.ts`, `src/engine/verbs/movement.ts`, `src/engine/parser.ts`, `src/engine/intent-client.ts`, `server/src/llm.ts`
- Create: `tests/engine/exits.test.ts`
- Modify: `tests/fixtures/world.ts`

**Interfaces:**
- Produces:

```ts
export interface Exit { to?: string; if?: string; denial?: string; door?: string }
// Room.exits: Record<string, string | Exit>
// movement.ts
export function exitTarget(exit: string | Exit): string | undefined;
export function handleEnter(target: string | undefined, world, state): EngineResult;
export function handleClimb(target: string | undefined, world, state): EngineResult;
// fuzzy.ts: fuzzyMatchExit(input, exits: Record<string, unknown>)  (only the labels are read)
```

New built-in actions: `enter`, `climb`. Directions gain `ne`, `nw`, `se`, `sw`, `northeast`, `northwest`, `southeast`, `southwest`, `u`, `d`.

- [ ] **Step 1: Extend the fixture**

- **yard exits** gain `west: { denial: 'The fence is too high to climb.' }` and `climb: { denial: 'The fence is too high to climb.' }`.
- **shed exits** gain `northeast: { to: 'loft', door: 'hatch' }` and `up: { to: 'loft', door: 'hatch' }`, with `scenery: ['sky', 'hatch']`.
- **a new room:** `loft: { name: 'Loft', description: 'A cramped loft.', exits: { southwest: { to: 'shed', door: 'hatch' }, down: { to: 'shed', door: 'hatch' } }, items: [], npcs: [], onEnter: [], scenery: ['hatch'] }`.
- **an item:** `hatch: { name: 'hatch', description: 'A wooden hatch in the ceiling.', portable: false, tags: [], door: true, container: { openable: true } }`.
- **living exits** gain `south: { to: 'yard', if: 'flag:paid', denial: 'The door is stuck.' }`.

- [ ] **Step 2: Write the failing tests**

`tests/engine/exits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (s: ReturnType<typeof stateWith>, action: string, target?: string) => execute({ action, target }, { world, state: s });

describe('exits', () => {
  it('a message-only exit says its piece and goes nowhere', () => {
    const s = stateWith(world, { room: 'yard' });
    const before = structuredClone(s);
    const r = run(s, 'go', 'west');
    expect(r.lines).toEqual(['The fence is too high to climb.']);
    expect(r.understood).not.toBe(false);
    expect(s).toEqual({ ...before, turns: 1 });
  });

  it('a conditional exit is refused until its condition holds', () => {
    const s = stateWith(world, { room: 'living' });
    expect(run(s, 'go', 'south').lines).toEqual(['The door is stuck.']);
    s.flags.paid = true;
    run(s, 'go', 'south');
    expect(s.currentRoom).toBe('yard');
  });

  it('a door must be open, from either side', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key'] });
    expect(run(s, 'go', 'up').lines).toEqual(['The hatch is closed.']);
    expect(run(s, 'open', 'hatch').lines).toEqual(['Opened.']);
    run(s, 'go', 'ne');
    expect(s.currentRoom).toBe('loft');
    run(s, 'close', 'hatch');
    expect(run(s, 'go', 'down').lines).toEqual(['The hatch is closed.']);
  });

  it('enter and climb take a matching exit', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(run(s, 'climb', 'fence').lines).toEqual(['The fence is too high to climb.']);
    run(s, 'enter', 'shed');
    expect(s.currentRoom).toBe('yard'); // the shed requires the key
    const s2 = stateWith(world, { room: 'yard', carrying: ['key'] });
    run(s2, 'enter', 'shed');
    expect(s2.currentRoom).toBe('shed');
  });

  it('parses diagonals and U/D', () => {
    expect(fallbackParse('ne')).toEqual({ action: 'go', target: 'northeast' });
    expect(fallbackParse('sw')).toEqual({ action: 'go', target: 'southwest' });
    expect(fallbackParse('u')).toEqual({ action: 'go', target: 'up' });
    expect(fallbackParse('d')).toEqual({ action: 'go', target: 'down' });
    expect(fallbackParse('climb the tree')).toEqual({ action: 'climb', target: 'tree' });
    expect(fallbackParse('climb up')).toEqual({ action: 'climb', target: 'up' });
    expect(fallbackParse('enter house')).toEqual({ action: 'enter', target: 'house' });
  });

  it('message-only exits aren’t listed unless listExits names them', () => {
    expect(describeCurrentRoom(world, stateWith(world, { room: 'yard' })).join('\n')).not.toMatch(/Exits:.*west/);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/engine/exits.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

`movement.ts`:

```ts
export function exitTarget(exit: string | Exit | undefined): string | undefined {
  return typeof exit === 'string' ? exit : exit?.to;
}

/** Follow one exit: checks before moving, so a refusal changes nothing. */
export function followExit(exit: string | Exit, world: World, state: GameState): EngineResult {
  if (typeof exit !== 'string') {
    if (exit.if && !evaluateCondition(exit.if, state, world)) return ok([exit.denial ?? 'You can’t go that way.']);
    if (exit.door && !isOpen(world, state, exit.door)) {
      return ok([exit.denial ?? `The ${world.items[exit.door]?.name ?? exit.door} is closed.`]);
    }
    if (!exit.to) return ok([exit.denial ?? 'You can’t go that way.']);
  }
  const lines = enterRoom(exitTarget(exit)!, world, state);
  return ok(lines, state.currentRoom === exitTarget(exit));
}
```

`handleGo` uses `followExit(room.exits[exitKey], world, state)`. `enterRoom`'s refusal path (`requires`) already returns without mutating.

- `handleEnter(target)`: no target → exit `in`/`inside`; otherwise the exit whose label fuzzy-matches the target; otherwise an `instead.enter` rule; otherwise `miss('You can’t enter that.')`.
- `handleClimb(target)`: `up`/`down` targets → those exits; else an exit labeled `climb` when the target matches a visible item or the word `climb`; else the exit matching the target; else an `instead.climb` rule; else `miss('You can’t climb that.')`.
- `handleIdle` uses `followExit`.

`describe.ts` `exitList`:
- skip labels whose exit has no `to`, unless they're in `listExits`;
- compass matching compares `exitTarget`s;
- `COMPASS` gains the four diagonals.

`fuzzy.ts`: accept `Record<string, unknown>`; synonyms gain `ne`, `nw`, `se`, `sw`, `u`, `d`; `STRICT_DIRECTIONS` gains the diagonals.

`parser.ts`:
- `DIRECTIONS` gains `ne: 'northeast'`, `northeast: 'northeast'`, and the same for nw/se/sw, plus `u: 'up'`, `d: 'down'`;
- `RE.enter` becomes the `enter` action (`/^(?:enter|go\s+into)\s+(?:the\s+)?(.+)$/i` → `enter`), checked before `movement`;
- add `climb: /^climb(?:\s+(up|down))?(?:\s+(?:the\s+)?(.+))?$/i` → `{ action: 'climb', target: m[2] ?? m[1] }`, with bare `climb` giving `{ action: 'climb' }`;
- `in`, `inside`, `out`, `outside` stay GO.

Add `enter`, `climb` to `BUILT_IN_WORDS`, `ACTION_VOCAB` and HELP (`ENTER <place> / CLIMB <thing>`). `intent-client.ts` `exits: Object.keys(room.exits)` stays (labels only).

- [ ] **Step 5: Run everything**

Run: `npm run lint && npm run type-check && npx vitest run 2>&1 | tail -4`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src tests server
git commit -m "Exits with conditions and messages, doors, ENTER/CLIMB, diagonals"
```

---

### Task 8: Descriptions, READ, and switchable items

**Files:**
- Modify: `src/types/world.ts` (Item: `text`, `initialDescription`, `roomDescription`, `switchable`; Room: `firstDescription`), `src/engine/describe.ts`, `src/engine/verbs/objects.ts`, `src/engine/parser.ts`, `server/src/llm.ts`
- Create: `tests/engine/descriptions.test.ts`
- Modify: `tests/fixtures/world.ts`

**Interfaces:**
- Produces: built-in actions `read`, `turn_on`, `turn_off`; `handleRead`, `handleSwitch(on: boolean)` in `objects.ts`.

- [ ] **Step 1: Extend the fixture**

- `book` gains `text: '“It was a dark and stormy night.”'`.
- `wallet` gains `initialDescription: 'A wallet lies by the door.'` and `roomDescription: 'Someone dropped a wallet here.'`.
- `lamp` gains `switchable: true`.
- `shed` gains `firstDescription: 'You push the door open. A dusty shed, untouched for years. A crate sits in the middle.'`.

- [ ] **Step 2: Write the failing tests**

`tests/engine/descriptions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (s: ReturnType<typeof stateWith>, action: string, target?: string) => execute({ action, target }, { world, state: s });

describe('descriptions', () => {
  it('an item uses its initial sentence until moved, then its room sentence', () => {
    const s = stateWith(world, { room: 'living' });
    expect(describeCurrentRoom(world, s)).toContain('A wallet lies by the door.');
    run(s, 'take', 'wallet');
    run(s, 'drop', 'wallet');
    const lines = describeCurrentRoom(world, s);
    expect(lines).toContain('Someone dropped a wallet here.');
    expect(lines.join('\n')).not.toMatch(/You can see:.*wallet/);
  });

  it('a room’s first description shows on the first visit only', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['key'] });
    expect(run(s, 'go', 'shed').lines).toContain(world.rooms.shed.firstDescription);
    run(s, 'go', 'out');
    expect(run(s, 'go', 'shed').lines).toContain(world.rooms.shed.description);
  });

  it('READ shows text, or falls back to the description', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key'] });
    expect(run(s, 'read', 'book').lines).toEqual(['“It was a dark and stormy night.”']);
    expect(run(s, 'read', 'crate').lines).toEqual(['A nailed-shut crate.']);
  });

  it('turns switchable things on and off; others refuse without changing anything', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['lamp', 'bat'] });
    expect(run(s, 'turn_on', 'lamp').lines).toEqual(['The lamp is now on.']);
    expect(s.itemState.lamp.on).toBe(true);
    expect(run(s, 'turn_on', 'lamp').lines).toEqual(['It’s already on.']);
    expect(run(s, 'turn_off', 'lamp').lines).toEqual(['The lamp is now off.']);
    const before = structuredClone(s);
    expect(run(s, 'turn_on', 'bat').lines).toEqual(['You can’t turn that on.']);
    expect(s).toEqual({ ...before, turns: s.turns });
  });

  it('parses read and switch verbs', () => {
    expect(fallbackParse('read the book')).toEqual({ action: 'read', target: 'book' });
    expect(fallbackParse('turn on lamp')).toEqual({ action: 'turn_on', target: 'lamp' });
    expect(fallbackParse('turn the lamp off')).toEqual({ action: 'turn_off', target: 'lamp' });
    expect(fallbackParse('switch off lamp')).toEqual({ action: 'turn_off', target: 'lamp' });
    expect(fallbackParse('light lamp')).toEqual({ action: 'turn_on', target: 'lamp' });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/engine/descriptions.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

`describe.ts`:
- description line: `const text = room.firstDescription && !state.visited.slice(0, -1).includes(roomId) && state.visited.includes(roomId) ? room.firstDescription : room.description;`. The room was just pushed onto `visited` by `enterRoom`, so the first visit is when the only entry for it is the last one. Use a helper `firstVisit(state, roomId)` that counts occurrences; `visited` holds each room once, so instead **record `firstVisit` in `enterRoom` before pushing** and pass it to `describeRoom(roomId, world, state, { first: boolean })`. `openingLines` passes `first: true`.
- item sentences: `const moved = state.itemState[id]?.moved; const sentence = !moved && item.initialDescription ? item.initialDescription : item.roomDescription;`. Items with a sentence print it on its own line and are excluded from the `You can see:` aggregate (brass) or the generated `There is a … here.` (infocom).

`objects.ts`:
- `handleRead(target)`: match in `visibleItems`; miss if none; `ok([item.text ?? item.description])`.
- `handleSwitch(target, on)`:
  - match in `reachableItems`; miss if none;
  - not `switchable` → `You can’t turn that ${on ? 'on' : 'off'}.`;
  - already in that state → `It’s already ${on ? 'on' : 'off'}.`;
  - else set `itemState.on` and print `The ${name} is now ${on ? 'on' : 'off'}.` (mutated).

`parser.ts`:
- `RE.examine` drops `read`;
- add `read: /^read\s+(?:the\s+)?(.+)$/i`;
- add `turnOn: /^(?:turn|switch)\s+on\s+(?:the\s+)?(.+)$|^(?:turn|switch)\s+(?:the\s+)?(.+?)\s+on$|^light\s+(?:the\s+)?(.+)$/i`;
- add `turnOff` likewise, without `light`;
- for these alternations the target is the first defined capture (`m[1] ?? m[2] ?? m[3]`); give `VERB_PATTERNS` entries an optional extractor so patterns with alternations can return the right group.

Add `read`, `turn_on`, `turn_off` to `BUILT_IN_WORDS` (`read`, `turn`, `switch`, `light`), `ACTION_VOCAB`, HELP and the dispatcher via `withRules`.

- [ ] **Step 5: Run everything**

Run: `npm run lint && npm run type-check && npx vitest run 2>&1 | tail -4 && cd server && npm test 2>&1 | tail -3`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src tests server
git commit -m "First-seen and room sentences, first-visit text, READ, TURN ON/OFF"
```

---

### Task 9: The native Zork I slice

**Files:**
- Create: `src/worlds/zork1.ts`, `tests/worlds/zork1.test.ts`
- Modify: `src/app.config.ts` (add the cartridge after ZORK III), `THIRD_PARTY_NOTICES.md`, `tests/app.config.test.ts` (the trilogy test now filters `zcode` cartridges; add the native one to a separate assertion)

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces: `export const zork1: World` with `style: 'infocom'`.

Source for all text: `/tmp/zork1src/1dungeon.zil` (rooms and objects: lines 1239–1460 for rooms, the object definitions above them) and `/tmp/zork1src/1actions.zil` (room and object action routines). Refetch with `gh api repos/historicalsource/zork1/contents/<file> --jq .content | base64 -d` if /tmp was cleared. Copy each LDESC/FDESC/DESC/TEXT verbatim, apart from turning straight quotes and apostrophes into curly ones (the diff harness normalizes quotes).

- [ ] **Step 1: Write the failing playthrough test**

`tests/worlds/zork1.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse, splitCommands } from '@/engine/parser';
import { verbClashes } from '@/engine/parser';
import { zork1 } from '@/worlds/zork1';

function play(commands: string[]) {
  const state = initialState(zork1);
  const out: string[] = [...openingLines(zork1, state)];
  for (const c of commands) {
    for (const piece of splitCommands(c, zork1.verbs)) {
      const parsed = fallbackParse(piece, zork1.verbs) ?? { action: 'unknown' };
      out.push(`> ${piece}`, ...execute(parsed, { world: zork1, state }).lines);
    }
  }
  return { state, text: out.join('\n') };
}

describe('Zork I, natively: house and forest', () => {
  it('opens west of the house', () => {
    const { text } = play([]);
    expect(text).toContain('West of House');
    expect(text).toContain('There is a small mailbox here.');
  });

  it('the mailbox, the leaflet and reading it', () => {
    const { text, state } = play(['open mailbox', 'take leaflet', 'read leaflet']);
    expect(text).toContain('Opening the small mailbox reveals a leaflet.');
    expect(text).toContain('WELCOME TO ZORK!');
    expect(state.locations.leaflet).toBe('player');
  });

  it('into the house by the window, and up to the attic for the rope', () => {
    const { state } = play(['n', 'e', 'open window', 'w', 'w', 'take lamp', 'e', 'u', 'take rope', 'd']);
    expect(state.locations.lamp).toBe('player');
    expect(state.locations.rope).toBe('player');
    expect(state.currentRoom).toBe('kitchen');
  });

  it('moving the rug reveals the trap door, which opens onto unbuilt stairs', () => {
    const { text } = play(['n', 'e', 'open window', 'w', 'w', 'move rug', 'open trap door', 'd']);
    expect(text).toContain('With a great effort, the rug is moved to one side of the room, revealing the dusty cover of a closed trap door.');
    expect(text).toContain('The door reluctantly opens to reveal a rickety staircase descending into darkness.');
    expect(text).toContain('The rest of the Great Underground Empire isn’t built yet.');
  });

  it('the egg up the tree scores', () => {
    const { state } = play(['n', 'n', 'u', 'take egg']);
    expect(state.locations.egg).toBe('player');
    expect(state.flags.took_egg).toBe(true);
  });

  it('no world verb clashes with a built-in', () => {
    expect(verbClashes(zork1.verbs)).toEqual([]);
  });
});
```

The expected strings come from the Zork source: check each one against `1actions.zil` (`RUG-FCN`, `TRAP-DOOR-FCN`) and `1dungeon.zil` before relying on it, and correct the test if the source differs.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/worlds/zork1.test.ts`
Expected: FAIL; module not found.

- [ ] **Step 3: Write the world**

`src/worlds/zork1.ts` exports `zork1: World` with:

- `style: 'infocom'`, `startRoom: 'west_of_house'`, `emptyInventory: 'You are empty-handed.'`.
- **Rooms** (IDs snake-cased from ZIL): `west_of_house`, `north_of_house`, `south_of_house`, `east_of_house` (Behind House), `forest_1`, `forest_2`, `forest_3`, `path`, `up_a_tree`, `grating_clearing`, `clearing`, `kitchen`, `living_room`, `attic`.
  - Each room's `description` is its LDESC (or, where the ZIL room has an action routine producing the text, that routine's M-LOOK text for the state at game start).
  - Exits mirror the ZIL `NORTH TO` / `IF` / `PER` lines. UEXITs are strings; NEXITs (`"The door is boarded and you can't remove the boards."`) are `{ denial }`; DEXITs use `door`.
  - The kitchen window is a door item (`kitchen_window`) in `east_of_house` and `kitchen` scenery, with `container: { openable: true }`.
  - The trap door is `trap_door` in `living_room` scenery with `door: true`, `container: { openable: true }`. Its `down` exit is `{ door: 'trap_door', if: 'flag:rug_moved', denial: 'The rest of the Great Underground Empire isn’t built yet.' }` with no `to`. A second exit spec isn't needed: the door check gives "The trap door is closed." first, and the message exit gives the boundary line when it's open.
  - The grating is `grate` in `grating_clearing` scenery, hidden until `leaves` are moved (`instead.take` on the grate checks `flag:leaves_moved`). Its `down` exit gives the same boundary line.
  - The front door is a message exit.
  - `listExits` is unused (infocom style omits the line).
- **Items:** `mailbox` (container, openable, `contains: ['leaflet']`, not portable, refusal “It is securely anchored.”), `leaflet` (`text` = the ZIL leaflet TEXT), `kitchen_table` (surface, `contains: ['sack', 'bottle']`), `sack` (container openable, `contains: ['lunch', 'garlic']`), `bottle` (container, transparent, `contains: ['water']`), `water`, `lunch`, `garlic`, `trophy_case` (container openable, transparent, `contentsHeading: 'Your collection of treasures consists of:'`), `lamp` (switchable, `initialDescription` = its FDESC), `sword` (`initialDescription` = its FDESC), `rug` (not portable, `instead.move` → event `rug_moved` with the ZIL text and `[Flag set: rug moved]`; a second rule `if: 'flag:rug_moved'` says “Having moved the carpet previously, you find it impossible to move it again.”), `rope`, `knife`, `nest` (container, `contains: ['egg']`), `egg` (`after.take` → event `took_egg` with `[Flag set: took egg]`), `leaves`, `grate`, `house` and `forest` scenery shared by the outside rooms (`room.scenery`), `boards`, `front_door` scenery.
  - Each item's `name` is the ZIL DESC, and `aliases` are its SYNONYM and ADJECTIVE words.
- **World verbs:** `move` (`words: ['move', 'push', 'pull', 'shift']`, `target: 'required'`, `reply: 'Moving the {target} reveals nothing.'` simplified to `'Moving it reveals nothing.'`), `pray`, `jump`, `listen`, `smell`, `wave`, `ring`, `count`, `diagnose` (each with Zork's default reply from `gverbs.zil` `V-PRAY` etc.).
- **Scoring:** `[{ flag: 'took_egg', points: 5 }]`; ranks from `1actions.zil` `V-SCORE`.
- `flagLabels`: `rug moved`, `took egg`, `leaves moved`.
- `events`:
  - `intro: ['ZORK I: The Great Underground Empire', 'Infocom interactive fiction - a fantasy story', 'Copyright (c) 1981, 1982, 1983, 1984, 1985, 1986 Infocom, Inc. All rights reserved.', 'ZORK is a registered trademark of Infocom, Inc.', 'Release 119 / Serial number 880429', '[Native Brass Lantern port, stage 1: the house and the forest.]']`;
  - the rug, egg and leaves events.

This step is long authoring work. Write room by room, running the test after each pair of rooms.

- [ ] **Step 4: Add the cartridge and the notice**

`src/app.config.ts`: append `{ kind: 'world', id: 'zork1-native', title: 'ZORK I · NATIVE', world: zork1 }`. `THIRD_PARTY_NOTICES.md`: a row for `src/worlds/zork1.ts`: text adapted from historicalsource/zork1 under its MIT license (Copyright (c) 2025 Microsoft). `tests/app.config.test.ts`: the trilogy assertion already filters `kind === 'zcode'`; add `expect(cartridges.map((c) => c.id)).toContain('zork1-native');`.

- [ ] **Step 5: Run everything**

Run: `npm run lint && npm run type-check && npx vitest run 2>&1 | tail -4`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src tests THIRD_PARTY_NOTICES.md
git commit -m "Native Zork I, stage 1: the house and the forest"
```

---

### Task 10: The differential harness

**Files:**
- Create: `tests/worlds/zork1-diff.test.ts`, `tests/worlds/zork1-allowlist.ts`
- Uses: `tests/fixtures/zork1.z3`, `src/zmachine/session.ts`, `src/zmachine/dialog.ts`

**Interfaces:**
- Consumes: `zork1` (Task 9), `ZMachineSession`, `LocalStorageDialog`.
- Produces:

```ts
// zork1-allowlist.ts
export interface AllowedDifference { command: string; reason: string; native?: string; original?: string }
export const ALLOWED: AllowedDifference[];
export const WALKTHROUGH: string[];
```

- [ ] **Step 1: Write the harness test**

`tests/worlds/zork1-diff.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { zork1 } from '@/worlds/zork1';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { ZMachineSession } from '@/zmachine/session';
import { ALLOWED, WALKTHROUGH } from './zork1-allowlist';

const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));

/** Same text, give or take case, spacing, quote style and the room marker. */
export function normalize(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/📍 /g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function original(commands: string[]): Promise<string[][]> {
  const replies: string[][] = [];
  let lines: string[] = [];
  let waiting = false;
  const session = new ZMachineSession(story, new LocalStorageDialog('diff'), {
    onLines: (l) => lines.push(...l), onStatus: () => {}, onExit: () => {},
    onWaiting: () => { waiting = true; }, onError: (m) => { throw new Error(m); },
  });
  const settle = async () => {
    const start = Date.now();
    while (!waiting) {
      if (Date.now() - start > 4000) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 5));
    }
    waiting = false;
    const out = lines;
    lines = [];
    return out;
  };
  session.start();
  await settle(); // the banner
  for (const c of commands) {
    session.submit(c);
    replies.push(await settle());
  }
  return replies;
}

function native(commands: string[]): string[][] {
  const state = initialState(zork1);
  openingLines(zork1, state);
  return commands.map((c) => execute(fallbackParse(c, zork1.verbs) ?? { action: 'unknown' }, { world: zork1, state }).lines);
}

describe('native Zork I against the original', () => {
  beforeEach(() => localStorage.clear());

  it('matches reply for reply along the walkthrough, apart from listed differences', async () => {
    const theirs = await original(WALKTHROUGH);
    const ours = native(WALKTHROUGH);
    const mismatches: string[] = [];
    WALKTHROUGH.forEach((command, i) => {
      if (normalize(ours[i]) === normalize(theirs[i])) return;
      if (ALLOWED.some((a) => a.command === command)) return;
      mismatches.push(`> ${command}\n  native:   ${ours[i].join(' / ')}\n  original: ${theirs[i].join(' / ')}`);
    });
    expect(mismatches).toEqual([]);
  }, 30_000);

  it('every allowlisted difference is still a difference', async () => {
    const commands = ALLOWED.map((a) => a.command).filter((c) => WALKTHROUGH.includes(c));
    const theirs = await original(WALKTHROUGH);
    const ours = native(WALKTHROUGH);
    for (const c of commands) {
      const i = WALKTHROUGH.indexOf(c);
      expect(normalize(ours[i]), `“${c}” now matches; remove it from the allowlist`).not.toBe(normalize(theirs[i]));
    }
  }, 30_000);
});
```

- [ ] **Step 2: Write the walkthrough and an empty allowlist**

`tests/worlds/zork1-allowlist.ts`:

```ts
export interface AllowedDifference { command: string; reason: string }

/** One pass through the stage-1 slice. Commands must be unique (the allowlist keys on them). */
export const WALKTHROUGH: string[] = [
  'look', 'examine mailbox', 'open mailbox', 'take leaflet', 'read leaflet', 'drop leaflet',
  'north', 'east', 'examine window', 'open window', 'west', 'look', 'examine table',
  'open sack', 'take sack', 'take bottle', 'west', 'take lamp', 'turn on lamp', 'turn off lamp',
  'take sword', 'move rug', 'open trap door', 'down', 'east', 'up', 'take rope', 'take knife',
  'down', 'east', 'south', 'east', 'north', 'north', 'up', 'take egg', 'down', 'inventory', 'score',
];

export const ALLOWED: AllowedDifference[] = [];
```

The walkthrough lists **unique** commands. Where a command repeats in a real playthrough (`west`), use its exact synonym the second time (`w`) so each entry is unique.

- [ ] **Step 3: Run it and work the mismatches**

Run: `npx vitest run tests/worlds/zork1-diff.test.ts 2>&1 | tail -60`
Expected: FAIL with a list of mismatches. For each one:
1. If the native world's text is wrong (a typo, the wrong sentence), fix `zork1.ts`.
2. If the engine's default text differs from Zork's for a reason a world can't control (e.g. the score line format), either change the `'infocom'` style output in the engine to Zork's wording (preferred, when it's a formatting difference), or add an allowlist entry with the reason.
3. Randomness, darkness, the grue, the trap door slamming and room points are allowlisted with the stage that removes them (“stage 2: darkness”).

Repeat until the test passes.

- [ ] **Step 4: Run everything**

Run: `npm run lint && npm run type-check && npm run test:coverage 2>&1 | tail -8`
Expected: all pass; coverage thresholds met.

- [ ] **Step 5: Commit**

```bash
git add tests src
git commit -m "Differential test: native Zork I against the Z-machine original"
```

---

### Task 11: Docs, changelog, release prep

**Files:**
- Modify: `docs/reference/world-schema.md`, `docs/reference/conditions-and-events.md`, `docs/reference/commands.md`, `docs/reference/cartridges.md`, `docs/guide/how-it-works.md`, `docs/guide/your-first-world.md` (only if Snack Attack changed), `docs/guide/z-machine.md` (mention the native port), `docs/.vitepress/config.mts`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `package.json`, `server/package.json`
- Create: `docs/guide/porting-zork.md`

- [ ] **Step 1: Write the docs**

- **world-schema.md:**
  - Item: `contains`, `container`, `surface`, `scenery`, `door`, `article`, `contentsHeading`, `text`, `initialDescription`, `roomDescription`, `switchable`, `instead`, `after`;
  - Room: `scenery`, `firstDescription`, `instead`, `after`, `Exit` objects;
  - World: `verbs`, `style`, `emptyInventory`, `smashRefusal`;
  - `onSnooze` removed;
  - a "Rules" section with the lookup order.
- **conditions-and-events.md:** `open:`, `locked:`, `on:`, `here:`, `visited:`, `inside:X:PLACE`.
- **commands.md:**
  - OPEN, CLOSE, LOCK/UNLOCK … WITH, PUT … IN/ON, TAKE … FROM, LOOK IN/SEARCH, READ, TURN ON/OFF, ENTER, CLIMB, NE/NW/SE/SW, U/D;
  - remove SNOOZE and SLEEP (now world verbs), and note that worlds can add verbs.
- **how-it-works.md:**
  - the object tree;
  - the store passes the world's verbs to the parser and the intent server;
  - the save format and migration;
  - "Adding a verb" gains the world-verb route.
- **porting-zork.md:**
  - how ZIL maps to the schema (ROOM → room, OBJECT → item, CONTBIT/OPENBIT/TRANSBIT → `container`, SURFACEBIT → `surface`, NDESCBIT → `scenery`, LOCAL-GLOBALS → `room.scenery`, FDESC/LDESC → `initialDescription`/`roomDescription`, UEXIT/NEXIT/CEXIT/DEXIT → exits, action routines → `instead`/`after` rules);
  - the differential test and how to read its output;
  - what stage 2 brings.
- **sidebar:** add *Porting Zork* under Guide.
- **README:** the "Two ways to play" section gains a sentence on the native port, as an example of what the engine now models.
- **CLAUDE.md:**
  - invariants unchanged;
  - add: "World verbs (`world.verbs`) need no engine or server edits; built-in verbs still go in three places";
  - "Save format 2.0; old saves migrate in `src/engine/migrate.ts`";
  - "`tests/worlds/zork1-diff.test.ts` compares native Zork with the original".
- **CHANGELOG `## 1.4.0 (date)`:** an object tree, containers, doors, exit rules, instead/after rules, world verbs, `style: 'infocom'`, save format 2.0 with migration, the native Zork I slice, and the differential test; SNOOZE/INSTALL/SLEEP and Office-flavoured synonyms moved out (breaking for worlds that relied on them: declare them as world verbs).
- **Versions:** bump both package.json files to 1.4.0; `npm install --package-lock-only` in both.

- [ ] **Step 2: Verify**

Run: `npm run docs:build 2>&1 | grep -iE "dead|error" ; npm run lint && npm run type-check && npm run test:coverage 2>&1 | tail -6 && npm run build && cd server && npm run lint && npm run type-check && npm test && npm run build`
Expected: no dead links; everything green.

- [ ] **Step 3: Commit, push, PR**

```bash
git add -A
git commit -m "1.4.0: the world model (engine parity stage 1)"
git push -u origin engine-parity-spec
gh pr create --base main --title "1.4.0: engine parity stage 1, the world model" --body "<summary of the CHANGELOG entry, checks run, and the diff test result>"
```

Wait for CI, then merge (`gh pr merge --merge --delete-branch`) and check the Pages demo menu shows ZORK I · NATIVE.

---

### Task 12: Office Space (private repo)

**Files (in `~/current_work/infocom-office-space`):**
- Sync: `scripts/sync-from-public.sh` (shared paths, including the loader work from brass-lantern 1.3.0)
- Modify: `src/worlds/office-space.ts` (world verbs, `instead.snooze`, `emptyInventory`, `smashRefusal`), `package.json` (add `fake-indexeddb` dev dependency to match), `CHANGELOG.md`, versions
- Create: `tests/worlds/office-space/migration.test.ts` (with a real 1.0 save fixture)

- [ ] **Step 1: Sync**

```bash
cd ~/current_work/infocom-office-space && git checkout main && git pull && git checkout -b engine-parity-stage-1
(cd ../brass-lantern && git checkout main && git pull)
npm i -D fake-indexeddb@6.2.5 --save-exact
scripts/sync-from-public.sh
```

Expected: the checks fail in Office Space tests that use SNOOZE, INSTALL, SLEEP, DRIVE or the removed synonyms. That's the list to fix.

- [ ] **Step 2: Capture a real 1.0 save before changing the world**

From the deployed site (or the `main` build run locally), play into the second chapter, then copy `localStorage['initech-terminal:save']` into `tests/worlds/office-space/fixtures/save-1.0.json`. If the live site can't be used, generate one with the `main` branch's engine in a scratch script (`git stash`, then a vitest file that plays the gameplay test's command list for ~20 moves and writes `JSON.stringify({ version: '1.0', … })`).

- [ ] **Step 3: Move Office Space's verbs into its world**

In `office-space.ts`, add `verbs`:

| Verb | Words | Target | Notes |
|---|---|---|---|
| `snooze` | snooze, hit snooze, hit the snooze button, press snooze | `none` | Today's “There is nothing here to snooze.” as `reply` |
| `install` | install, run | `optional` | Rules on the items it used to apply to: the same `then`/`with` as their `onUse` |
| `sleep` | sleep, nap, rest, go to bed, go to sleep, lie down, take a nap | `none` | The bed gets `instead.sleep` with its old `onUse` rules |
| `drive` | drive, drive to, take the car, take the car to, leave | `optional` | `go: true` |
| others | gut, clean, drink, unplug, disconnect, answer, pick up the phone, staple, clip, push, pull, press | as each needs | One verb per meaning, mapped to `instead` rules copying the items' existing `onUse` |

Also:
- convert every `onSnooze` to `instead: { snooze: [{ say: <that event's lines> }] }` (snoozing stayed repeatable and recorded nothing, so use `say`, not `then`), unless the event has bracketed effects, in which case use `then` with an `if: '!flag:…'` guard matching the old behavior;
- add `emptyInventory: 'Just the weight of corporate despair.'` and `smashRefusal: 'Smashing things at work is, somehow, still frowned upon.'`;
- keep the finale as is;
- the shattered-alarm snooze lines ("…in pieces. There is nothing left to snooze." / "You will probably oversleep tomorrow…") become an `instead.snooze` rule on the bedroom room with `if: 'flag:<alarm smashed flag>'`, ordered so it wins.

- [ ] **Step 4: The migration test**

`tests/worlds/office-space/migration.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { inventoryOf } from '@/engine/model';
import { migrateSave } from '@/engine/migrate';
import { fallbackParse } from '@/engine/parser';
import { officeSpace } from '@/worlds/office-space';

const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/save-1.0.json'), 'utf8'));

describe('a real 1.0 Office Space save', () => {
  it('migrates with everything where the player left it, and plays on', () => {
    const saved = migrateSave(officeSpace, raw)!;
    expect(saved.version).toBe('2.0');
    expect(saved.gameState.currentRoom).toBe(raw.gameState.currentRoom);
    expect(inventoryOf(officeSpace, saved.gameState).sort()).toEqual([...raw.gameState.inventory].sort());
    expect(saved.gameState.flags).toEqual(raw.gameState.flags);
    const r = execute(fallbackParse('look', officeSpace.verbs)!, { world: officeSpace, state: saved.gameState });
    expect(r.lines.join('\n')).toContain(officeSpace.rooms[raw.gameState.currentRoom].name);
  });
});
```

- [ ] **Step 5: Run the full suite**

Run: `npm run lint && npm run type-check && npm run test:coverage 2>&1 | tail -6 && npm run build && (cd server && npm run lint && npm run type-check && npm test)`
Expected: green. `tests/engine/gameplay.test.ts` (the shortest win and the 100-point run) must pass with **no edits** except inventory-order assertions. `tests/worlds/reachability.test.ts` must pass; if it walks `room.exits` values as strings, teach it `exitTarget`.

- [ ] **Step 6: Release**

- Bump both package.json files to 1.4.0, and add a CHANGELOG entry: "the brass-lantern world model; Office Space's verbs move into its world; saves migrate; story-file loader code synced (not shown: one cartridge)".
- Commit, push, PR, wait for CI, merge, tag `v1.4.0`, and watch the deploy.
- Verify on the live site:
  - it boots into Office Space with no menu;
  - an existing save resumes (use a browser profile with a 1.2.x/1.3.0 save, or the fixture save injected into localStorage);
  - SNOOZE works in the bedroom.

---

## Self-review notes

- **Spec coverage:**

  | Spec area | Task |
  |---|---|
  | Places, item state, visited | 2 |
  | Conditions | 4 |
  | Save 2.0 | 3 |
  | Built-in verbs | 6–8 |
  | World verbs and the LLM | 5 |
  | Rules | 5 |
  | Exits and doors | 7 |
  | Containers, surfaces, scenery | 6 |
  | Descriptions | 8 |
  | Zork slice | 9 |
  | Differential test | 10 |
  | Office Space | 12 |
  | Code structure | 1 |
  | Tests | each task |
  | Docs | 11 |

- **Deviations from the spec, each with a ruling above:** `style: 'infocom'` (Task 6); the PUT fallback (Task 6); `onWear`/`onSmash` keep their handlers and `onSnooze` is removed (Task 5); `prep` on `ParsedAction` (Task 6); the `go: true` world verb (Task 5).
