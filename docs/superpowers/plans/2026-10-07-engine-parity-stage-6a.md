# Engine parity, stage 6a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The engine features Zork II and Zork III share (orders, numbers, typed words, prepositions, ME, computed descriptions, script helpers, score/diagnose text, followers, vehicle kinds, death options), each proved on the fixture world and by a small native slice played against zork2.z3 or zork3.z3.

**Architecture:** Parser work first (numbers, typed words, prepositions and ME, then orders, which consume all three), then the intent server, then the world-side features, each independent. Then the harness generalises over story file and world, and four test-only slices prove the features against the originals. Docs, version and the Office Space sync close it.

**Tech Stack:** TypeScript 6, Vue 3/Pinia, Vitest 5, ifvms (tests only), Express intent server.

**Spec:** `docs/superpowers/specs/2026-10-07-engine-parity-stage-6a-design.md`. Survey: `docs/superpowers/surveys/2026-10-06-zork2-zork3-survey.md` and the per-game reports beside it. ZIL: `/tmp/zork1-src`, `/tmp/zork2-src`, `/tmp/zork3-src` (clone `https://github.com/historicalsource/zork{1,2,3}` there if missing). Stories: `public/stories/zork{1,2,3}.z3`.

## Global Constraints

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies; the intent server's vocabulary grows with the new forms and drops anything else.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`. Scripts reach both through the script context, never by parsing.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working: Zork I's full game and its nine chapters match exactly; Office Space syncs with no world changes and no player-visible change.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- Where a story file and its ZIL source disagree, the story file wins.
- Tests run in the node environment; DOM-using files start with `// @vitest-environment happy-dom`. Long tests (more than ~2 minutes) run only when `ZORK_LONG=1`.
- Shared-engine rule: no Office Space names in shared files; a new built-in verb form goes in the parser, `BUILT_IN_WORDS`, the dispatcher (wrapped in `withRules`), HELP, and the server's `ACTION_VOCAB`.

## Rulings carried in from the code (ledger them at Task 1)

- `World.scoring` is an array of score entries, so the spec's `scoring.line` becomes world-level `scoreLine?: string` and `rankLine?: string` (Zork II's rank line is “This score gives you the rank of {rank}.”, Zork I's “This gives you the rank of {rank}.”). Cost if wrong: a field name.
- `describeRoom` today puts `firstDescription` (first visit) ahead of `descriptions`. That order stays (Zork I depends on it); `descriptionScript` goes in front of both. Cost if wrong: none for existing worlds.
- `isHeld` already exists in `src/engine/model.ts`; `held:ITEM` wraps it.
- Rooms already have `water?: boolean | string`; air gets the same shape, `air?: boolean | string`, read by a new `isAir` beside `isWater`.

## Tools carried over

- `tests/worlds/zsession.ts`: `openOriginal(seed)`, `openNative(seed)`, `prefixed`, `findSeed`, `normalize`, `playCommands`, `chapterRun`.
- `tests/zz/seeds.test.ts`, `tests/zz/route.test.ts`: untracked, in `.git/info/exclude`. Never delete `tests/zz`.
- Fixture tests: `stateWith(world, { room, carrying, flags })` from `tests/helpers/state.ts`, `fixtureWorld` from `tests/fixtures/world.ts`, `execute` and `fallbackParse`.

Run suites with `npx vitest run --exclude "tests/zz/**"`.

## Review Focus

1. An order whose inner command misses (“robot, take xyzzy”, “robot, go west” with no west exit, “lamp, go north”): a miss naming the problem and no state change, so the LLM retry is safe. (Task 4 test.)
2. A typed-word answer with a period or THEN inside quotes (`answer "a well. really" then look`): the quoted phrase stays whole, and the text verb ends the line. (Task 2 test.)
3. A thing where a number is expected and a number where a thing is expected (“turn dial to lamp”, “take 4”, “turn dial to 1001”): the rule sees the thing or misses cleanly; nothing crashes or mutates. (Task 1 test.)
4. A follower when the player's move is refused, when the player is moved by a script or dies, and through a closed door: it follows only real arrivals, and never ends up somewhere the player isn't. (Task 7 test.)
5. An air vehicle moved by a timer while the player isn't aboard: it moves alone, silently unless the player sees it leave or arrive. (Task 8 test.)

---

### Task 1: Numbers, and TURN/SET X TO N

**Files:**
- Modify: `src/types/game.ts` (`ParsedAction.number?: number`), `src/engine/scripts.ts` (`Command.number?: number`), `src/engine/parser.ts`, `src/engine/conditions.ts`, `src/engine/effects.ts` (`setVar` from the number), `src/types/world.ts` (`Effect` `{ setVar; from: 'number' }`, `Rule.with` may be `'number'`), `src/engine/rules.ts` (a numeric second object is not a miss; `with: 'number'` matches), `src/engine/engine.ts` (dispatch `turn` to the rules with its default), `src/engine/verbs/meta.ts` (HELP line), `docs/reference/conditions-and-events.md`
- Test: `tests/engine/numbers.test.ts` (new), `tests/engine/parser.test.ts`, `tests/engine/conditions.test.ts`

