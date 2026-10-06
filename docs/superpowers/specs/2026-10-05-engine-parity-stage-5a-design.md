# Engine parity, stage 5a: the dam, the Loud Room, the temple and Hades

**Status:** approved in conversation 2026-10-05; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [stage 1](./2026-10-05-engine-parity-stage-1-design.md) (the roadmap and the decisions for the whole effort) through [stage 4b](./2026-10-05-engine-parity-stage-4b-design.md). Picks up items from [the backlog](../backlog.md).

## Decisions made while brainstorming

- **Stage 5 is three slices, by region.** 5a: the underground east and south of the Round Room (this document). 5b: the river and the boat (vehicles), the falls, the rainbow and the canyon. 5c: the coal mine, the endgame (350 points, the barrow), the thief's exact timing, and the differential coverage 4b deferred. Each ships as its own release.
- **Every 5a puzzle is checked against zork1.z3 by a scripted session**, not only by the walkthrough: each puzzle chain, and its wrong orders and side branches, runs in both versions and is compared line by line. This closes the gap the 4b review found (lines checked only against the ZIL text).
- **The original is seeded too.** ifvms's generator is a 32-bit xorshift when `xorshift_seed` is non-zero (`node_modules/ifvms/src/zvm/runtime.js`, `random`); a test-only helper sets it. Sessions pin a seed on each side, so they are reproducible and need no restart loops.
- **Zork's parser takeovers are generic engine features.** The Loud Room's raw-input loop and ghost mode are built on a new line-capture hook, not approximated.

## Invariants (unchanged)

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.

## 1. Generic engine pieces

### With-objects for built-in verbs, and BURN

Today the `light` pattern swallows “candles with match” as the target, and `turn bolt with wrench` doesn't parse. Following Zork's syntax table (`gsyntax.zil`):

- **BURN *X* WITH *Y*** (also LIGHT *X* WITH *Y*, BURN DOWN, IGNITE) is a new built-in verb, wired in the usual four places. Its default is Zork's V-BURN: with no *Y*, it asks what with; a *Y* that isn't burning says “With a *Y*??!?”; otherwise a burnable item burns (items gain `burnable` and `flaming`), and anything else gets Zork's refusal. Rules (`instead.burn`) answer first, so the candles and the book are data.
- **TURN ON *X* WITH *Y*** is TURN ON; the tool is ignored, as in Zork (V-LAMP-ON).
- **TURN *X* WITH *Y*** and **PLUG *X* WITH *Y*** carry `indirect`; with no rule they say “This has no effect.” (V-TURN, V-PLUG).
- `withRules` already resolves `indirect`; the intent server's prompt and `ACTION_VOCAB` learn `burn` and that these verbs can carry `indirect`.

### Line capture

```ts
capture?: { if?: string; script: string }   // on a Room, and on the World
```

After a line is split into commands and before each piece is parsed, the engine asks the player's room's capture, then the world's, whose `if` holds. The script gets the raw line as `ctx.line` and returns steps, or nothing to decline. A capture's result may set `free: true` (no move, no daemons), with the step `{ free: true }`.

