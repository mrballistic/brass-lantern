# Engine parity, stage 5c: the coal mine

**Status:** approved in conversation 2026-10-06; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [stage 1](./2026-10-05-engine-parity-stage-1-design.md) (the roadmap and the decisions for the whole effort) through [stage 5b](./2026-10-06-engine-parity-stage-5b-design.md). Picks up no items from [the backlog](../backlog.md): none touch the mine.

## Decisions made while brainstorming

- **The rest of room parity is two slices** (owner's choice): **5c** (this document, 1.11.0) is the coal mine; **5d** (1.12.0) is the mountains, the stone barrow and the endgame, the thief's exact timing, and the full 350-point game played against zork1.z3 (4b's deferred differential coverage).
- **Data first, with the script hatch**, as in 5a and 5b. The mine needs one new generic piece, a condition; everything else is world data and Zork scripts.
- **Every puzzle is checked by seeded scripted sessions against zork1.z3.** Generic Infocom details the sessions expose are fixed in the engine, each with a unit test.

## Invariants (unchanged)

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes and no player-visible change.
- Saves stay format 2.0; new state fields, if any turn up, are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.

## 1. Generic engine piece

### `heaviest<=N`

Zork's narrow passage (NO-OBJS, EMPTY-HANDED) doesn't limit how much you carry; it refuses you if any one thing you hold weighs more than 4, a container counting with its contents (WEIGHT).

- New condition form `heaviest<=N` (with `=`, `<`, `>`, `<=`, `>=`, like `carrying`): the weight of the heaviest thing the player holds directly, each thing's weight including everything inside it. Holding nothing is 0.
- It uses the existing weight helper (the one behind carrying capacity), so an item's `size` means the same thing everywhere.
- Parsed in `conditions.ts`, known to `conditionProblems` (so the audit accepts it), documented in conditions-and-events.

## 2. The Zork content

### Rooms

The 14 mine rooms, in the story file's order and with its texts: Slide Room, Mine Entrance, Squeaky Room, Bat Room, Shaft Room, Smelly Room, Gas Room, Coal Mine (Mines 1–4, the maze), Ladder Top, Ladder Bottom, Dead End, Timber Room, Lower Shaft (Drafty Room), Machine Room. All dark. The Cold Passage's stubbed west exit opens onto the Slide Room. Local globals (the slide, the ladder, the stairs, the chain) as the ZIL lists them.

### The bat (BATS-ROOM, FLY-ME, BAT-F)

- Entering the Bat Room without the garlic held or in the room (and not as a ghost): the room is described, then the bat carries you to one of BAT-DROPS at random (“The bat grabs you by the scruff of your neck and lifts you away....”), and the new room gets its first look.
- TAKE or ATTACK the bat: with the garlic, “You can't reach him; he's on the ceiling.”; without it, it carries you off. Talking to it fweeps.

### The gas room (BOOM-ROOM)

- At the end of any turn in the Gas Room while you hold a lit candle, torch or match, it explodes: the “coal gas” text, or the “aspiring adventurer” text when that turn's command was lighting the flame, then the death. The lamp is safe.
- The end-of-turn check is the room's `onEnd` with a small script that sees the turn's command.

### The narrow passage (NO-OBJS)

- Timber Room west and Lower Shaft east/out are conditional exits on `heaviest<=4`, with the ZIL's refusal text.
- The first turn you spend in the Lower Shaft with a light scores 13 (LIGHT-SHAFT).

### The basket (BASKET-F)

- Two items, the raised and the lowered basket, one at each end of the shaft. RAISE and LOWER (world verbs) swap them; raising when already up (or lowering when down) gives a DUMMY line.
- Lowering the basket you're relying on for light: “It is now pitch black.”
- TAKE either basket: “The cage is securely fastened to the iron chain.” Naming the basket at the other end: “The basket is at the other end of the chain.”
- Things put in the basket travel with it.

### The machine (MACHINE-F, MSWITCH-FUNCTION)

- OPEN and CLOSE the lid with the ZIL's texts (opening lists the contents); the machine can't be taken.
- TURN the switch WITH the screwdriver (5a's TURN … WITH): with the lid open, nothing; closed, the lights-and-noises text, and coal inside becomes the huge diamond, or anything else becomes a lump of gunk. Any other tool: “It seems that a … won't do.” TURN ON the machine with something passes to the switch.

### The slide (SLIDE-FUNCTION, SLIDER)

- CLIMB DOWN (or go down, or into) the slide: “You tumble down the slide....” and you're in the Cellar.
- PUT something IN the slide: it goes to the Cellar, with the ZIL's text.

### Treasures

The jade figurine (Bat Room), the sapphire bracelet (Gas Room) and the huge diamond (from the machine), each with the story file's take and trophy-case values. The coal, the timbers and the gunk as ordinary items.

## 3. Testing

- **Scripted sessions** (seeded, both sides) for: the slide, going down it and sending an item down it; the bat carrying you off, and the garlic stopping it; the gas room exploding with a lit candle, the “aspiring adventurer” variant, and a safe pass with the lamp; the narrow passage refused with the lamp and allowed with light things; the Lower Shaft's 13 points; the basket raised, lowered, “pitch black”, and carrying things down the shaft; the machine making the diamond, making gunk, and doing nothing with the lid open; walking the maze and the ladder; the three treasures. A shared prefix walks from the start of the game into the mine, through the cellar and past the troll (steered by seed).
- **Unit tests** for `heaviest<=N` on the fixture world (including a container whose contents push it over), each generic Infocom fix, and a scoring test for the three treasures and the shaft.
- **Seeds:** the thief's route grows by 14 rooms, so existing session seeds are re-pinned as needed.

## 4. Docs and release

- **conditions-and-events:** `heaviest<=N`.
- **porting-zork:** EMPTY-HANDED and WEIGHT, the bat, BOOM-ROOM's end-of-turn check, the basket, the machine, the slide.
- **CHANGELOG** 1.11.0 on both repos. Office Space syncs with no world changes.

## Edge cases the review checks

- The bat never grabs a ghost; being carried off doesn't leave you aboard anything.
- The gas room's check runs after the command: lighting a candle there kills that turn; extinguishing it on the turn you arrive is too late. The sessions pin this.
- `heaviest<=N`: a container counts with its contents; empty hands pass; a typo in the form is caught by the audit.
- The basket at the other end can't be used or taken; the machine can't be taken; the switch with the lid open does nothing.
- Save, restore and UNDO across the basket swap and the machine's transformation behave like any item move.

## Out of scope

- The mountains, the stone barrow and the endgame, the thief's exact timing, and the full 350-point differential game (5d).
- 5b's deferred minors (all vehicle details; 5d or later).
- Office Space's world upgrades (a separate track).