**Interfaces:**
- Produces: `ParsedAction.number`, `Command.number`; a numeric object slot reads the literal `'number'` (target or indirect); `parseNumber(word): number | null` in `parser.ts` (Zork's NUMBER?: digits ≤ 1000, `H:MM` → minutes with hours < 8 + 12, hours > 23 not a number); conditions `number:N`, `number<op>N`; effect `{ setVar: NAME, from: 'number' }`; rule `with: 'number'`.

- [ ] **Step 1: Write the failing tests** (`tests/engine/numbers.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse, parseNumber } from '@/engine/parser';
import { evaluateCondition } from '@/engine/conditions';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const dial: World = {
  ...fixtureWorld,
  items: { ...fixtureWorld.items, dial: { name: 'dial', description: 'A dial.', portable: false, tags: [], scenery: true } },
  rooms: {
    ...fixtureWorld.rooms,
    bedroom: {
      ...fixtureWorld.rooms.bedroom,
      scenery: [...(fixtureWorld.rooms.bedroom.scenery ?? []), 'dial'],
      instead: { turn: [{ with: 'number', if: 'number<=8', then: 'dialed' }, { with: 'number', say: ['The dial only goes to 8.'] }] },
    },
  },
  events: { ...fixtureWorld.events, dialed: [{ setVar: 'cell', from: 'number' }, 'The dial clicks.'] },
};

describe('numbers (Zork’s INTNUM) (6a)', () => {
  it('parses like NUMBER?: up to 1000, and H:MM as minutes', () => {
    expect(parseNumber('4')).toBe(4);
    expect(parseNumber('1000')).toBe(1000);
    expect(parseNumber('1001')).toBeNull();
    expect(parseNumber('9:30')).toBe(570);
    expect(parseNumber('3:00')).toBe(900);
    expect(parseNumber('24:00')).toBeNull();
    expect(parseNumber('4a')).toBeNull();
  });
  it('TURN X TO N and SET X TO N carry the number', () => {
    expect(fallbackParse('turn dial to 4')).toEqual({ action: 'turn', target: 'dial', indirect: 'number', number: 4 });
    expect(fallbackParse('set the dial to 776')).toEqual({ action: 'turn', target: 'dial', indirect: 'number', number: 776 });
    expect(fallbackParse('turn dial to lamp')).toEqual({ action: 'turn', target: 'dial', indirect: 'lamp' });
  });
  it('rules see it: number conditions and setVar from the number', () => {
    const s = stateWith(dial, { room: 'bedroom' });
    expect(execute(fallbackParse('turn dial to 4')!, { world: dial, state: s }).lines).toEqual(['The dial clicks.']);
    expect(s.vars?.cell).toBe(4);
    expect(execute(fallbackParse('turn dial to 9')!, { world: dial, state: s }).lines).toEqual(['The dial only goes to 8.']);
  });
  it('the default is Zork’s V-TURN, and a thing where a number goes is not a number', () => {
    const s = stateWith(fixtureWorld, { room: 'bedroom' });
    const before = JSON.stringify(s);
    const r = execute(fallbackParse('turn dial to lamp')!, { world: dial, state: stateWith(dial, { room: 'bedroom' }) });
    expect(r.understood).toBe(false);
    expect(execute({ action: 'take', target: 'number', number: 4 }, { world: fixtureWorld, state: s }).understood).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('number conditions read the command being run', () => {
    const s = stateWith(fixtureWorld, { room: 'bedroom' });
    expect(evaluateCondition('number:4', s, fixtureWorld)).toBe(false);
  });
});
```

Add to `tests/engine/conditions.test.ts`'s audit case: `conditionProblems('number<=8', fixtureWorld)` and `conditionProblems('number:4', fixtureWorld)` are `[]`; `conditionProblems('number<=x', fixtureWorld)` is not.

- [ ] **Step 2: Run** — `npx vitest run tests/engine/numbers.test.ts tests/engine/conditions.test.ts`. Expected: FAIL (`parseNumber` not exported).
- [ ] **Step 3: Implement.**
  - `parser.ts`: export `parseNumber` (port of NUMBER? in `/tmp/zork3-src/gparser.zil`, routine `NUMBER?`). Add `turnTo: /^(?:turn|set)\s+(?:the\s+)?(.+?)\s+(?:to|for)\s+(?:the\s+)?(.+)$/i` to `RE`, placed in `VERB_PATTERNS` after `turnOff*` and before `putOn` (so SET X ON Y stays PUT). After any pattern match, a target or indirect that `parseNumber` accepts becomes `'number'` with `number` set.
  - `scripts.ts`: `Command.number`; `withRules` (`rules.ts`) copies `action.number` onto the command it records.
  - `conditions.ts`: in `evaluateCondition`, extend the compare regex to `(carrying|heaviest|score|number)`; `number` reads `commandOf(state)?.number` (import from `./scripts`), and a command with no number makes every `number` condition false. Add `case 'number'` for `number:N`. `conditionProblems` accepts both.
  - `rules.ts`: the “second object names nothing here” miss skips `indirect === 'number'` when `action.number !== undefined`; `with: 'number'` matches exactly that.
  - `effects.ts`: `{ setVar, from: 'number' }` stores `commandOf(state)?.number ?? 0`.
  - `engine.ts`: `turn` with an indirect and no rule replies `ok(['This has no effect.'])` (V-TURN) — through `withRules`, so a miss stays a miss when the target names nothing.
  - HELP: `TURN X TO N`.
- [ ] **Step 4: Run** the same tests, then the whole suite. Expected: PASS, and `tests/worlds/zork1-*.test.ts` unchanged.
- [ ] **Step 5: Commit** — `git commit -m "6a: numbers (Zork's INTNUM) and TURN/SET X TO N"`.

### Task 2: Typed words (SAY, INCANT, ANSWER)

**Files:**
- Modify: `src/types/world.ts` (`WorldVerb.target` adds `'text'`), `src/types/game.ts` (`ParsedAction.text?: string`), `src/engine/scripts.ts` (`Command.text?: string`), `src/engine/parser.ts` (`worldPatterns`, `splitCommands`), `src/engine/conditions.ts` (`said:`), `src/engine/verbs/world-verbs.ts`, `src/stores/game.ts` (a text verb ends the line), `WORLDS.md` (short note; full docs in Task 12)
- Test: `tests/engine/text-verbs.test.ts` (new), `tests/stores/game.test.ts`

**Interfaces:**
- Consumes: Task 1's compare/`commandOf` pattern in `conditions.ts`.
- Produces: `WorldVerb.target: 'text'`; `ParsedAction.text` (rest of the line, outer quotes dropped, whitespace collapsed); `Command.text`; condition `said:WORDS` (case-folded, punctuation and quotes ignored, whole-word sequence equality with the text); `EngineResult.stopLine = true` set by any text verb.

- [ ] **Step 1: Write the failing tests:**

```ts
// tests/engine/text-verbs.test.ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse, splitCommands } from '@/engine/parser';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const riddle: World = {
  ...fixtureWorld,
  verbs: { ...fixtureWorld.verbs, answer: { words: ['answer', 'reply'], target: 'text', reply: 'Nobody seems to be awaiting your answer.' } },
  rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, instead: { answer: [{ if: 'said:a well', then: 'solved' }, { say: ['Wrong.'] }] } } },
  events: { ...fixtureWorld.events, solved: [{ set: 'riddle' }, 'There is a clap of thunder.'] },
};

describe('typed words (6a)', () => {
  it('a text verb takes the rest of the line, quotes dropped', () => {
    expect(fallbackParse('answer "a well"', riddle.verbs)).toEqual({ action: 'answer', text: 'a well' });
    expect(fallbackParse('reply a well', riddle.verbs)).toEqual({ action: 'answer', text: 'a well' });
  });
  it('said: matches case- and punctuation-blind, whole words', () => {
    const s = stateWith(riddle, { room: 'bedroom' });
    expect(execute(fallbackParse('answer "A Well."', riddle.verbs)!, { world: riddle, state: s }).lines).toEqual(['There is a clap of thunder.']);
    expect(s.flags.riddle).toBe(true);
    const t = stateWith(riddle, { room: 'bedroom' });
    expect(execute(fallbackParse('answer a wellington', riddle.verbs)!, { world: riddle, state: t }).lines).toEqual(['Wrong.']);
  });
  it('nothing after the verb: its reply, and never a miss for naming nothing', () => {
    const s = stateWith(riddle, { room: 'yard' });
    const r = execute(fallbackParse('answer', riddle.verbs)!, { world: riddle, state: s });
    expect(r.lines).toEqual(['Nobody seems to be awaiting your answer.']);
  });
  it('a quoted phrase is never split, and the text verb ends the line', () => {
    expect(splitCommands('answer "a well. really" then look', riddle.verbs)).toEqual(['answer "a well. really" then look']);
    expect(splitCommands('look. answer a well', riddle.verbs)).toEqual(['look', 'answer a well']);
  });
});
```

In `tests/stores/game.test.ts` (fixture world with the `answer` verb added as above): `submit('answer "a well" then look')` prints the thunder line and no room description.

- [ ] **Step 2: Run** — `npx vitest run tests/engine/text-verbs.test.ts tests/stores/game.test.ts -t "typed words|text verb"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `worldPatterns`: a `'text'` verb's pattern is `^(?:words)(?:\s+(.*))?$`; `matchWorld` puts the capture, outer quotes (`"…"`, `“…”`, `'…'`) stripped, into `text` (omitted when empty) and never sets `target`.
  - `splitCommands`: before splitting, if the line (after an earlier clause) starts with a text verb's word, everything from there is one piece; and a clause break inside an open quote never splits. Implement by scanning clauses left to right: once a clause begins with a text verb, join it with the rest.
  - `world-verbs.ts`: a `'text'` verb runs rules with `Command.text` set and never misses for its target; its default reply is `reply`.
  - `conditions.ts` `said:`: normalize both sides with `s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).join(' ')` and compare for equality.
  - Return `stopLine: true` from a text verb's result (the store already drops the rest of the line on `stopLine`).
- [ ] **Step 4: Run** the tests, then the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "6a: typed words: text verbs, said:, quoted phrases"`.

### Task 3: Prepositions and ME

**Files:**
- Modify: `src/types/game.ts` (`ParsedAction.prep?: 'in' | 'on' | 'under' | 'behind' | 'off' | 'over' | 'through'`; `direction` gains the compass and up/down), `src/engine/parser.ts`, `src/engine/engine.ts` (defaults), `src/engine/verbs/containers.ts` (PUT UNDER/BEHIND defaults before the container logic), `src/engine/rules.ts` (`player` target for ME), `src/engine/fuzzy.ts` (ME, MYSELF, SELF → `'player'` in object slots), `src/engine/verbs/meta.ts` (HELP)
- Test: `tests/engine/prepositions.test.ts` (new)

**Interfaces:**
- Produces: the `prep` values above; `ParsedAction.direction` for PUSH X *dir*; the reserved object ID `'player'` (never a world ID: the audit refuses an item, room or NPC named `player`, which `locations` already reserves); rules match ME with `with: 'player'` or `as`-less target `player`.

| Input | Parsed |
|---|---|
| `put mat under door` / `slide mat under door` / `push mat under door` | `{ action: 'put', target: 'mat', indirect: 'door', prep: 'under' }` |
| `put key behind painting` | `put`, prep `behind` |
| `throw rope off cliff` / `throw rope over cliff` | `throw`, prep `off` / `over` |
| `read book through lens` / `read book with lens` | `{ action: 'read', target: 'book', indirect: 'lens', prep: 'through' }` |
| `push box north` | `{ action: 'push', target: 'box', direction: 'north' }` |
| `push box to wall` | `{ action: 'push', target: 'box', indirect: 'wall' }` |
| `spray repellent on me` | `use`, indirect `player` |

Defaults (each through `withRules`): PUT UNDER “You can't do that.”; PUT BEHIND “That hiding place is too obvious.”; THROW OFF/OVER “You can't throw anything off of that!”; READ X THROUGH Y reads X; PUSH X *dir* / PUSH X TO Y “You can't push things to that.” Plain `push X` stays USE (Zork I's buttons).