- One engine entry point, `captureLine(world, state, line)`, returns a result or `null`. The store, `tests/helpers/play.ts` and the diff test call it first; on `null` the normal regex → engine → LLM flow runs.
- It runs ahead of the LLM, so captured input is never sent to it, as Zork's raw loop never parsed it.
- A capture that takes a piece ends the line: the rest of a compound line is dropped (Zork's Loud Room drops it). Capture runs per piece so ghost mode can refuse `take lamp` in `north. take lamp` while letting `north` through; scripts get `ctx.parse(text)` to read a piece with the world's verbs.
- UNDO, SAVE, RESTORE, RESTART and the other store commands are checked before capture, so a capture can't trap the player.

### Quiet moves

`{ go: 'room', quiet: true }` moves the player without describing the room (the mirror's GOTO).

### Unvisiting

`{ unvisit: 'room' }` clears the room from `visited`, so the next arrival shows the full description (Zork clears TOUCHBIT when the dam changes the water, and in the Loud Room).

### Conditional steps

`{ if: 'condition', then: [...], else: [...] }`: the same shape as `chance`, decided by a condition string through `conditions.ts`. `else` is optional.

### Death variants and always-lit (for ghost mode)

`death.then` runs after the resurrection text, so it can't change it. The death block gains:
- `message` entries may be `{ if, text }` (Zork's “Bad luck, huh?” when your luck is gone);
- `variants: [{ if, resurrection?, respawn?, then? }]`: the first that holds replaces those fields (a death after visiting the Altar sends you to Hades with Zork's text);
- `instead: [{ if, lines }]`: checked first; prints its lines and ends the game (dying while already dead).

`darkness.litIf` (a condition): every room is lit while it holds (Zork's ALWAYS-LIT for spirits).

### Seeding the original (tests only)

`tests/helpers/zseed.ts` sets `xorshift_seed` on a `ZMachineSession`'s VM before the first input. Nothing ships in the app.

### Backlog items picked up

- **The thief taking the last light** prints his line and then the engine's “It is now pitch black.” The torch is the first light he can steal, so 5a fixes it: a step that already reported the darkness suppresses the engine's line (`{ noDarkLine: true }`).
- **The intent context** sends `room.npcs` as authored; it sends `npcsSeen` instead, so hidden and departed characters don't reach the LLM.

## 2. The Zork content

All text from the ZIL source, checked against the story file by the sessions in section 3. Rooms join `zork1.ts` in story-file order.

### The dam

- **Rooms:** the Dam, the Dam Lobby (matches, guidebook), the Maintenance Room, the Dam Base.
- **The control panel:** the yellow and brown buttons set and clear the gate flag; the green bubble glows while it's set; TURN BOLT WITH WRENCH opens or closes the gates only then, and starts the reservoir draining or filling (fuses, 8 turns in Zork's count). The dam's description has Zork's eight variants (four water states, bubble on or off).
- **The Maintenance Room:** the blue button starts the leak, a level variable rising each turn with Zork's drowning lines; at the top the room floods (you die if inside; it can't be entered after). PUT PUTTY ON LEAK (and PLUG LEAK WITH PUTTY) fixes it; SQUEEZE TUBE gives the putty. The red button switches the room's light (a hidden switchable light item); the tool chests crumble.

### The reservoir

- **Rooms:** Reservoir South and North, and the Reservoir, walkable only at low tide (Zork's “You would drown.” otherwise).
- **Draining** reveals the trunk of jewels; refilling kills a player still in the Reservoir, with Zork's warnings as it rises.
- **Water:** FILL BOTTLE and POUR work where Zork has water (the reservoir shores, Stream View, the Dam, the Dam Base).
- **The Stream and Stream View** exits that need a boat refuse in Zork's words until 5b.

### The Loud Room and its passages

- **Rooms:** the Chasm, the North-South Passage, the Loud Room, the Deep Canyon, the Damp Cave.
- **The Loud Room's capture**, while it's loud: west, east and up leave; ECHO quiets it for good and frees the platinum bar for the thief; anything else echoes back as Zork does. None of it takes a move.
- **Thrown out:** with the gates open at high tide (and when the reservoir refills while you're there), the room throws you to one of three rooms by Zork's PICK-ONE, which doesn't repeat until all have been used; ported in the script.

### The mirrors, the temple and the dome

- **The two Mirror Rooms:** RUB MIRROR swaps everything in the two rooms (characters too) and moves you quietly with Zork's rumble; rubbing it with something else only tingles; breaking it costs your luck (a flag).
- **The caves and passages:** the Cold, Twisting, Winding and Narrow Passages, the two caves. In the tiny cave each turn with lit candles held may blow them out: 50% when lucky, Zork's ZPROB odds when not.
- **Atlantis** (the crystal trident) and the **Engravings Cave**.
- **The Dome:** TIE ROPE TO RAILING, UNTIE, CLIMB DOWN ROPE, dropping the untied rope sends it below; jumping kills with Zork's random line.
- **The Torch Room** (the ivory torch, always lit; water never reaches it).
- **The Temple** (bell, candles) and the **Altar** (the black book, PRAY, and down refused while carrying the coffin); the **Egyptian Room** (the gold coffin, with the sceptre inside).

### Hades

- **Rooms:** the Entrance to Hades, the Land of the Dead (the crystal skull).
- **The exorcism**, by Zork's timers: RING BELL makes it a hot bell on the floor and drops held candles, unlit; lighting the candles with a match within its window, then READ BOOK within the next, drives the spirits off and opens the way. The wrong orders, the tension breaking, the hot bell (it burns what touches it; POUR WATER cools it; otherwise it cools in 20 turns) and the deaths (burning the book) are Zork's.
- **Candles** burn 40, 20, 10, then 5 turns while lit, with Zork's lines; burnt out they can't be relit. **Matches** give five lights of two turns each; COUNT says how many are left.
- **Ghost mode:** a death after the Altar has been visited sends you to Hades as a spirit (a death variant). A world capture refuses most verbs in Zork's words, everything is lit, the Dome pulls you down, and PRAY at the Altar brings you back. When your luck is gone Zork adds “Bad luck, huh?” after the cause.

### Scoring and the thief

- **Treasures** (VALUE on finding / TVALUE in the case): platinum bar 10/5, trunk of jewels 15/5, crystal trident 4/11, crystal skull 10/10, gold coffin 10/15, sceptre 4/6, ivory torch 14/6.
- **The thief** walks the new rooms in story order. The Temple and the Altar get the `sacred` tag; the bar is sacred until the echo.

## 3. Testing

- **Scripted sessions** (`tests/worlds/zork1-sessions.test.ts`): each is a command list run in both versions and compared with the walkthrough's normalizing and allowlist rules.
  - The dam and the draining; the maintenance leak, fixed and flooded; the Loud Room (echo, echoed words, being thrown out); the mirror; the rope and the dome death; the exorcism (the right order, two wrong orders, the tension breaking, the hot bell); candles and matches running out; the coffin and PRAY; ghost mode.
  - Each starts from a shared prefix from West of House to the Round Room. Each side pins its own seed (found by search, then fixed in the test) where the thief stays away and any random branch the session needs happens. If the interpreter can snapshot after the prefix, the prefix runs once; otherwise it replays.
- **The walkthrough** goes on to collect the seven treasures, put them in the case, and compare SCORE.
- **Unit tests** for each engine piece on the fixture world; the rooms test keeps checking story order.

## 4. Docs and release

- **world-schema:** `capture`, `ctx.line`, with-objects, `{ go, quiet }`, `unvisit`, `{ if, then, else }`, `{ free }`. **conditions-and-events:** the new effects. **commands:** BURN (LIGHT … WITH), TURN … WITH, PLUG … WITH.
- **Building worlds:** a recipe for a room that listens (capture), as a world file played by a test.
- **porting-zork:** raw-input loops (the Loud Room) → capture; TOUCHBIT → `unvisit`; PICK-ONE; ZPROB and LUCKY; ghost mode; the seeded original.
- **CHANGELOG** 1.9.0. Office Space syncs with no world changes.
- **The backlog** marks the items this stage ships.

## Out of scope

- The river, the boat and vehicles, the falls, the rainbow, the canyon (5b).
- The coal mine, the bat, the gas room, the endgame and the barrow, the thief's exact timing, and 4b's deferred differential coverage (5c).
- Backlog items not listed above.
