# Engine parity, stage 4a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Characters with places, inventories and states; opt-in weight; the code hatch (scripts); Zork's combat and health with DIAGNOSE and THROW; and the native Zork I troll and his rooms, proved against `zork1.z3`.

**Architecture:** NPC state lives in an optional `GameState.npcs` read through helpers in `model.ts`, so older saves need no migration. Scripts are named functions on the world that return ordinary steps, run by `runSteps`. Combat is a new `combat.ts` holding Zork's mechanics and blow tables; worlds supply numbers and messages. The fight runs in `afterTurn`, before daemons.

**Tech Stack:** TypeScript 6, Vue 3, Pinia, Vitest 5 (happy-dom), ifvms (the differential test), VitePress.

**Spec:** `docs/superpowers/specs/2026-10-05-engine-parity-stage-4a-design.md`

## Global Constraints

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run.
- The LLM only classifies.
- Conditions are parsed only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness comes only from `nextRandom(state)` (`src/engine/rng.ts`).
- Built-in verbs go in four places: parser regex and `BUILT_IN_WORDS`, dispatcher (`withRules`), HELP (`src/engine/verbs/meta.ts`), `ACTION_VOCAB` (`server/src/llm.ts`).
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text (Zork's own text keeps its words, curled).
- Coverage: 80% lines, functions and statements; 75% branches.
- Shared tests (tests/engine, tests/stores, tests/helpers, tests/fixtures, tests/components, tests/worlds/audit.test.ts) must not import `src/worlds/zork1.ts` or `src/worlds/examples/`.
- Zork's `<RANDOM n>` is `roll(state, n)` = 1 + ⌊nextRandom·n⌋; `<PROB n>` is `roll(state, 100) < n`, as Zork's `G? n <RANDOM 100>`.

## Review Focus

1. A fight across UNDO or a reload: the same seed replays the same blows (UNDO restores `rng` with the state).
2. ATTACK on a non-combatant or at a person with no `combat` block: Zork's “I've known strange people…” refusal, no state change, and SMASH still works on the printer.
3. Leaving the Troll Room mid-fight and coming back: the troll stops fighting while you're away, and the first strike can happen again.
4. Dying in a fight with the stage 2 death system: the troll stops fighting, the player wakes in the world's respawn room, and wounds are cleared.
5. A script that throws or returns nothing: the turn still completes, and the error surfaces in tests rather than corrupting state.

Each has a test in the owning task (Tasks 5, 4, 5, 5, 2).

---

### Task 1: Characters (places, inventories, states, descriptions, conditions, effects)

**Files:**
- Modify: `src/types/game.ts` (`NpcState`, `GameState.npcs?`), `src/types/world.ts` (`NPC.holds?`, `NPC.descriptions?`, `NPC.combat?` stub type, effects `moveNpc`, `npcState`), `src/engine/model.ts` (`npcRoom`, `npcsIn`, `npcState`, `initialLocations` places `holds`), `src/engine/verbs/people.ts`, `src/engine/describe.ts`, `src/engine/verbs/objects.ts` (EXAMINE of an NPC), `src/engine/conditions.ts` (`alive:`, `awake:`, `fighting:`, `with:` and `conditionProblems`), `src/engine/effects.ts` (`moveNpc`, `npcState`, `'here'`), `tests/helpers/audit.ts` (effect kinds), `tests/fixtures/world.ts` (a `guard` NPC holding a `club`)
- Test: `tests/engine/npcs.test.ts` (new)

**Interfaces:**
- Produces:
  - `interface NpcState { room?: string | null; strength?: number; fighting?: boolean; staggered?: boolean; wake?: number }` in `src/types/game.ts`; `GameState.npcs?: Record<string, NpcState>`.
  - `npcRoom(world, state, id): string | null`; `npcsIn(world, state, room): string[]` (listing order: the room's `npcs` order, then others by ID); `npcStateOf(state, id): NpcState` (creates the entry) — all in `model.ts`.
  - `isAlive(world, state, id)`: `npcRoom !== null && (state.npcs?.[id]?.strength ?? 1) !== 0`. `isAwake`: alive and `strength` not negative.
  - Effects `{ moveNpc: string; to: string | null }`, `{ npcState: string; fighting?: boolean; staggered?: boolean; strength?: number }`; `move` accepts `to: 'here'`.

- [ ] **Step 1: Failing tests** in `tests/engine/npcs.test.ts`, against the fixture with a new `guard` (in `shed`, `holds: ['club']`, `descriptions: [{ if: '!awake:guard', text: 'A guard snores in the corner.' }]`, `description: 'A guard watches you.'`):

```ts
import { describe, expect, it } from 'vitest';
import { evaluateCondition, conditionProblems } from '@/engine/conditions';
import { execute } from '@/engine/engine';
import { runSteps } from '@/engine/effects';
import { npcsIn, visibleItems } from '@/engine/model';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('characters', () => {
  it('start where rooms list them, and move by effect', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(npcsIn(world, s, 'shed')).toContain('guard');
    runSteps([{ moveNpc: 'guard', to: 'yard' }], world, s);
    expect(npcsIn(world, s, 'shed')).not.toContain('guard');
    expect(evaluateCondition('with:guard', s, world)).toBe(false);
  });
  it('hold things the player can neither see nor take', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(s.locations.club).toBe('guard');
    expect(visibleItems(world, s)).not.toContain('club');
    expect(execute({ action: 'take', target: 'club' }, { world, state: s }).understood).toBe(false);
  });
  it('describe themselves by state, and the conditions follow', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(execute({ action: 'examine', target: 'guard' }, { world, state: s }).lines).toEqual(['A guard watches you.']);
    runSteps([{ npcState: 'guard', strength: -2 }], world, s);
    expect(evaluateCondition('alive:guard & !awake:guard', s, world)).toBe(true);
    expect(execute({ action: 'examine', target: 'guard' }, { world, state: s }).lines).toEqual(['A guard snores in the corner.']);
    runSteps([{ npcState: 'guard', strength: 0 }], world, s);
    expect(evaluateCondition('alive:guard', s, world)).toBe(false);
    expect(npcsIn(world, s, 'shed')).not.toContain('guard');
  });
  it('move with “here” puts a thing in the player’s room', () => {
    const s = stateWith(world, { room: 'shed' });
    runSteps([{ move: 'club', to: 'here' }], world, s);
    expect(s.locations.club).toBe('shed');
  });
  it('the audit knows the new conditions', () => {
    expect(conditionProblems('fighting:guard & with:guard', world)).toEqual([]);
    expect(conditionProblems('alive:ghost', world)).toEqual(['“alive:ghost” names no character “ghost”']);
  });
});
```

Also add to the fixture world a room line check: brass `Present: Neighbor.` listing still uses `npcsIn` (existing tests cover it).

- [ ] **Step 2: Run** `npx vitest run tests/engine/npcs.test.ts`. Expected: FAIL (`npcsIn` not exported).

- [ ] **Step 3: Implement.**

`src/types/game.ts`:

```ts
/** A character's state. Absent fields mean the defaults: where its room lists it, conscious, not fighting. */
export interface NpcState {
  /** Where it is; null when it's gone (dead). Absent: the room that lists it. */
  room?: string | null;
  /** Combat strength. Negative while unconscious; 0 is dead. Absent: its combat strength. */
  strength?: number;
  fighting?: boolean;
  staggered?: boolean;
  /** Percent chance to wake next turn while unconscious (Zork's V-PROB). */
  wake?: number;
}
// in GameState:
  /** Characters' places and states. Absent in older saves. */
  npcs?: Record<string, NpcState>;
```

`src/engine/model.ts`:

```ts
/** Where a character is: its state, else the room that lists it. */
export function npcRoom(world: World, state: GameState, id: string): string | null {
  const s = state.npcs?.[id];
  if (s && s.room !== undefined) return s.strength === 0 ? null : s.room;
  if (s?.strength === 0) return null;
  for (const [roomId, room] of Object.entries(world.rooms)) if (room.npcs.includes(id)) return roomId;
  return null;
}

/** The characters in a room: the room's own list order, then any who arrived. */
export function npcsIn(world: World, state: GameState, roomId: string): string[] {
  const listed = world.rooms[roomId]?.npcs ?? [];
  const all = Object.keys(world.npcs).filter((id) => npcRoom(world, state, id) === roomId);
  return [...listed.filter((id) => all.includes(id)), ...all.filter((id) => !listed.includes(id)).sort()];
}

export function npcStateOf(state: GameState, id: string): NpcState {
  return ((state.npcs ??= {})[id] ??= {});
}

export function isAlive(world: World, state: GameState, id: string): boolean {
  return npcRoom(world, state, id) !== null;
}

export function isAwake(world: World, state: GameState, id: string): boolean {
  return isAlive(world, state, id) && (state.npcs?.[id]?.strength ?? 1) > 0;
}
```

`initialLocations` also places each `npc.holds` item at the NPC ID. Replace the three `world.rooms[state.currentRoom]?.npcs ?? []` reads (model.ts `matchNpc`, people.ts twice) with `npcsIn(world, state, state.currentRoom)`, and describe.ts's `room.npcs` with `npcsIn(world, state, roomId)`. In Infocom style, each present NPC prints its description line (first matching `descriptions[].text`, else `description`) instead of the “Present:” list. Add `npcDescription(world, state, id)` to `describe.ts` and use it in EXAMINE (objects.ts) too.

`conditions.ts` (switch cases, plus the same kinds in `conditionProblems` checking `value in world.npcs`, message `names no character`):

```ts
    case 'alive':
      result = world ? isAlive(world, state, value) : false;
      break;
    case 'awake':
      result = world ? isAwake(world, state, value) : false;
      break;
    case 'fighting':
      result = Boolean(state.npcs?.[value]?.fighting) && (world ? isAwake(world, state, value) : false);
      break;
    case 'with':
      result = world ? npcRoom(world, state, value) === state.currentRoom : false;
      break;
```

`effects.ts`:

```ts
  if ('moveNpc' in e) {
    if (!world.npcs[e.moveNpc]) return { lines: [] };
    npcStateOf(state, e.moveNpc).room = e.to;
    return { lines: [] };
  }
  if ('npcState' in e) {
    if (!world.npcs[e.npcState]) return { lines: [] };
    const { npcState: id, ...fields } = e;
    Object.assign(npcStateOf(state, id), fields);
    return { lines: [] };
  }
```

and in `move`: `moveItem(state, e.move, (e.to === 'here' ? state.currentRoom : e.to) as Place)`. Add `moveNpc`, `npcState` (and `script`, used in Task 2) to `EFFECT_KINDS` in `tests/helpers/audit.ts`, checking `moveNpc`/`npcState` name characters and `moveNpc.to` is a room or null; `'here'` is a valid `move` destination.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all pass (the fixture `guard` may need existing listings updated; the shed's “Present:” line gains the guard only in tests that check it).

- [ ] **Step 5: Commit** `"Characters: places, inventories, states, descriptions and conditions"`.

---

### Task 2: The code hatch

**Files:**
- Create: `src/engine/scripts.ts`
- Modify: `src/types/world.ts` (`World.scripts?`, effect `{ script: string; arg?: string }`), `src/engine/effects.ts`, `tests/helpers/audit.ts` (script names)
- Test: `tests/engine/scripts.test.ts` (new)

**Interfaces:**
- Consumes: `npcStateOf`, `isCarried`, `isReachable`, `parentOf` (model.ts); `nextRandom` (rng.ts).
- Produces: `type Script = (ctx: ScriptContext) => EventStep[] | void`; `interface ScriptContext { world; state: Readonly<GameState>; random(): number; roll(n: number): number; arg?: string; here(id): boolean; carried(id): boolean; holder(id): Place; room(): string; npc(id): Readonly<NpcState> | undefined }`; `runScript(name, arg, world, state): string[]` in `scripts.ts`; `roll(state, n)` and `prob(state, n)` exported from `rng.ts`.

- [ ] **Step 1: Failing tests:**

```ts
import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const world: World = {
  ...fixtureWorld,
  scripts: {
    coin_flip: (ctx) => (ctx.random() < 0.5 ? ['Heads.'] : ['Tails.']),
    greet: (ctx) => [`Hello, ${ctx.arg}.`, { set: 'greeted' }],
    meddle: (ctx) => {
      (ctx.state as { currentRoom: string }).currentRoom = 'yard';
      return [];
    },
    nothing: () => undefined,
  },
};

describe('scripts', () => {
  it('return steps the engine runs', () => {
    const s = stateWith(world);
    expect(runSteps([{ script: 'greet', arg: 'Bob' }], world, s)).toEqual(['Hello, Bob.']);
    expect(s.flags.greeted).toBe(true);
  });
  it('draw from the seeded generator, so a replay matches', () => {
    const a = stateWith(world); const b = structuredClone(a);
    expect(runSteps([{ script: 'coin_flip' }], world, a)).toEqual(runSteps([{ script: 'coin_flip' }], world, b));
    expect(a.rng).toBe(b.rng);
  });
  it('see the state read-only', () => {
    expect(() => runSteps([{ script: 'meddle' }], world, stateWith(world))).toThrow();
  });
  it('a missing script, or one that returns nothing, does nothing', () => {
    const s = stateWith(world); const before = structuredClone(s);
    expect(runSteps([{ script: 'absent' }, { script: 'nothing' }], world, s)).toEqual([]);
    expect(s).toEqual(before);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/engine/scripts.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `src/engine/scripts.ts`:

```ts
import type { GameState, NpcState, Place } from '@/types/game';
import type { EventStep, World } from '@/types/world';
import { isCarried, isReachable, parentOf } from './model';
import { nextRandom, roll } from './rng';

export interface ScriptContext {
  world: World;
  state: Readonly<GameState>;
  random(): number;
  roll(n: number): number;
  arg?: string;
  here(id: string): boolean;
  carried(id: string): boolean;
  holder(id: string): Place;
  room(): string;
  npc(id: string): Readonly<NpcState> | undefined;
}
export type Script = (ctx: ScriptContext) => EventStep[] | void;

// Tests and dev builds freeze the view, so a script that assigns throws; production passes it as is.
const FREEZE = import.meta.env.DEV || import.meta.env.MODE === 'test';

function frozen<T>(value: T): T {
  if (!FREEZE || value === null || typeof value !== 'object') return value;
  return structuredCloneFreeze(value);
}
function structuredCloneFreeze<T>(value: T): T {
  const copy = structuredClone(value) as Record<string, unknown>;
  const deep = (v: unknown) => {
    if (v && typeof v === 'object') { Object.values(v).forEach(deep); Object.freeze(v); }
  };
  deep(copy);
  return copy as T;
}

/** The steps a world's script returns. A missing script returns none. */
export function scriptSteps(name: string, arg: string | undefined, world: World, state: GameState): EventStep[] {
  const script = world.scripts?.[name];
  if (!script) return [];
  const view = frozen(state);
  return script({
    world,
    state: view,
    random: () => nextRandom(state),
    roll: (n) => roll(state, n),
    arg,
    here: (id) => isReachable(world, state, id),
    carried: (id) => isCarried(state, id),
    holder: (id) => parentOf(state, id),
    room: () => state.currentRoom,
    npc: (id) => view.npcs?.[id],
  }) ?? [];
}
```

In `effects.ts`: `if ('script' in e) return { lines: runSteps(scriptSteps(e.script, e.arg, world, state), world, state), stop: state.gameOver || halted.has(state) };`. In `rng.ts` add:

```ts
/** Zork's <RANDOM n>: 1 to n. */
export function roll(state: GameState, n: number): number {
  return 1 + Math.floor(nextRandom(state) * n);
}
/** Zork's <PROB n>: true when n > <RANDOM 100>. */
export function prob(state: GameState, n: number): boolean {
  return n > roll(state, 100);
}
```

Audit: a `script` effect naming no `world.scripts` entry is a problem `“event x: script names no script “y””`.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `"The code hatch: named scripts that return steps"`.

---

### Task 3: Weight and capacity

**Files:**
- Create: `src/engine/weight.ts`
- Modify: `src/types/world.ts` (`World.carry?`, `Item.size?`, `Container.weight?`), `src/types/game.ts` (`GameState.player?: { wounds?: number; load?: number; cureIn?: number; staggered?: boolean }`), `src/engine/verbs/objects.ts` (`takeItem`), `src/engine/verbs/containers.ts` (put respects `container.weight`)
- Test: `tests/engine/weight.test.ts` (new)

**Interfaces:**
- Produces: `weightOf(world, state, id): number`; `carriedWeight(world, state): number`; `loadLimit(world, state): number` (`state.player?.load ?? world.carry.limit`); `takeRefusal(world, state, id): string | null` (too heavy, then fumble) — in `weight.ts`.

- [ ] **Step 1: Failing tests** (world variant of the fixture with `carry: { limit: 20, fumble: { over: 2, chance: 50 } }`, items sized: `bat` 15, `lamp` 10, others default 5):

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { carriedWeight, weightOf } from '@/engine/weight';
import type { World } from '@/types/world';
import { carry, stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const world: World = {
  ...fixtureWorld,
  carry: { limit: 20, fumble: { over: 2, chance: 50 } },
  items: { ...fixtureWorld.items, bat: { ...fixtureWorld.items.bat, size: 15 }, lamp: { ...fixtureWorld.items.lamp, size: 10 } },
};
const take = (s: ReturnType<typeof stateWith>, t: string) => execute({ action: 'take', target: t }, { world, state: s });

describe('weight', () => {
  it('counts what is inside things, and defaults to 5', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(weightOf(world, s, 'jar')).toBe(10); // the glass jar (5) holding the marble (5)
  });
  it('refuses a take that would go over the limit, and changes nothing', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(take(s, 'bat').lines).toEqual(['Taken: bat.']);
    const before = structuredClone(s);
    expect(take(s, 'lamp').lines).toEqual(['[That’s too heavy to carry with everything else.]']);
    expect(s).toEqual({ ...before, turns: 1, moveCount: 1 });
  });
  it('fumbles past the count, by the seed', () => {
    const s = stateWith(world, { room: 'living' });
    carry(s, 'wallet', 'shirt', 'key');
    const lines = [take(s, 'rusty key').lines[0]];
    expect(['Taken: rusty key.', '[You’re carrying too many things.]']).toContain(lines[0]);
  });
  it('worlds without carry have no limit', () => {
    const s = stateWith(fixtureWorld, { room: 'yard' });
    carry(s, 'wallet', 'shirt', 'key', 'rusty_key');
    expect(execute({ action: 'take', target: 'bat' }, { world: fixtureWorld, state: s }).lines).toEqual(['Taken: bat.']);
    expect(carriedWeight(fixtureWorld, s)).toBeGreaterThan(0);
  });
});
```

Add a seeded fumble test that picks a seed known to fumble and one known not to, by setting `s.rng` and asserting each reply exactly.

- [ ] **Step 2: Run.** Expected: FAIL (`@/engine/weight` missing).
- [ ] **Step 3: Implement** `weight.ts`:

```ts
import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { childrenOf, inventoryOf, isCarried, isInside, PLAYER } from './model';
import { prob } from './rng';

const DEFAULT_SIZE = 5;

export function weightOf(world: World, state: GameState, id: string): number {
  const own = world.items[id]?.size ?? DEFAULT_SIZE;
  return own + childrenOf(world, state, id).reduce((sum, k) => sum + weightOf(world, state, k), 0);
}

export function carriedWeight(world: World, state: GameState): number {
  return inventoryOf(world, state).reduce((sum, id) => sum + weightOf(world, state, id), 0);
}

export function loadLimit(world: World, state: GameState): number {
  return state.player?.load ?? world.carry?.limit ?? Infinity;
}

/** Why the player can't take this, or null. Fumbles draw from the seed. */
export function takeRefusal(world: World, state: GameState, id: string): string | null {
  const carry = world.carry;
  if (!carry) return null;
  const alreadyCarried = inventoryOf(world, state).some((c) => isInside(state, id, c));
  if (!alreadyCarried && carriedWeight(world, state) + weightOf(world, state, id) > loadLimit(world, state)) {
    const hurt = loadLimit(world, state) < carry.limit;
    if (world.style === 'infocom') return hurt ? (carry.tooHeavyHurt ?? 'Your load is too heavy, especially in light of your condition.') : (carry.tooHeavy ?? 'Your load is too heavy.');
    return carry.tooHeavy ?? '[That’s too heavy to carry with everything else.]';
  }
  const count = inventoryOf(world, state).length;
  if (carry.fumble && count > carry.fumble.over && prob(state, count * carry.fumble.chance)) {
    return carry.fumbled ?? (world.style === 'infocom' ? 'You’re holding too many things already!' : '[You’re carrying too many things.]');
  }
  return null;
}
```

Note the fumble draws from the seed and so changes `rng`. That's a mutation, but it happens only on an understood TAKE that reached the check (not a miss), and Zork's TAKE takes its turn either way. In `takeItem`, call `takeRefusal` after the existing reach checks and before moving; return `ok([refusal])` (understood, not mutated).

- [ ] **Step 4: Run** `npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `"Weight and capacity, opt-in per world"`.

---

### Task 4: Combat, the player's blow (plus THROW)

**Files:**
- Create: `src/engine/combat.ts`, `src/engine/verbs/attack.ts`
- Modify: `src/types/world.ts` (`Combat`, `BlowResult`, `World.combat?`, `Item.weapon?`, `NPC.combat?`), `src/engine/parser.ts` (STAB, FIGHT words; THROW X AT Y; `throw` in `BARE_VERBS`; `diagnose` single word for Task 5), `src/engine/engine.ts` (dispatch `smash` at a combatant → attack; `throw`), `src/engine/verbs/meta.ts` (HELP: ATTACK/KILL, THROW), `server/src/llm.ts` (`attack`, `throw` in `ACTION_VOCAB`)
- Test: `tests/engine/combat.test.ts` (new)

**Interfaces:**
- Consumes: `roll`, `prob` (rng.ts); `npcStateOf`, `isAwake`, `npcsIn` (model.ts); `runEventKey` (effects.ts).
- Produces:
  - `type BlowResult = 'missed' | 'unconscious' | 'killed' | 'lightWound' | 'seriousWound' | 'stagger' | 'loseWeapon' | 'hesitate' | 'sittingDuck'`.
  - `TABLES` (DEF1, DEF2A, DEF2B, DEF3A, DEF3B, DEF3C as `BlowResult[]`), `pickTable(att, def): BlowResult[]` — Zork's selection exactly.
  - `fightStrength(world, state, adjusted = true): number` — `min + ⌊score / ⌊maxScore / (max − min)⌋⌋` plus `−wounds` when adjusted.
  - `villainStrength(world, state, npc, weapon?: string): number`.
  - `heroBlow(world, state, npc, weapon): string[]` (mutates; only called after refusals pass).
  - `blowMessage(parts: string[][], defender: string, weapon: string, state): string` — random element (by `roll`), parts joined, `{weapon}` / `{defender}` replaced.
  - `handleAttack(target, indirect, world, state): EngineResult | null` in `verbs/attack.ts` (null when the target isn't an NPC, so SMASH continues).

- [ ] **Step 1: Failing tests.** Add to the fixture a `guard` `combat: { strength: 2, weapon: 'club', fears: { item: 'bat', by: 1 }, firstStrike: 0, messages: {...} }` and `world.combat: { strength: { min: 2, max: 7 }, cureWait: 30, messages: { missed: [['You miss the ', '{defender}', '.']], killed: [['The ', '{defender}', ' falls.']], ... } }`, `bat.weapon = true`. Tests:

```ts
it('picks Zork’s table from the two strengths', () => {
  expect(pickTable(1, 2)).toBe(TABLES.DEF2A);
  expect(pickTable(5, 2)).toBe(TABLES.DEF2B);   // att capped at 4 → DEF2-RES[3] = DEF2B (Zork's table has DEF2B at indexes 1–3)
  expect(pickTable(2, 1)).toBe(TABLES.DEF1);
  expect(pickTable(3, 5)).toBe(TABLES.DEF3A);    // att − def = −2 → index 0
  expect(pickTable(5, 4)).toBe(TABLES.DEF3B);    // +1 → index 3? (DEF3-RES = DEF3A, DEF3A, DEF3B, DEF3B, DEF3C)
});
it('player strength grows with score', () => {
  const s = stateWith(world); expect(fightStrength(world, s)).toBe(2);
  s.vars = { ...s.vars, score: world.maxScore }; expect(fightStrength(world, s)).toBe(7);
});
it('refuses in Zork’s order and words, changing nothing', () => {
  const s = stateWith(world, { room: 'shed' });
  const before = structuredClone(s);
  const say = (t: string, i?: string) => execute({ action: 'smash', target: t, indirect: i }, { world, state: s }).lines;
  expect(say('guard')).toEqual(['Trying to attack a guard with your bare hands is suicidal.']);
  expect(say('guard', 'bat')).toEqual(['You aren’t even holding the bat.']);
  expect(s).toEqual({ ...before, turns: 2, moveCount: 2 });
});
it('a blow follows the seed, and the same seed replays it', () => {
  const a = stateWith(world, { room: 'shed' }); carry(a, 'bat'); const b = structuredClone(a);
  const hit = (s: GameState) => execute({ action: 'smash', target: 'guard', indirect: 'bat' }, { world, state: s }).lines;
  expect(hit(a)).toEqual(hit(b));
  expect(a.npcs?.guard).toEqual(b.npcs?.guard);
});
it('an unarmed guard dies at once; death runs onDeath and drops what he holds', () => { /* move club away, attack, assert “cannot defend himself: He dies.”, alive:guard false, onDeath line */ });
it('SMASH still smashes things that aren’t people', () => {
  // the fixture's existing smash test (alarm) keeps passing; add: attacking an item says Zork's “I've known strange people…” only for ATTACK/KILL words via the parser
});
it('THROW at a person runs their throw rule; elsewhere it drops the thing', () => { /* instead.throw on guard says a line; throw wallet in yard → “Thrown.” and wallet on the floor */ });
```

(When writing the table tests, derive each expectation from the ZIL tables `DEF1-RES`, `DEF2-RES`, `DEF3-RES` copied into `combat.ts`; the indexes in Zork are `DEF1-RES[att−1]` with att capped at 3, `DEF2-RES[att−1]` capped at 4, `DEF3-RES[clamp(att−def, −2, 2) + 2]`. The 0 entries in those ZIL tables are `REST` offsets into the named table; port them as the same table starting 2 or 4 entries in.)

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** `combat.ts` from `HERO-BLOW` (ZIL `1actions.zil` 3476–3570) and the tables (3240–3300), with the `REST` semantics: `DEF1-RES = [DEF1, DEF1.slice(2), DEF1.slice(4)]`, `DEF2-RES = [DEF2A, DEF2B, DEF2B.slice(2), DEF2B.slice(4)]`, `DEF3-RES = [DEF3A, DEF3A.slice(2), DEF3B, DEF3B.slice(2), DEF3C]`; a result is `table[roll(state, 9) − 1]`. Hero blow:
  1. player staggered → the recovering line, clear stagger, return;
  2. `att = max(1, fightStrength)`; `def = villainStrength` (its `strength` state, else `combat.strength`; when the player wields `fears.item`, `max(1, def − fears.by)`; when `def` ≤ 0 is impossible here since dead ones aren't matched);
  3. defender unarmed (its `weapon` not held by it) or unconscious (`def < 0`) → “The unarmed/unconscious *name* cannot defend himself: He dies.” → killed;
  4. else table result; stagger becomes `loseWeapon` when it holds a weapon and `prob(25)`;
  5. message from `world.combat.messages[result]` (brass defaults below), then apply: unconscious → `strength = −def` and `onUnconscious`; killed/sittingDuck → 0, the black-fog line, NPC `room = null`, its held items go to the room, `onDeath`; light −1; serious −2 (not below 0; 0 kills); stagger → NPC `staggered`; loseWeapon → its weapon to the room. The NPC is now `fighting`.

Brass default messages: `missed` “You miss the {defender}.”, `unconscious` “The {defender} is knocked out.”, `killed` “The {defender} is killed.”, `lightWound` “You wound the {defender}.”, `seriousWound` “You wound the {defender} badly.”, `stagger` “The {defender} staggers.”, `loseWeapon` “The {defender} drops their weapon.”. Defaults for the black-fog line in brass: “The {defender} is dead.”

`verbs/attack.ts`:

```ts
export function handleAttack(target: string | undefined, indirect: string | undefined, world: World, state: GameState): EngineResult | null {
  if (!target) needObject();
  const npc = matchNpc(target, world, state);
  if (!npc) return null;                                    // not a person: SMASH's own handling
  const name = world.npcs[npc].name;
  if (!world.npcs[npc].combat) return ok([text(world, 'notCombatant', name)]);
  if (!indirect) return ok([`Trying to attack a ${name} with your bare hands is suicidal.`]);
  const weapon = pickItem(indirect, visibleItems(world, state), world, 'indirect', state);
  if (!weapon) return miss(`You don’t see a “${indirect}” here.`);
  if (!isCarried(state, weapon)) return ok([`You aren’t even holding the ${world.items[weapon].name}.`]);
  if (!world.items[weapon].weapon) return ok([`Trying to attack the ${name} with a ${world.items[weapon].name} is suicidal.`]);
  return ok(heroBlow(world, state, npc, weapon), true);
}
```

The dispatcher's `smash` case calls `handleAttack` first and falls back to `handleSmash` on null. ATTACK at a non-person item keeps SMASH's behavior; Zork's “I've known strange people, but fighting a *thing*?” is world text the Zork world sets via an `instead.smash`-free path: add `world.combat.notPerson?` used by `handleSmash` only when the typed verb was attack/kill/fight/stab (parser sets `action.prep = 'attack'` for those words; SMASH words don't). THROW: `RE.throw = /^(?:throw|toss|hurl)\s+(?:the\s+)?(.+?)(?:\s+(?:at|to)\s+(?:the\s+)?(.+))?$/i`; dispatcher `throw` → `withRules('throw', …)`; default: target carried → drop it in the room, “Thrown.” (infocom: Zork's “Thrown.”), at a person without a rule → same.

- [ ] **Step 4: Run** `npx vitest run` and `cd server && npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `"Combat: the player's blow, Zork's tables; THROW"`.

---

### Task 5: Their blows, health and DIAGNOSE

**Files:**
- Modify: `src/engine/combat.ts` (`villainBlow`, `fightTurn`, `cure`), `src/engine/time.ts` (`afterTurn` runs `fightTurn` first, then the cure tick, then fuses), `src/engine/death.ts` (dying ends fights and clears wounds), `src/engine/verbs/meta.ts` (`handleDiagnose`, HELP), `src/engine/engine.ts` (dispatch `diagnose`), `src/engine/parser.ts`, `server/src/llm.ts` (`diagnose`)
- Test: `tests/engine/fight.test.ts` (new)

**Interfaces:**
- Consumes: Task 4's tables and `blowMessage`; `die` (death.ts).
- Produces: `fightTurn(world, state): string[]`; `handleDiagnose(world, state): EngineResult`.

- [ ] **Step 1: Failing tests** (fixture `guard`, seeds chosen by trying seeds in the test until each named outcome occurs, then pinned as constants):

```ts
it('a fighting guard swings back each turn, by the seed', () => { /* attack once; next WAIT prints one of the guard's messages */ });
it('first strike starts a fight on arrival at its chance', () => { /* firstStrike: 100 → entering the shed and waiting starts blows */ });
it('leaving the room ends the fight; coming back, it can strike first again', () => {});
it('an unconscious guard wakes by a growing chance', () => { /* strength −2, wake 25 per turn; after enough turns awake:guard */ });
it('busy: a guard whose weapon is on the floor runs onBusy instead of swinging', () => {});
it('wounds lower strength and the carry limit, and heal every cureWait turns', () => {});
it('a killing blow plays the death line through the death system; fights end and wounds clear', () => {});
it('DIAGNOSE reports health in Zork’s words (infocom) and brackets (brass)', () => {
  // perfect health; one light wound “which will be cured after N moves.”; “You can be killed by …” per strength
});
it('a fight replays identically across UNDO-style state restore', () => {
  const a = stateWith(world, { room: 'shed' }); carry(a, 'bat'); const b = structuredClone(a);
  for (const s of [a, b]) for (let i = 0; i < 6; i++) execute({ action: 'smash', target: 'guard', indirect: 'bat' }, { world, state: s });
  expect(a).toEqual(b);
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** from `I-FIGHT`, `DO-FIGHT`, `VILLAIN-BLOW`, `WINNER-RESULT`, `I-CURE`, `AWAKEN`, `V-DIAGNOSE` (ZIL lines 3330–3470, 3600–3660, 3810–3880, 3993–4030):
  - `fightTurn`: skip when the player is dead/halted. For each NPC with `combat`, in `world.npcs` order:
    - in the player's room and alive: if unconscious, `wake` chance (`p = state.wake ?? 0`; if `p > 0 && prob(p)` → wake (strength = −strength; `onWake`; `fighting = true` when in room) else `wake = p + combat.wake`); else if `fighting` or `prob(firstStrike)` → it fights this turn;
    - not in the room: `fighting = false`, `staggered = false`, player stagger cleared, and an unconscious one wakes (`AWAKEN`).
  - Fighters each: if their `weapon` is on the floor here and `onBusy` exists, run `onBusy` (the event decides, e.g. a script) instead of swinging; else `villainBlow`. A blow that knocks the player unconscious gives `1 + roll(3)` more rounds (`OUT`), where stagger → hesitate and other results → sittingDuck, per `DO-FIGHT`.
  - `villainBlow`: staggered NPC → “The *name* slowly regains his feet.”, clear; `att = villainStrength`; `def = fightStrength(adjusted)`, if `def ≤ 0` return; `od = fightStrength(false)`; table result; stagger → loseWeapon when the player holds a weapon and `prob(25)`; message from the NPC's `combat.messages` with `{weapon}` = the player's weapon; apply: light −1 and load −10 (if > 50), serious −2 and load −20 (if > 50), killed/sittingDuck → def 0, stagger → player staggered, loseWeapon → the weapon to the floor and “Fortunately, you still have a *x*.” when another is carried. Then `wounds = od − def` (or all when def 0); a wound starts the cure fuse (`cureIn = cureWait`) if not running; `fightStrength ≤ 0` → `die(world.combat.deathLine ?? 'It appears that that last blow was too much for you. I’m afraid you are dead.')`.
  - Cure: each acted-on turn while `cureIn` set: decrement; at 0, `wounds − 1`, load +10 (to `carry.limit`, and to the limit when healed), restart if still wounded.
  - Death clears `player` (wounds, stagger, cure) and every NPC's `fighting`.
  - DIAGNOSE (`V-DIAGNOSE`): `wd` = wounds when curing else 0; `rs = fightStrength(false) − wounds`. Infocom lines exactly: “You are in perfect health.” / “You have a light wound,” … “ which will be cured after N moves.” with `N = cureWait·(wd − 1) + cureIn`; “You can expect death soon.” … “You can survive several wounds.”; deaths line when `vars.deaths > 0`. Brass: `[Health: …]` short forms.
  - Order in `afterTurn`: the fight first (Zork's I-FIGHT runs before the sword and lamp interrupts), then fuses, daemons, ambient. If the differential test shows a different order for a printed line, rule and follow the original.

- [ ] **Step 4: Run** everything. Expected: all pass.
- [ ] **Step 5: Commit** `"Their blows, health, healing and DIAGNOSE"`.

---

### Task 6: The Zork slice

**Files:**
- Modify: `src/worlds/zork1.ts`
- Test: `tests/worlds/zork1.test.ts`

Data from `/tmp/zork1-src` (historicalsource/zork1; clone with `git clone --depth 1 https://github.com/historicalsource/zork1.git /tmp/zork1-src` if missing): `1dungeon.zil` 1479–1490 (TROLL-ROOM), 1938–1963 (EW-PASSAGE, ROUND-ROOM), 1036–1046 (TROLL), 180–187 (AXE); `1actions.zil` 640–765 (TROLL-FCN), 3700–3790 (HERO-MELEE, TROLL-MELEE), 3863–3890 (I-SWORD).

- [ ] **Step 1: Failing tests** in `tests/worlds/zork1.test.ts` (seeded where random):
  - the cellar's north exit leads to the Troll Room; with the troll awake, east and west say “The troll fends you off with a menacing gesture.”;
  - `kill troll` → bare hands line; `kill troll with sword` progresses a fight; a seed where the troll dies prints the black-fog line, drops “bloody axe”, and opens east;
  - the East-West Passage gives 5 points once;
  - carrying the sword into the cellar prints “Your sword is glowing with a faint blue glow.”; in the Troll Room “Your sword has begun to glow very brightly.”; after the troll dies, “Your sword is no longer glowing.”;
  - `throw knife at troll` and `give lunch to troll` replies (seeded for the 20% eat);
  - the sword plus the egg plus the other walkthrough load gives “Your load is too heavy.”;
  - `diagnose` in perfect health.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** in `zork1.ts`:
  - rooms `troll_room` (dark; LDESC above; exits: `south: 'cellar'`; `east: { to: 'ew_passage', denials: [{ if: 'awake:troll', text: 'The troll fends you off with a menacing gesture.' }] }`; `west: { denials: [{ if: 'awake:troll', text: 'The troll fends you off with a menacing gesture.' }], denial: 'The maze isn’t built yet.' }`), `ew_passage` (onEnter +5 once via `score` effect), `round_room` (east/north/south/se refusals until stage 5); cellar north → `troll_room`;
  - NPC `troll`: `holds: ['axe']`, descriptions (armed / disarmed and cowering “A pathetically babbling troll is here.” / unconscious), `combat` with TROLL-MELEE as `messages`, `strength: 2`, `weapon: 'axe'`, `fears: { item: 'sword', by: 1 }`, `wake: 25`, `firstStrike: 33`, `onBusy: 'troll_busy'`, `onDeath`/`onUnconscious` events moving the axe `to: 'here'`, `onWake` event “The troll stirs, quickly resuming a fighting stance.”; `instead` rules on the troll for throw/give/take/move/smash per TROLL-FCN, and `dialogue`/TELL “The troll isn't much of a conversationalist.”;
  - scripts: `troll_busy` (axe on the floor: 75% recover with “The troll, angered and humiliated, recovers his weapon. He appears to have an axe to grind with you.”, else “The troll, disarmed, cowers in terror, pleading for his life in the guttural tongue of the trolls.”), `troll_eats` (THROW/GIVE resolution with the 20% eat-a-weapon death), `sword_glow` (a daemon `{ if: 'has:sword', then: [{ script: 'sword_glow' }] }` tracking the last level in a var `sword_glow`; “next door” is any exit target room holding a living NPC);
  - items: `axe` (bloody axe, size 25, weapon), `sword` and `knife` gain `weapon: true`; sizes from ZIL (water 4, garlic 4, lamp 15, painting 15, rope 10, sword 30, leaves 25, sack 9, axe 25; others default 5); containers' `capacity` → `container.weight` (mailbox 10, sack 9, bottle 4, nest 20) where Zork's CAPACITY is a weight;
  - `world.combat` with HERO-MELEE, strength 2–7 against `maxScore` 350, cure 30; `carry: { limit: 100, fumble: { over: 7, chance: 8 } }`;
  - remove the world verb `diagnose` (now built in).
- [ ] **Step 4: Run** all tests, including the audit. Expected: pass.
- [ ] **Step 5: Commit** `"Zork I native: the Troll Room, the troll and the sword's glow"`.

---

### Task 7: The differential test

**Files:**
- Modify: `tests/worlds/zork1-diff.test.ts`, `tests/worlds/zork1-allowlist.ts`
- Create: `tests/worlds/zork1-fight.test.ts` (the line set)

- [ ] **Step 1:** Extend the walkthrough: take the sword before the egg so the load and glow replies are compared; go down to the cellar and north to the Troll Room; mark the fight with a sentinel entry `'@fight'` that the harness expands on each side into `kill troll with sword` repeated until that side's troll is dead (cap 30); the original side restarts the whole session if the player dies (cap 20 restarts); the native side tries seeds from a fixed list until the troll dies before the player. After it: `take axe`, `east`, `east`, `west`, `west`. Allowlist with reasons: replies that print the move count or wounds (SCORE, DIAGNOSE) after the fight.
- [ ] **Step 2:** `zork1-fight.test.ts`: play the original to the Troll Room and fight to the end 60 times (fresh sessions), collecting every line printed during `@fight` turns into a set; play native fights over 200 seeds the same way; assert every native line is in the original's set (normalized as the diff test does). Print the strays on failure.
- [ ] **Step 3: Run.** Fix the world, the engine, or the harness until both pass. Record any ordering ruling in the ledger.
- [ ] **Step 4: Commit** `"Differential test: the troll fight"`.

---

### Task 8: Docs, recipes and 1.7.0

**Files:**
- Create: `src/worlds/examples/guard.ts`, `src/worlds/examples/scripts.ts`, tests in `tests/worlds/examples/recipes.test.ts` (inline snapshots) and the examples audit
- Modify: `docs/guide/building-worlds/recipes.md` (two recipes), `docs/reference/world-schema.md` (`combat`, `carry`, `size`, `weapon`, `container.weight`, `scripts`, NPC `holds`/`descriptions`), `docs/reference/conditions-and-events.md` (conditions, `moveNpc`, `npcState`, `script`, `'here'`), `docs/reference/commands.md` (ATTACK/KILL/STAB/FIGHT, THROW, DIAGNOSE), `docs/guide/porting-zork.md`, `docs/guide/how-it-works.md` (the fight in “Time passes”), `CHANGELOG.md` (1.7.0), `package.json` and `server/package.json` (1.7.0)

- [ ] **Step 1:** The guard recipe: a gate guarded by a guard with a club, a heavy chest you can't lift with the shield, `carry`, a fight seeded to win, `diagnose`. The scripts recipe: a fortune teller whose script picks a fortune by `ctx.roll` and remembers it in a var. Each a world file with a pinned transcript.
- [ ] **Step 2:** The doc updates above, each claim checked against the code; `npm run docs:build`.
- [ ] **Step 3:** CHANGELOG 1.7.0 and version bumps; full checks: lint, type-check, `test:coverage`, build, server checks.
- [ ] **Step 4: Commit** `"1.7.0: docs and recipes for characters, weight, combat and scripts"`.

---

### Task 9: Office Space

- [ ] Sync with `scripts/sync-from-public.sh ../brass-lantern` on a new branch; Office Space's own tests should pass unchanged except HELP listings that now include DIAGNOSE, THROW and ATTACK (update those assertions only). Bump to 1.7.0, CHANGELOG, PR. After the final review and CI, and with the owner's go-ahead: merge both, tag `v1.7.0` on each (Office Space deploys), publish the brass-lantern release, and check the live site boots, a save resumes, and DIAGNOSE answers.

---

## Self-review notes

- **Spec coverage:** characters 1; descriptions and conditions 1; weight 3; code hatch 2; combat (player) 4; their blows, health, DIAGNOSE 5; THROW 4; the Zork slice and the sword's glow 6; testing layers 1–3 → 7 and each task's units; docs and recipes 8; Office Space 9.
- **Deferred to execution with rulings:** exact table-index expectations (derived from the ZIL in Task 4), interrupt order (Task 5, confirmed by Task 7), and which seeds produce each outcome (pinned in tests as found).
- **Type consistency:** `NpcState`, `npcRoom`, `npcsIn`, `npcStateOf`, `isAlive`, `isAwake`, `scriptSteps`, `roll`, `prob`, `weightOf`, `carriedWeight`, `loadLimit`, `takeRefusal`, `pickTable`, `fightStrength`, `villainStrength`, `heroBlow`, `blowMessage`, `handleAttack`, `fightTurn`, `handleDiagnose` are used under these names throughout.