- [ ] **Step 1: Write the failing tests:** one `it` per row of the table asserting `fallbackParse(...)`; one per default asserting `execute(...).lines` in Infocom style on the fixture world with a `mat`, `door` (door: true), `painting` and `box` added; ME: `fallbackParse('give me the key')` is unchanged (GIVE to nobody), `execute({ action: 'use', target: 'key', indirect: 'player' })` reaches a rule `{ with: 'player', say: ['You spray yourself.'] }`; and `execute({ action: 'put', target: 'mat', indirect: 'door', prep: 'under' })` on a world whose door has `instead.put: [{ prep: 'under', then: 'mat_under' }]` runs the event.
- [ ] **Step 2: Run** — `npx vitest run tests/engine/prepositions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** New `RE` entries, placed before `putIn`/`throw`/`use` in `VERB_PATTERNS`: `putUnder: /^(?:put|place|slide|push|stick)\s+(?:the\s+)?(.+?)\s+(?:under|underneath|beneath|below)\s+(?:the\s+)?(.+)$/i` → `put`/`under`; `putBehind` → `put`/`behind`; `throwOff: /^(?:throw|toss|hurl)\s+(?:the\s+)?(.+?)\s+(off|over)\s+(?:of\s+)?(?:the\s+)?(.+)$/i` → `throw` with prep from the capture; `readWith: /^read\s+(?:the\s+)?(.+?)\s+(?:through|with|using)\s+(?:the\s+)?(.+)$/i` → `read`/`through`; `pushDir: /^(?:push|move|shove)\s+(?:the\s+)?(.+?)\s+(north|south|east|west|northeast|northwest|southeast|southwest|up|down|n|s|e|w|ne|nw|se|sw|u|d)$/i` → `push` with `direction` (normalized through `DIRECTIONS`); `pushTo: /^(?:push|move|shove)\s+(?:the\s+)?(.+?)\s+to\s+(?:the\s+)?(.+)$/i` → `push`. `VERB_PATTERNS`' prep slot type widens. `fuzzy.ts`: ME/MYSELF/SELF/YOURSELF-as-object resolve to `'player'` before item matching. Dispatcher cases for the defaults.
- [ ] **Step 4: Run** the tests and the whole suite (Zork I's PUSH/PUT sessions must be unchanged). Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "6a: PUT UNDER/BEHIND, THROW OFF/OVER, READ THROUGH, PUSH X DIR, and ME"`.

