# Engine parity, stage 5c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One generic condition (`heaviest<=N`) in the engine; native Zork I gains the coal mine (14 rooms, the bat, the gas room, the narrow passage, the basket, the machine, the slide, three treasures), every puzzle checked against zork1.z3 by seeded sessions.

**Architecture:** One engine task first (the condition, unit-tested on the fixture world). Then three content tasks in `src/worlds/zork1.ts` by region of the mine, each with its sessions in `tests/worlds/zork1-sessions.ts` + `zork1-sessions.test.ts` (the 5a harness, `tests/worlds/zsession.ts`). A scoring/thief task, docs, and the Office Space sync close it.

**Tech Stack:** TypeScript 6, Vue 3/Pinia, Vitest 5, ifvms (tests only), Express intent server.

**Spec:** `docs/superpowers/specs/2026-10-06-engine-parity-stage-5c-design.md`. ZIL: `/tmp/zork1-src` (clone `https://github.com/historicalsource/zork1` there if missing). Story: `tests/fixtures/zork1.z3`.

## Global Constraints

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes and no player-visible change.
- Saves stay format 2.0; new state fields, if any turn up, are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.
- Item weight is `weightOf` (`src/engine/weight.ts`): own `size` (default 5, as Zork's) plus everything inside.
- Tests run in the node environment; DOM-using files start with `// @vitest-environment happy-dom`. Session tests need it (saves use localStorage).
- Zork timer convention (5a): a ZIL `QUEUE n` from an action is `schedule in: n - 1`; a re-queue from inside a fuse is `schedule in: n`.

## Tools carried over from 5a/5b

- `tests/worlds/zsession.ts`: `prefixed(side, commands, seed)`, `findSeed(side, commands, accept?, tries?)`, `compare` (move counts in SCORE normalized), `openOriginal`, `openNative`, `PREFIX` (ends in the Round Room with the lamp lit, the sword, the bottle and the rope, the troll dead).
- `tests/zz/` (untracked, in `.git/info/exclude`): `seeds.test.ts` finds pinned seeds for every exported session table (env `SESSIONS=a,b`, `SAME_ROOM=…`/`SAME_LAST=…` to make a random branch agree with the original's, `AVOID=…` to reject a native run whose transcript contains a string, `TRIES=n`). `peek3.test.ts` prints one side's transcript (env `S`, `SIDE`, `SEED`).
- Session tables: `export const X_SESSIONS: Record<string, string[]>` in `zork1-sessions.ts`; registered in `zork1-sessions.test.ts`'s `GROUPS` (title, table) and pinned in `SEEDS` (`name: { native, original }`).

Run suites with `npx vitest run --exclude "tests/zz/**"`.

## Review Focus

1. The bat never grabs a ghost (the ZIL's `NOT ,DEAD`): entering the Bat Room as a spirit just describes it. (Task 3 unit test.)
2. The gas room's check runs at the end of the turn: lighting a candle there kills that same turn; arriving with a lit candle and putting it out on the next command is too late (you die on arrival's end of turn). (Task 4 session `gas-arrive` and `gas-light`.)
3. `heaviest<=N` counts a container with its contents, passes with empty hands, and a malformed form (`heaviest<4x`) is reported by the audit. (Task 1 tests.)
4. The basket at the other end of the chain can't be taken or used (“The basket is at the other end of the chain.”), and the machine can't be taken. (Task 5 session `basket` and `machine`.)
5. UNDO across the machine's transformation and the basket swap restores both items' places. (Task 5 unit test.)

---

### Task 1: `heaviest<=N`

**Files:**
- Modify: `src/engine/conditions.ts` (the compare form and `conditionProblems`), `docs/reference/conditions-and-events.md`
- Test: `tests/engine/conditions.test.ts`

**Interfaces:**
- Consumes: `weightOf(world, state, id)` and `childrenOf` / `PLAYER` from `src/engine/model.ts`.
- Produces: condition form `heaviest<=N` (operators `=`, `<`, `>`, `<=`, `>=`), the heaviest thing the player holds directly, each counted with its contents; 0 when empty-handed.

- [ ] **Step 1: Write the failing test** (append to `tests/engine/conditions.test.ts`; adjust the fixture IDs to ones that exist in `tests/fixtures/world.ts` — any portable item and any portable open container):

```ts
describe('heaviest<=N (5c)', () => {
  it('is the heaviest thing held, a container counted with its contents', () => {
    const w: World = {
      ...fixtureWorld,
      items: {
        ...fixtureWorld.items,
        feather: { name: 'feather', description: '', portable: true, tags: [], size: 1 },
        pouch: { name: 'pouch', description: '', portable: true, tags: [], size: 2, container: { open: true } },
        rock: { name: 'rock', description: '', portable: true, tags: [], size: 3 },
      },
    };
    const s = stateWith(w, { room: 'bedroom' });
    expect(evaluateCondition('heaviest<=4', s, w)).toBe(true); // empty hands: 0
    s.locations.feather = 'player';
    s.locations.pouch = 'player';
    expect(evaluateCondition('heaviest<=4', s, w)).toBe(true); // 1 and 2
    s.locations.rock = 'pouch';
    expect(evaluateCondition('heaviest<=4', s, w)).toBe(false); // pouch 2 + rock 3
    expect(evaluateCondition('heaviest=5', s, w)).toBe(true);
    expect(evaluateCondition('!heaviest>4', s, w)).toBe(false);
  });
  it('the audit knows the form and catches a malformed one', () => {
    expect(conditionProblems('heaviest<=4', fixtureWorld)).toEqual([]);
    expect(conditionProblems('heaviest<4x', fixtureWorld)).not.toEqual([]);
  });
});
```

(Check `conditionProblems`' real name and signature in `conditions.ts` and import it with `World`, `stateWith`, `fixtureWorld` as the file's other tests do.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/conditions.test.ts -t heaviest`. Expected: FAIL (unknown condition).
- [ ] **Step 3: Implement** in `conditions.ts`: extend the compare regex at the `var:NAME<=N and carrying<=N` branch to `^(?:var:(\w+)|carrying|heaviest)\s*(<=|>=|=|<|>)\s*(-?\d+)$`, computing `heaviest` as

```ts
function heaviest(world: World, state: GameState): number {
  return Math.max(0, ...Object.keys(state.locations).filter((id) => state.locations[id] === PLAYER).map((id) => weightOf(world, state, id)));
}
```

(use the same "held directly" enumeration `carrying()` uses), and add `heaviest` to the audit's accepted compare form (the `continue` regex near line 122). Add the header comment line ` *   heaviest<=N     the heaviest thing the player holds, contents included`.
- [ ] **Step 4: Run** — `npx vitest run tests/engine/conditions.test.ts`. Expected: PASS.
- [ ] **Step 5: Docs** — `conditions-and-events.md`: `heaviest<=N` beside `carrying<=N`, with Zork's narrow passage as the example.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "heaviest<=N: the heaviest thing held, contents included"`

---

### Task 2: The mine route prefix

**Files:**
- Modify: `tests/worlds/zsession.ts`

**Interfaces:**
- Produces: `MINE_PREFIX` (PREFIX + the walk from the Round Room to the Slide Room by the Cold Passage, through rooms that exist since 5a; before the mine opens it ends at the Cold Passage's west denial).

- [ ] **Step 1:** Work out the route from the Round Room to the Cold Passage on the original with `tests/zz/peek3.test.ts` (`SIDE=original`); the Cold Passage is reached from Mirror Room 1 (north). Append `'west'` (into the Slide Room) as the last command.
- [ ] **Step 2:** Export `MINE_PREFIX`; check both sides reach the Cold Passage identically with a throwaway session (`compare` up to the `west`; the native side answers with the denial until Task 3).
- [ ] **Step 3: Commit** — `git add tests/worlds/zsession.ts && git commit -m "Sessions: a prefix to the coal mine"`

---

### Task 3: The upper mine: Slide Room, Mine Entrance, Squeaky Room, Bat Room, Shaft Room

**Files:**
- Modify: `src/worlds/zork1.ts`, `tests/worlds/zork1-sessions.ts`, `tests/worlds/zork1-sessions.test.ts`, `tests/worlds/zork1.test.ts`

**Interfaces:**
- Consumes: `MINE_PREFIX`.
- Produces: rooms `slide_room`, `mine_entrance`, `squeeky_room`, `bat_room`, `shaft_room` (all `dark: true`); items `bat` (NPC-like scenery item or NPC per what `onEnter`/attack need), `jade` (`treasure` per ZIL VALUE/TVALUE), `raised_basket` (in `shaft_room`, open container, not portable), the `slide` and `chain` local globals; Cold Passage `west: 'slide_room'`; script `bat_flight` (FLY-ME: “    Fweep!” ×3, the grab line, a blank line, `{ go: pickOne(BAT_DROPS) }`, first look); `BAT_DROPS` = `mine_1`, `mine_2`, `mine_3`, `mine_4`, `ladder_top`, `ladder_bottom`, `squeeky_room`, `mine_entrance` (PICK-ONE over 1actions.zil:332's LTABLE). Six of those rooms arrive in Task 4, so the bat's flight session (`upper-mine`) lives in Task 4's table; Task 3 tests the bat with the garlic and the ghost.

- [ ] **Step 1: Transcribe from ZIL:** the five rooms' LDESCs and exits (1dungeon.zil), BATS-ROOM (M-LOOK text; M-ENTER: unless the garlic is held or here and you're not dead, describe the room, then FLY-ME), BAT-F (TELL: fweep ×5; TAKE/ATTACK/MUNG: with garlic “You can't reach him; he's on the ceiling.”, else FLY-ME), FWEEP, SLIDE-FUNCTION and SLIDER (“You tumble down the slide....” then the Cellar; PUT X IN SLIDE: “The X falls into the slide and is gone.” and X to the Cellar; not takeable: a YUKS line), the raised basket's TAKE refusal and the chain pseudo-object (CHAIN-PSEUDO).
- [ ] **Step 2: Write sessions** (`MINE_SESSIONS`, each starting with `...MINE_PREFIX`):
  - `slide`: `look`, `put rope in slide`, `climb down slide`, `look` (the rope in the Cellar), `take rope`.
  - `upper-rooms`: `north`, `look`, `west`, `look` (Mine Entrance, Squeaky Room; stop before the Bat Room).
  - `garlic`: from the start, fetch the garlic (kitchen sack) before MINE_PREFIX's descent (write this one in full with the garlic step inserted), then to the Bat Room: `look`, `take bat`, `take jade`, `east`, `look`, `take basket`, `take chain`.
  Write each list in full; pin seeds with `tests/zz/seeds.test.ts`; register the table in `GROUPS` and `SEEDS`.
- [ ] **Step 3: Unit test** in `tests/worlds/zork1.test.ts` (Review Focus 1): a dead player (set the state the 5a ghost tests use for Hades — `flags.dead` or whatever 5a's ghost mode sets) moved into `bat_room` by `execute({ action: 'go', … })` from `squeeky_room` ends the turn still in `bat_room`.
- [ ] **Step 4: Run** — `npx vitest run tests/worlds/zork1-sessions.test.ts -t mine tests/worlds/zork1.test.ts -t bat`. Expected: FAIL.
- [ ] **Step 5: Implement** Step 1; iterate to match (generic Infocom differences found here are fixed in the engine with a unit test each, and ledgered).
- [ ] **Step 6: Run** — `npx vitest run tests/worlds`. Expected: PASS.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "Zork I: the upper mine, the bat and the slide"`

---

### Task 4: The gas room, the coal mine maze, the ladder, the Dead End

**Files:**
- Modify: `src/worlds/zork1.ts`, session files

**Interfaces:**
- Produces: rooms `smelly_room`, `gas_room`, `mine_1`..`mine_4`, `ladder_top`, `ladder_bottom`, `dead_end_5` (all dark); items `bracelet` (Gas Room, treasure), `coal` (Dead End, portable, size per ZIL); `ladder` local global; Gas Room `onEnd` running script `gas_check`.

- [ ] **Step 1: Transcribe from ZIL:** the rooms (Mines 1–4: “This is a nondescript part of a coal mine.” with their self-loops), SMELLY-ROOM's text and the gas pseudo-object if any, BOOM-ROOM: at the end of the turn, if a candle, torch or match is held and on — when the turn's command was LIGHT/BURN of that flame, “How sad for an aspiring adventurer to light a <thing> in a room which reeks of gas. Fortunately, there is justice in the world.”, else “Oh dear. It appears that the smell coming from this room was coal gas. I would have thought twice about carrying flaming objects in here.”; then the death with message “\n      ** BOOOOOOOOOOOM **”. `gas_check` reads `ctx.action` (5a) for the lighting case.
- [ ] **Step 2: Write sessions** (`GAS_SESSIONS`, from `MINE_PREFIX` + the garlic or a bat-safe route; the candles and match come from 5a's temple route — reuse `TEMPLE_SESSIONS`' prefix steps):
  - `gas-safe`: with only the lamp: `down` into the Gas Room, `look`, `take bracelet`, `east`, `look`, walk the maze to the Ladder Top (`ne`, `se`, `sw`, `down`), `down`, `south`, `take coal`, `look`.
  - `gas-arrive`: carrying lit candles into the Gas Room (`light candles with match` in the Smelly Room, `down`) — the explosion on arrival (Review Focus 2).
  - `gas-light`: in the Gas Room with the lamp, `light match` — the “aspiring adventurer” text.
  - `maze`: every Mine room's exits including the self-loops, back to the Gas Room.
  - `bat-flight`: from `MINE_PREFIX` without the garlic: `north`, `west`, `north` (the bat carries you off to a random BAT_DROPS room; seed with `SAME_ROOM`), `look`.
  Seeds as before; drop treasures before deaths.
- [ ] **Step 3–6:** run (FAIL), implement, run `tests/worlds` (PASS), commit `Zork I: the gas room, the coal mine and the ladder`.

---

### Task 5: The narrow passage, the Lower Shaft, the machine, the basket

**Files:**
- Modify: `src/worlds/zork1.ts`, session files, `tests/worlds/zork1.test.ts`, `tests/stores/game.test.ts` (UNDO)

**Interfaces:**
- Consumes: Task 1's `heaviest<=4`; 5a's TURN … WITH.
- Produces: rooms `timber_room`, `lower_shaft` (“Drafty Room”), `machine_room`; items `timbers`, `lowered_basket` (in `lower_shaft`), `machine` (closed container, not portable), `machine_switch`, `diamond` (treasure, nowhere until made), `gunk` (“small piece of vitreous slag”, check the ZIL name); world verbs `raise`, `lower`; flag `light_shaft_scored`.

- [ ] **Step 1: Transcribe from ZIL:** TIMBER-ROOM and LOWER-SHAFT exits as `{ to, if: 'heaviest<=4', denial: 'You cannot fit through this passage with that load.' }`; NO-OBJS' LIGHT-SHAFT (13 points the first command in the Lower Shaft while lit — a room `instead`-free hook: the room's `onEnd` or M-BEG equivalent; check which turn the story file awards it on and match); MACHINE-ROOM-FCN's M-LOOK (lid open/closed), MACHINE-F (TAKE “It is far too large to carry.”; OPEN listing contents / “The lid opens.”; CLOSE “The lid closes.”; DUMMY lines when already so; TURN ON with no tool “It's not clear how to turn it on with your bare hands.”, with a tool → the switch), MSWITCH-FUNCTION (screwdriver + lid open: “The machine doesn't seem to want to do anything.”; closed: the lights text, coal → diamond, else everything → gunk; other tool “It seems that a <tool> won't do.”), BASKET-F (RAISE/LOWER swapping `raised_basket`/`lowered_basket` contents and places, DUMMY when already there, “It is now pitch black.” when lowering leaves the room dark, the other-end and fastened refusals), GUNK.
- [ ] **Step 2: Write sessions** (`SHAFT_SESSIONS`; from the Shaft Room with the coal fetched in Task 4's route and the screwdriver from the Maintenance Room — build the prefix from 5a's dam route):
  - `basket`: at the Shaft Room: `put coal in basket`, `put screwdriver in basket`, `lower basket`, `lower basket`, `take basket`, `raise basket`, `lower basket`, then back through the mine to the Timber Room.
  - `squeeze`: at the Timber Room with the lamp: `west` (refused), `drop lamp`, `west`, `look` (dark), `east`, `take lamp`.
  - `machine`: through the passage empty-handed, in the Lower Shaft take the screwdriver and coal from the lowered basket (and the torch, for light — the LIGHT-SHAFT 13), `south`, `look`, `take machine`, `open lid`, `put coal in machine`, `turn switch with screwdriver` (lid open), `close lid`, `turn switch with screwdriver`, `open lid`, `take diamond`, `score`.
  - `gunk`: as `machine` but `put screwdriver`-less junk (e.g. the timbers? not takeable — use a carried light item) in the machine, close, turn → gunk.
  Seeds as before.
- [ ] **Step 3: Unit test** (Review Focus 5) in `tests/stores/game.test.ts`: in the Machine Room with the coal in the closed machine, `turn switch with screwdriver`, then UNDO: the coal is back in the machine and the diamond nowhere. And at the Shaft Room, `lower basket`, UNDO: both baskets back.
- [ ] **Step 4–7:** run (FAIL), implement, run `tests/worlds tests/stores` (PASS), commit `Zork I: the narrow passage, the machine and the basket`.

---

### Task 6: Treasures, scoring and the thief

**Files:**
- Modify: `tests/worlds/zork1.test.ts`, `tests/worlds/zork1-thief-unit.test.ts` (if the route test lists rooms), `tests/worlds/zork1-sessions.test.ts` (re-pins), `src/worlds/zork1.ts`

- [ ] **Step 1: Failing tests:** the jade, the bracelet and the diamond's VALUE/TVALUE from the ZIL (as 5b's scoring test: take, then into the trophy case); LIGHT-SHAFT's 13 counted once; the world audit (`tests/helpers/audit.ts` via the existing zork1 audit test) clean with the new rooms; the rooms test's story order including the mine.
- [ ] **Step 2:** run (FAIL where content is missing), implement, run the whole suite; re-pin every session seed the larger thief route shifted (`tests/zz/seeds.test.ts`), each re-pin ledgered.
- [ ] **Step 3: Commit** — `Zork I: 5c's treasures and re-pinned seeds`

---

### Task 7: Docs and 1.11.0

**Files:**
- Modify: `docs/guide/porting-zork.md` (EMPTY-HANDED and WEIGHT → `heaviest<=N`; the bat as `onEnter` + `pickOne`; BOOM-ROOM as `onEnd` with `ctx.action`; the basket as two items; the machine; the slide; coverage and What's next → 5d), `CHANGELOG.md` (1.11.0), `package.json` + `server/package.json` (1.11.0; lockfiles via `npm install --package-lock-only --ignore-scripts`), the zork1 intro's coverage line, `docs/superpowers/backlog.md` (nothing shipped from it; leave).

- [ ] Steps: docs, `npm run docs:build && npm run lint && npm run type-check && npx vitest run --coverage --exclude "tests/zz/**" && (cd server && npm test)`, commit `1.11.0: docs`.

---

### Task 8: Office Space

- [ ] Sync with `scripts/sync-from-public.sh ../brass-lantern` on a new branch `engine-parity-stage-5c` (tree clean); its tests should pass unchanged. Check for visible changes with a throwaway test in `tests/zz/` (none expected: `heaviest` is unused). Bump to 1.11.0 with a CHANGELOG entry (engine only, no player-visible change); lint, type-check, coverage, build, server tests; commit, push, PR on both repos. After the final review and CI, with the owner's go-ahead: merge both, tag `v1.11.0` on each, publish the brass-lantern release, check the live site.

---

## Self-review notes

- **Spec coverage:** `heaviest<=N` → 1; rooms → 3, 4, 5; the bat → 3; the gas room → 4; the narrow passage and LIGHT-SHAFT → 5; the basket → 5; the machine → 5; the slide → 3; treasures → 6; testing → 2–6; docs and release → 7, 8; edge cases → Review Focus, pinned in 1, 3, 4, 5.
- **Deferred to execution with rulings:** exact routes, seeds, Zork's exact strings (from the ZIL, then the story file), BAT-DROPS' full list, LIGHT-SHAFT's turn.
- **Type consistency:** `heaviest`, `MINE_PREFIX`, `MINE_SESSIONS`, `GAS_SESSIONS`, `SHAFT_SESSIONS`, `bat_flight`, `gas_check`, `BAT_DROPS`, `raised_basket`, `lowered_basket`, `machine_switch` are used under these names throughout.
