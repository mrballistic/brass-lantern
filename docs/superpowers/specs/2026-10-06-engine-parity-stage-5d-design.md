# Engine parity, stage 5d: the barrow, the thief's timing, and the whole game

**Status:** approved in conversation 2026-10-06; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [stage 1](./2026-10-05-engine-parity-stage-1-design.md) (the roadmap and the decisions for the whole effort) through [stage 5c](./2026-10-06-engine-parity-stage-5c-design.md). Picks up from [the backlog](../backlog.md) only what the full game runs into.

## Decisions made while brainstorming

- **5d finishes Zork I:** the last two rooms (the Mountains, the Stone Barrow), winning at 350 points, the thief's timing measured against the original, and the whole game played against zork1.z3.
- **The full game is proved in chapters** (owner's choice). It runs natively as one test, start to win; against the original it's compared chapter by chapter, each replaying the earlier ones, with seeds chosen so the thief stays away except where the walkthrough needs him, and fights as sync points. A chapter that can't find agreeing seeds falls back to line sets for that stretch, ledgered and reported.
- **The thief's timing is a frequency test** (owner's choice): his arrivals natively and in the original, over many seeds, must agree within a stated tolerance; and the diff walkthrough stops parking him offstage.
- **Backlog:** only the deferred items the full game runs into are fixed; the rest stay ledgered.
- **Data first, with the script hatch**, as before.

## Invariants (unchanged)

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes and no player-visible change.
- Saves stay format 2.0; new state fields, if any, are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.

## 1. Generic engine piece

### `score<op>N`

- New condition form `score<op>N` (`=`, `<`, `>`, `<=`, `>=`, like `carrying` and `heaviest`): the current score, as SCORE reports it.
- Parsed in `conditions.ts`; known to `conditionProblems`; documented in conditions-and-events.
- Zork uses it in a daemon to win at 350 (SCORE-UPD).

## 2. The Zork content

### The Mountains

- MOUNTAINS: “Forest”, “The forest thins out, revealing impassable mountains.”; up and east “The mountains are impassable.”; north, south and west to Forest 2. Forest 2's stubbed east exit opens onto it.
- The mountain range (MOUNTAIN-RANGE-F): climbing it, “Don't you believe me? The mountains are impassable!”

### Winning (SCORE-UPD)

- A daemon `{ if: 'score>=350 & !flag:won' }` sets `won`, reveals the ancient map in the trophy case, marks West of House unvisited, and prints “An almost inaudible voice whispers in your ear, “Look to your treasures for the final secret.””. It fires once: losing points and regaining them doesn't repeat it, and dying after winning keeps `won`.
- The ancient map: in the trophy case, hidden until then, FDESC “In the trophy case is an ancient parchment which appears to be a map.”, readable (“The map shows a forest with three clearings. … marked “To Stone Barrow”.”), size 2.

### West of House and the Stone Barrow

- WEST-HOUSE: with `won`, the description adds “ A secret path leads southwest into the forest.”; southwest and in lead to the Stone Barrow only then (otherwise “You can't go that way.”, as the story file says).
- STONE-BARROW: its description; northeast to West of House; the stone door (“The door is too heavy.” to OPEN or CLOSE); the barrow (THROUGH it is west).
- STONE-BARROW-FCN: west, in, ENTER, or THROUGH the barrow prints “Inside the Barrow” and the closing text (the trilogy version, as Release 119 prints it), then ends the game through an `endings` entry with the score and rank, and the engine's RESTART prompt.

## 3. The proof

### The full game, natively

- `tests/worlds/zork1-full.ts`: a 350-point command list in chapters — the house and the troll; the maze, the cyclops and the thief's lair; the dam and the Loud Room; the temple and Hades; the river and the rainbow; the coal mine; the egg and the canary; the trophy case and the barrow.
- One native test plays it from a pinned seed and asserts every treasure in the case, 350 points, the whisper, the readable map, the barrow ending, and the game over.
- Fights are sync points (`@fight <character>`): attack until the foe is beaten; those turns aren't compared.

### The full game against zork1.z3, by chapter

- For chapter *k*, both sides replay chapters 1..*k* and compare only chapter *k*'s replies (`compare`, move counts normalized).
- A seed is rejected if the thief appears where the walkthrough doesn't allow him, or a fight doesn't resolve. Where he's needed (stealing the egg, the fight in his lair), his own lines are compared as line sets.
- A chapter with no agreeing seeds within the try budget falls back to line sets for that stretch: ledgered and named in the final message.
- Seeds are pinned per chapter.

### The thief's timing

- **Frequency:** many seeds per side wait in the same dark rooms, counting turns until the thief first shows; the distributions must agree within a stated tolerance (starting proposal: medians within 25%), tuned and ledgered once measured.
- **Unparked:** the diff walkthrough no longer parks him offstage; like the original, the native side moves to the next seed when he shows.

### Cost

- Long-running tests (the chapters, the frequency test) that take more than a couple of minutes go behind an env flag that CI still sets; the docs say so.

## 4. Docs and release

- **conditions-and-events:** `score<op>N`.
- **porting-zork:** Zork I is complete: every room, all 350 points; SCORE-UPD as a daemon on `score>=350`; FINISH as an `endings` entry; how the full-game proof works and where it falls back. What's next: the npm library plan and Office Space's world upgrades.
- **CHANGELOG** 1.12.0 on both repos. Office Space syncs with no world changes.

## Edge cases the review checks

- The 350 trigger fires once; dying after winning keeps `won`.
- Southwest of the house before winning is “You can't go that way.”; the barrow is reachable no other way.
- After the barrow, only RESTART (and the meta commands the engine already allows) work; a game saved before the ending restores normally.
- `score<op>N` works in both styles; a malformed form (`score>=x`) is caught by the audit.
- Office Space: no visible change (the 5c probe runs again).

## Out of scope

- Backlog items the full game doesn't run into.
- The npm library plan; Office Space's world upgrades (separate tracks).