### Task 4: Orders (option C)

**Files:**
- Modify: `src/types/world.ts` (`NPC.orders?: RuleTable`, `NPC.obeys?: Array<'go' | 'take' | 'drop' | 'give'>`, `NPC.obeyReplies?: Partial<Record<'go' | 'take' | 'drop' | 'give', string>>`), `src/engine/verbs/talk.ts` (`handleOrder`), `src/engine/scripts.ts` (`Command.actor?: string`, `Command.order?: ParsedAction`), `src/engine/model.ts` (NPC scope: what's in the NPC's room and what it holds), `src/engine/rules.ts` (`findRule` over `orders`), `src/engine/model.ts` (`npcScope`; NPC moves set `{ room, seq: nextPlacing(state) }` on `npcStateOf(state, id)` as the `moveNpc` effect does in `src/engine/effects.ts`)
- Test: `tests/engine/orders.test.ts` (new)

**Interfaces:**
- Consumes: Tasks 1–3 (`parseNumber`, `text`, `prep`, `'player'`).
- Produces: `handleOrder(action, world, state)` keeps its signature; the order's inner command is `fallbackParse(action.indirect, world.verbs)` resolved in the NPC's scope (`npcScope(world, state, npc): string[]`, exported from `model.ts`) plus `'player'`; rules in `orders[innerVerb]` run with `Command = { verb: innerVerb, actor: npc, target, indirect, number, text, order: inner }`.

Order of resolution:
1. NPC not here → miss `There is no “X” here.` (as now).
2. Inner command unparseable → the NPC's refusal (as now; no miss, since the LLM can't do better with someone else's command).
3. An inner object that names nothing in the NPC's scope → miss `You don’t see a “word” here.`, no state change.
4. First `orders[verb]` rule that applies → `applyRule`.
5. `obeys` includes the verb → built-in:
   - `go DIR`: the NPC's room exit for DIR (doors must be open, `if` must hold, judged as for the player's exits); missing or refused → miss with the NPC's refusal; else `moveNpc` (leave line if the player sees it go). Default reply `obeyReplies.go ?? 'Okay.'`.
   - `take X` (X in its room, portable) → X to the NPC; `drop X` (X held by it) → X to its room; `give X to me` → X to the player. Default replies `obeyReplies[verb] ?? 'Okay.'`. An impossible built-in (not portable, not held) → miss with no state change.
6. Else `refuseOrder ?? '<Name> ignores you.'`.

Every order result sets `stopLine: true`.

- [ ] **Step 1: Write the failing tests** (fixture world plus a `robot` NPC in `bedroom` with `obeys: ['go', 'take', 'drop', 'give']`, `orders: { push: [{ if: 'here:button', then: 'robot_push' }] }`, a `button` scenery item, and the existing `guard` with no orders):

```ts
it('a rule on the inner verb', () => { /* 'robot, push button' → robot_push's line; flag set */ });
it('built-in GO: the robot leaves through a real exit, and a missing exit is a miss', () => {
  /* 'robot, go north' (bedroom has north) → 'Okay.' and state.npcs.robot.room === <north room>;
     'robot, go west' (no west) → understood false, JSON of state unchanged */
});
it('built-in TAKE, DROP and GIVE ME', () => { /* 'robot, take sock' then 'robot, give me the sock' → sock is the player's */ });
it('an inner object it can't reach is a miss with no change', () => { /* 'robot, take xyzzy' */ });
it('characters with no orders and no obeys answer as before', () => { /* 'guard, go north' → 'guard ignores you.' (or its refuseOrder) */ });
it('an order ends the rest of the line', () => { /* result.stopLine === true */ });
it('an order to a thing or someone absent is a miss', () => { /* 'lamp, go north' and 'neighbor, go north' from bedroom */ });
```

Each body follows this pattern (the first written out; the rest the same shape with the line and assertions in its comment):

```ts
it('built-in GO: the robot leaves through a real exit, and a missing exit is a miss', () => {
  const s = stateWith(w, { room: 'bedroom' });
  s.npcs = { robot: { room: 'bedroom' } };
  const go = execute(fallbackParse('robot, go north', w.verbs)!, { world: w, state: s });
  expect(go.lines).toEqual(['Okay.']);
  expect(s.npcs.robot.room).toBe(exitTarget(w.rooms.bedroom.exits.north));
  s.npcs.robot.room = 'bedroom';
  const before = JSON.stringify(s);
  const west = execute(fallbackParse('robot, go west', w.verbs)!, { world: w, state: s });
  expect(west.understood).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/orders.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `talk.ts` per the resolution order above; `npcScope` in `model.ts`; `findRule(world, state, 'orders', verb, ids, scope)` reads `world.npcs[npc].orders`. Keep the existing `instead.order` rules working: they run before step 2 exactly as today (Zork I's thief and Office Space rely on them).
- [ ] **Step 4: Run** the tests and the whole suite. Expected: PASS; Office Space's order tests (synced later) unchanged.
- [ ] **Step 5: Commit** — `git commit -m "6a: orders: order rules on the inner command, built-in GO/TAKE/DROP/GIVE for obeying characters"`.

### Task 5: The intent server and client

**Files:**
- Modify: `server/src/llm.ts` (`ACTION_VOCAB` gains nothing new if `turn`/`put`/`throw`/`read`/`push` are present — check and add `push`; the schema gains optional `prep` (enum of the seven) and `number` (integer 0–1000); the sanitizer keeps them only when valid; the prompt gains lines for numbers, PUT UNDER/BEHIND, THROW OFF/OVER, PUSH X DIR and orders keeping the inner command as words), `server/src/routes/parse-intent.ts` (passes them through), `src/engine/intent-client.ts` (maps them onto `ParsedAction`)
- Test: `server/src/llm.test.ts`, `server/src/routes/parse-intent.test.ts`, `tests/engine/intent-client.test.ts`

- [ ] **Step 1: Write the failing tests:** sanitizing `{ action: 'put', target: 'mat', indirect: 'door', prep: 'under' }` keeps `prep`; `prep: 'sideways'` is dropped; `number: 4` kept, `number: 1001` and `number: '4'` dropped; the client maps `{ action: 'turn', target: 'dial', indirect: 'number', number: 4 }` through unchanged.
- [ ] **Step 2: Run** — `(cd server && npx vitest run)` and `npx vitest run tests/engine/intent-client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "6a: the intent server reads prepositions and numbers"`.

### Task 6: Descriptions from state, script helpers, held:, score and diagnose text

**Files:**
- Modify: `src/types/world.ts` (`Room.descriptionScript?`, `Item.descriptionScript?`, `World.scoreLine?`, `World.rankLine?`, `World.diagnose?: { healthy?: string; wounded?: string }`), `src/engine/describe.ts` (templates + `descriptionScript` in `describeRoom`, `npcDescription`; EXAMINE's item text in `src/engine/verbs/objects.ts`), `src/engine/text.ts` (new: `expandTemplate(text, world, state): string` for `{var:NAME}` and `{number}`), `src/engine/effects.ts` (event lines expand templates), `src/engine/scripts.ts` (context `test`, `exits`, `resolve`, `number`, `text`), `src/engine/conditions.ts` (`held:`), `src/engine/verbs/meta.ts` (`scoreLines` uses `scoreLine`/`rankLine`), `src/engine/verbs/combat.ts` or wherever DIAGNOSE lives, `tests/helpers/audit.ts` (a `descriptionScript` naming no script is a problem)
- Test: `tests/engine/descriptions.test.ts` (new), `tests/engine/scripts.test.ts`, `tests/engine/conditions.test.ts`, `tests/engine/meta.test.ts`

**Interfaces:**
- Produces: `expandTemplate`; `ScriptContext.test(condition): boolean`, `exits(room): Array<{ direction: string; to: string }>` (passable now: `if` holds, door open), `resolve(words, scope?: 'here' | 'held' | 'all'): string | null` (through `fuzzy.ts`), `number?: number`, `text?: string`; condition `held:ITEM`; `scoreLine` placeholders `{score}`, `{max}`, `{moves}` (“N move(s)”, plural-aware), `rankLine` placeholder `{rank}`.

- [ ] **Step 1: Write the failing tests:** a room description `'The dial reads {var:cell}.'` shows `The dial reads 4.` with `vars.cell = 4` and `0` when unset; a room with `descriptionScript: 'grid'` whose script returns `[{ say: '###' }]` shows `###`, ahead of `firstDescription` on a first visit (a description script returns steps like any script; its description is its `say` lines joined, and any other step in it is an audit problem); `ctx.test('flag:a')`, `ctx.exits('bedroom')` (a closed door's exit absent), `ctx.resolve('sock')`; `held:sock` true when the sock is in a carried closed box and `has:sock` false; Infocom-style SCORE with `scoreLine: 'Your score would be {score} (total of {max} points), in {moves}.'` and `rankLine: 'This score gives you the rank of {rank}.'` prints exactly those, and without them prints today's lines; DIAGNOSE with `diagnose.healthy` set prints it.
- [ ] **Step 2: Run** — `npx vitest run tests/engine/descriptions.test.ts tests/engine/scripts.test.ts tests/engine/conditions.test.ts tests/engine/meta.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Template expansion never draws randomness and leaves unknown placeholders as written.
- [ ] **Step 4: Run** the tests and the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "6a: descriptions from state, script helpers, held:, SCORE and DIAGNOSE text"`.

### Task 7: Followers

**Files:**
- Modify: `src/types/world.ts` (`NPC.follows?: string`, `NPC.followLine?: string`; `Effect` `{ follow: string }` / `{ unfollow: string }`, which set and clear the flag `following_<npc>` — document it, and the condition `following:NPC` reads it), `src/engine/verbs/movement.ts` (after a successful `enterRoom` from a player move — GO, a door, ENTER, CLIMB — not from `{ go }` steps, death respawn or `goTo` in scripts), `src/engine/conditions.ts` (`following:`), `src/engine/effects.ts`
- Test: `tests/engine/followers.test.ts` (new)

**Interfaces:**
- Produces: `moveFollowers(fromRoom, world, state): string[]` in `movement.ts`: every live NPC that was in `fromRoom`, isn't hidden, and whose `follows` condition (or `following:` flag) holds moves to the player's room on the shared placing sequence (`nextPlacing`), printing `followLine` (Infocom style: only if set; brass: `followLine ?? '<Name> follows you.'`).

- [ ] **Step 1: Write the failing tests:** a `dog` with `follows: 'flag:leash'` follows from bedroom to the next room on GO, prints its line, and is listed after things already there; a refused move (closed door, `requires`) leaves it where it was; `{ go: ROOM }` from an event and a death respawn don't drag it along; two followers both arrive in their original order; `{ follow: 'dog' }` / `{ unfollow: 'dog' }` work without `follows`.
- [ ] **Step 2: Run** — `npx vitest run tests/engine/followers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "6a: followers"`.

### Task 8: Vehicle kinds

**Files:**
- Modify: `src/types/world.ts` (`Room.air?: boolean | string`; `Item.vehicle.travels: 'water' | 'air' | 'none'`; `vehicle.arrive?: string`, `vehicle.leave?: string`; `Effect` `{ moveVehicle: string; to: string }`), `src/engine/model.ts` (`isAir`), `src/engine/verbs/movement.ts` (`vehicleRefusal` generalised: a room that is water or air needs a vehicle of that kind; a `'none'` vehicle never moves — the player must get out first: “You can’t go there in a <name>.”; the water-landing line stays for water), `src/engine/effects.ts` (`moveVehicle`: moves the vehicle and, if the player is aboard, the player, printing `leave` then the new room's description then `arrive`; if not aboard, silent unless the vehicle leaves or enters the player's room, which prints `leave`/`arrive`)
- Test: `tests/engine/vehicles.test.ts` (extend)

- [ ] **Step 1: Write the failing tests:** a `balloon` (`travels: 'air'`) can move from a land room into an `air` room and back to land; a raft (`'water'`) can't enter an air room; on foot you can't enter an air room (“You can’t go there without a vehicle.”); a `'none'` chair refuses every move while aboard; `moveVehicle` with the player aboard describes the new room and prints `arrive`; with the player not aboard and in neither room it prints nothing; with the player watching it leave it prints `leave`. Zork I's boat sessions stay unchanged.
- [ ] **Step 2: Run** — `npx vitest run tests/engine/vehicles.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "6a: vehicles that fly or stay put, and moving a vehicle from a timer"`.

### Task 9: Death options

**Files:**
- Modify: `src/types/world.ts` (`death.keepTimers?: string[]`; `death.treasures?: 'dark' | { to: string }`), `src/engine/death.ts` (`state.fuses = {}` keeps the listed ones; `{ to }` sends treasures without a `home` to that place), `tests/helpers/audit.ts` (unknown timer or place is a problem)
- Test: `tests/engine/death.test.ts` (extend)

- [ ] **Step 1: Write the failing tests:** dying with timers `a` and `b` scheduled and `keepTimers: ['a']` leaves only `a`; with `treasures: { to: 'case' }` a carried treasure goes into the `case` item, a carried treasure with a `home` goes home, and junk scatters as before; `'dark'` unchanged.
- [ ] **Step 2: Run** — `npx vitest run tests/engine/death.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and the whole suite (Zork I's death sessions unchanged). Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "6a: death keeps chosen timers and can send treasures to one place"`.

### Task 10: The session harness for three games

**Files:**
- Modify: `tests/worlds/zsession.ts` (`openOriginal(seed, story = 'zork1')`, `openNative(seed, world = zork1)`, `RANDOM_LINES` per story; stories load from `public/stories/<name>.z3`, keeping `tests/fixtures/zork1.z3` for Zork I's existing tests), new `tests/worlds/slices.ts` (`sliceRun({ story, prefix, seed, world, build, commands })`: plays `prefix` in the original (seeded), then `commands` on both sides, the native side starting from `build(state)`; returns both sides' replies to `commands` only), new `tests/worlds/zork23-allowlist.ts`
- Test: `tests/worlds/slices.test.ts` (new; the harness's own checks)

- [ ] **Step 1: Write the failing tests:** `openOriginal(1, 'zork2')`'s first `look` contains `Inside the Barrow`; `openOriginal(1, 'zork3')`'s contains `Endless Stair`; `sliceRun` with an empty prefix and a trivial world (`build` puts the player in a one-room world whose description equals the original's opening room text) returns matching first replies; a prefix that doesn't reach its target throws, naming the slice.
- [ ] **Step 2: Run** — `npx vitest run tests/worlds/slices.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Zork I callers keep their current behaviour (defaults).
- [ ] **Step 4: Run** the tests and all `tests/worlds/zork1-*.test.ts`. Expected: PASS, Zork I unchanged.
- [ ] **Step 5: Commit** — `git commit -m "6a: the session harness drives Zork II and Zork III, and plays slices"`.

### Task 11: The four slices

One slice per commit. Each is a test-only world file plus a test. Work each the same way:

1. Read the rooms, objects and routines in the ZIL (`/tmp/zork2-src/2dungeon.zil`, `2actions.zil`; `/tmp/zork3-src/3dungeon.zil`, `3actions.zil`).
2. Find a prefix that reaches the slice in the original: Jericho's walkthrough for the game where its release matches (Zork II r63, Zork III r25), else written from the source; confirm with `tests/zz/route.test.ts` adapted to the story (`S=zork2 C=cmd,cmd,…`).
3. Write the slice world (data first; scripts only where Zork computes), the `build` that matches the original's state at the slice's start, and the slice commands.
4. Write the test (`sliceRun`, exact match), watch it fail, make it pass by fixing the slice data (or, if the difference is the engine's, by a TDD fix in the engine with its own fixture test first, ledgered).

Files: `tests/worlds/zork2-slices/{robot,riddle,balloon}.ts`, `tests/worlds/zork3-slices/endgame.ts`, `tests/worlds/zork2-slices.test.ts`, `tests/worlds/zork3-slices.test.ts`.

Slice command lists (extend as the source shows; each must exercise its row of the spec's table):

- **Robot** (ROBOT-F, I-ROBOT? if any, the carousel CAROUSEL-ROOM, MACHINE-ROOM, the cage): `robot, go east`, `robot, push button` (stops the carousel spinning), `robot, take sphere`/`robot, lift cage` (as the source has it), `robot, give me the sphere`, an order the robot refuses, `robot, go west` where there's no west.
- **Riddle and door** (RIDDLE-ROOM, the riddle's answer check; DREARY-ROOM, TINY-ROOM, the mat, the key, the door): `answer "a well"`, a wrong answer, `put mat under door`, pushing the key out (as the source has it), `pull mat`, `take key`.
- **Balloon** (BALLOON, I-BALLOON, the receptacle, the volcano rooms, the ledges): board, light and place the fuel, the rises and the landing on a ledge, the descriptions as it moves, getting out.
- **Endgame** (Zork III PARAPET, CELL, PRISON-CELL, the dial, the button, DUNGEON-MASTER): `turn dial to 4`, `push button`, `dungeon master, turn dial to 1`, `dungeon master, push button`, the master following you into the cell, `score` (“Your potential is …”).

- [ ] **Step 1: Robot slice** — test fails, then passes; commit `6a: Zork II slice: the robot`.
- [ ] **Step 2: Riddle and door slice** — commit `6a: Zork II slice: the riddle and the door`.
- [ ] **Step 3: Balloon slice** — commit `6a: Zork II slice: the balloon`.
- [ ] **Step 4: Endgame slice** — commit `6a: Zork III slice: the endgame`.
- [ ] **Step 5: Run** the whole suite. Expected: PASS; each slice test under a minute.

### Task 13: Vehicle terrains (added 2026-10-07 at the owner's request; runs before Task 12)

The owner asked for a more general vehicle model (a dune buggy over a sand maze must be expressible). It reshapes the vehicle part of the world format, so it lands before the npm library. Zork's own model is terrain bits on rooms (RLANDBIT, RWATERBIT, RAIRBIT) and a vehicle type (VTYPE) that must match the destination's terrain; this generalises it to named terrains.

**Files:**
- Modify: `src/types/world.ts`, `src/engine/model.ts` (`terrainOf(world, state, room): string`; `isWater`/`isAir` become terrain checks), `src/engine/verbs/movement.ts` (`vehicleRefusal`, `enterRoom`'s landing line), `src/engine/verbs/vehicle.ts` (disembark), `src/engine/effects.ts` (`moveVehicle` uses the same lines), `tests/helpers/audit.ts`, `tests/worlds/zork2-slices/balloon.ts` (use `landing`), `docs/reference/world-schema.md`
- Test: `tests/engine/vehicle.test.ts` (extend), new `tests/engine/terrain.test.ts`

**Interfaces:**
- `Room.terrain?: string` (default `'land'`). The existing `water?: boolean | string` and `air?: boolean | string` stay as shorthand: when set and holding, the room's terrain is `'water'` / `'air'` (a set `terrain` wins over them).
- `World.onFoot?: string[]`: terrains the player can walk into and get out of a vehicle in. Default `['land']`. Custom terrains (`'sand'`) are walkable only if listed.
- `vehicle.travels: string | string[]`: the terrains it can enter. Legacy strings keep working: `'water'` = `['water']`, `'air'` = `['air']`, `'none'` = `[]` (never moves).
- `vehicle.lands?: string[]`: terrains it can come to rest on from a terrain it travels (the boat reaching the shore; the balloon landing). Default `['land']` when `travels` doesn't include `'land'`. A vehicle can't move between two `lands` terrains it doesn't travel (Zork's "a vehicle won't go overland").
- Movement aboard from A to B is allowed when B's terrain is in `travels`, or B's terrain is in `lands` and A's terrain is in `travels`. On foot, B's terrain must be in `onFoot`. Refusals keep today's text: “You can’t go there without a vehicle.” / “You can’t go there in a <name>.”
- Getting out is refused (fatal, as today on water and in air) where the room's terrain isn't in `onFoot`.
- `vehicle.landing?: string | string[]`: GOTO's line when the vehicle comes onto a `lands` terrain from a travelled terrain not in `onFoot`. Unset: water vehicles print today's “The <name> comes to a rest on the shore.” and its blank line exactly; others print nothing. An array prints its lines as given.
- `vehicle.leave?` / `vehicle.arrive?`: each `string | string[] | { script: string }`. A string prints as now; an array picks one line with the seeded generator; a script's `say` lines print. Same moments as now (aboard moves and `moveVehicle`).
- Audit: a terrain named in `travels`, `lands` or `onFoot` that no room has (and isn't `'land'`) is a problem (typo guard); a `leave`/`arrive` script must exist.

- [ ] **Step 1: Write the failing tests:** a fixture world with a `sand` maze and a `buggy` (`travels: ['land', 'sand']`): driving through the sand rooms works and prints the buggy's `leave`/`arrive` lines; on foot into sand gets “You can’t go there without a vehicle.”; getting out in sand is refused; with `onFoot: ['land', 'sand']` walking works. A boat (`travels: 'water'`) keeps every current behaviour and line (existing tests). The balloon (`travels: 'air'`, `landing: 'The balloon lands.'`) prints the landing line onto land. A `'none'` chair never moves. `leave` as an array picks with the seed (same seed, same line); as `{ script }` prints the script's lines. The audit flags `travels: ['snad']`.
- [ ] **Step 2: Run** — `npx vitest run tests/engine/terrain.test.ts tests/engine/vehicle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**; use `landing` in the balloon slice and delete its hand-rolled landing line where the engine now prints it.
- [ ] **Step 4: Run** the whole suite with `ZORK_LONG=1` (Zork I's boat and river sessions and every slice unchanged). Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "6a: vehicle terrains: named terrains, travels/lands/onFoot, landing, and flexible leave/arrive"`.

### Task 12: Docs, release and the Office Space sync

**Files:**
- Modify: `WORLDS.md` (orders, `obeys`, `obeyReplies`; numbers, `number:`, `with: 'number'`, `setVar … from`; text verbs and `said:`; the new prepositions and ME; templates and `descriptionScript`; followers; vehicle kinds and `moveVehicle`; `keepTimers`, `treasures: { to }`; `scoreLine`, `rankLine`, `diagnose`), `docs/reference/conditions-and-events.md`, `ARCHITECTURE.md` (the order pipeline, the new parser slots), `README.md` (players can give orders and type numbers and quoted answers), `CHANGELOG.md` (1.13.0), `package.json` and `server/package.json` (1.13.0), `src/worlds/tutorial.ts` and `tests/worlds/tutorial.test.ts` (a small order and a number puzzle, if they fit the tutorial's shape), `docs/superpowers/backlog.md` (deferred minors)
- Office Space (`../infocom-office-space`, new branch `engine-parity-stage-6a`): `scripts/sync-from-public.sh ../brass-lantern`, its lint/type-check/tests and server tests, a probe that its visible replies don't change, CHANGELOG 1.13.0 (players: nothing new unless a reply changed), version bump.

- [ ] **Step 1:** Docs and tutorial; run `tests/worlds/tutorial.test.ts`.
- [ ] **Step 2:** Version and CHANGELOG; full suite with `ZORK_LONG=1`, lint, type-check, coverage thresholds.
- [ ] **Step 3:** Commit `6a: docs, tutorial and 1.13.0`.
- [ ] **Step 4:** Office Space sync, checks, commit, push both branches, open PRs.
