# Porting Zork

Brass Lantern ships Zork I twice: the original story file, run by the Z-machine interpreter, and **ZORK I · NATIVE**, a rebuild as an ordinary Brass Lantern world (`src/worlds/zork1.ts`). The native version is how the engine proves it can carry an Infocom-class game. A test plays both side by side and fails if they disagree.

It covers the house, the forest, and the first rooms underground: the cellar, the chasm, the gallery and the studio, with darkness, the lamp burning down, the grue, and death; the Troll Room, the East-West Passage and the Round Room, with the troll, combat, the sword's glow and carrying weight; and the maze, the grating, the Cyclops Room and the thief's Treasure Room, with the thief (wandering, stealing, fighting) and the cyclops; and, from stage 5a, the underground east and south of the Round Room: the dam and the reservoir, the Loud Room, the mirrors, Atlantis, the dome, the temple and Hades, with the exorcism and ghost mode; and, from stage 5b, the magic boat on the Frigid River, the White Cliffs, Sandy Beach and its scarab, Aragain Falls, the rainbow and the canyon; and, from stage 5c, the coal mine: the slide, the bat, the gas room, the mine's maze and ladder, the narrow passage, the basket on its chain and the machine that turns coal into a diamond. and, from stage 5d, the mountains, the Stone Barrow, and winning: **Zork I is complete**, every room and all 350 points.

## How ZIL maps to a world

Zork was written in ZIL, Infocom's language. Its source is MIT licensed ([historicalsource/zork1](https://github.com/historicalsource/zork1)), and most of it translates directly:

| ZIL | Brass Lantern |
|---|---|
| `<ROOM …>` with `LDESC` | a room with `description` |
| `<ROOM …>` with an `M-LOOK` routine | `descriptions: [{ if, text }]`, the first that holds |
| `(NORTH TO X)` | `exits: { north: 'x' }` |
| `(EAST "The door is boarded…")` | `exits: { east: { denial: '…' } }` |
| `(WEST TO KITCHEN IF KITCHEN-WINDOW IS OPEN)` | `exits: { west: { to: 'kitchen', door: 'kitchen_window' } }` |
| `<OBJECT …>` | an item |
| `CONTBIT`, `OPENBIT`, `TRANSBIT` | `container: { openable, open, transparent }` |
| `SURFACEBIT` | `surface: true` |
| `NDESCBIT` | `scenery: true` |
| `LOCAL-GLOBALS` and a room's `GLOBAL` list | `room.scenery: [...]` |
| `FDESC` / `LDESC` on an object | `initialDescription` / `roomDescription` |
| `TEXT` | `text` (READ) |
| `LIGHTBIT` | `switchable: true, light: true` |
| an object's `ACTION` routine | `instead` and `after` rules |
| a room's `VALUE` | an `onEnter` event that sets a scored flag |
| a verb only some objects understand (MOVE, COUNT) | a [world verb](../reference/world-schema#world-verbs) |
| a room without `ONBIT` | `dark: true` |
| `LIT?` | the engine's light check (a `light` item switched on, in sight) |
| an interrupt (`QUEUE`, `ENABLE`) | a fuse (`schedule`) or a daemon. Zork's clock counts a `QUEUE X n` from a command down that same turn and the engine's from the next, so it becomes `in: n-1`; an interrupt requeuing itself stays `in: n` |
| `I-LANTERN` and `LAMP-TABLE` | a `lamp_fuel` variable and daemons that warn at its thresholds |
| `JIGS-UP` | the `die` effect and `world.death` |
| `PROB` | the `chance` effect |
| a room's `M-ENTER` | `onEnter`, which Infocom style runs before the description |
| a `PER` exit routine with several refusals (the chimney) | an exit's `denials` |
| the parser's ORPHAN and WHICH-PRINT (“Which door do you mean, the wooden door or the trap door?”) | built in: a question, answered by the next line |
| the parser's OOPS and AGAIN | built in |
| an object with no `TEXT` (EXAMINE lists a container's contents) | `description: ''` |
| `ACTORBIT` objects | characters (`npcs`), with places, things they hold (`holds`) and descriptions by state |
| `VILLAINS`, `HERO-BLOW`, `VILLAIN-BLOW`, the melee tables | a character's `combat` block and `world.combat` (the tables are the engine's) |
| a villain's ACTION modes (`F-DEAD`, `F-UNCONSCIOUS`, `F-CONSCIOUS`, `F-BUSY?`, `F-FIRST?`) | `onDeath`, `onUnconscious`, `onWake`, `onBusy`, `firstStrike` |
| `SIZE`, `CAPACITY`, `LOAD-ALLOWED`, `FUMBLE-NUMBER` | `size`, `container.weight`, `carry` |
| `V-DIAGNOSE`, `I-CURE` | DIAGNOSE and healing, built in |
| an `ACTION` routine data can't express (`I-SWORD`, the troll catching what you throw) | a [script](../reference/world-schema#scripts) |
| a `PER` exit routine with a side effect (`UP-CHIMNEY-FUNCTION`) | an exit's `then` event |
| the parser's GWIM for ATTACK (“(with the sword)”) | built in, Infocom style |
| `TVALUE` (points while a treasure is in the case) | a score entry with a condition: `{ if: 'inside:painting:trophy_case', points: 6 }` |
| `TVALUE` as the thief reads it (what's worth stealing) | `treasure: 6` on the item, read by `ctx.treasure` |
| `INVISIBLE` on a character (the thief, lurking) | `hidden: true`, or `{ npcState, hidden }` to change it |
| `INVISIBLE` on an object (the stiletto until the thief dies) | the `hide` and `reveal` effects |
| `SACREDBIT`, `MAZEBIT` | room `tags: ['sacred']`, `tags: ['maze']`, read by `ctx.tags` |
| `I-THIEF` and `ROBBER-FUNCTION` | a daemon running a script (`thief_turn`), with combat hooks and rules on the thief |
| the cyclops's daemon and `CYCLOWRATH` | a daemon script and a variable |
| `ASK`/`TELL … ABOUT` and orders (“thief, give me the bag”) | `topics`, `refuseOrder` and `instead.order` on a character |
| an object `ACTION` that prints and returns false, so the verb goes on | an `instead` rule with `continue: true` |
| `JIGS-UP` resetting things (the trap door) | `death.then` |
| a raw-input loop in a room's M-ENTER (the Loud Room) | a room's `capture`, with `{ free: true }` replies |
| a room's M-END | the room's `onEnd` |
| V-WAIT's three turns of the clock | `world.wait: { turns: 3 }` |
| `FCLEAR … TOUCHBIT` on a room | `{ unvisit: 'room' }` |
| `FSET … NDESCBIT` in play (the tied rope) | `{ unlist }` and `{ relist }` |
| `GOTO room <>` (no description: the mirror) | `{ go: 'room', quiet: true }` |
| `PICK-ONE` (no repeats until all are used) | a script: `pickOne` in `src/worlds/zork1.ts` |
| `PROB n m` (ZPROB: worse odds once LUCKY is false) | a script checking the `unlucky` flag |
| PRSI's routine before PRSO's | the rule order in Infocom style |
| `SACREDBIT` on an object (the platinum bar) | the item tag `sacred`, which the thief script respects |
| JIGS-UP's branches: Hades once you've seen the Altar, dying while dead, "Bad luck, huh?" | `death.variants`, `death.instead`, a conditional `death.message` line |
| `ALWAYS-LIT` for a spirit | `darkness.litIf` |
| DEAD-FUNCTION | a world `capture` while `flag:dead` |
| BURN (LIGHT … WITH) and FLAMEBIT/BURNBIT | the BURN verb, `flaming` and `burnable` |
| VEHBIT and VTYPE (the magic boat) | an item's `vehicle: { travels: 'water' }`, BOARD and DISEMBARK |
| NONLANDBIT on a room (the river, the reservoir at high tide) | the room's `water` (a condition for the reservoir) |
| a vehicle's M-BEG and M-END | its rules (asked before the room's) and its `onEnd`; Zork's RBOAT M-BEG is in the world capture |
| I-RIVER, RIVER-SPEEDS, RIVER-LAUNCH | a self-requeuing fuse and LAUNCH's table, in scripts |
| GOTO's grue from one dark room into another | `darkness.stumble` |
| PRINT-CONT's “(outside the magic boat)” and first-seen-first order | built in, Infocom style |
| EMPTY-HANDED and WEIGHT (the narrow passage: nothing heavier than 4) | an exit's `if: 'heaviest<=4'` |
| a room's M-ENTER that acts before you look (the bat's FLY-ME) | `onEnter` with `{ look: true }` first, then a script that picks a room |
| a room's M-END that checks the turn's command (BOOM-ROOM) | the room's `onEnd` running a script that reads `ctx.command` |
| two objects standing for one thing at two places (the basket on its chain) | two items swapped by the RAISE and LOWER rules; things inside travel with the real one |
| NO-OBJS' LIGHT-SHAFT score on the first lit turn | the room's `onEnd` setting a flag that `scoring` counts |
| HACK-HACK's random endings (V-WAVE, V-RAISE) | a world verb's fixed `reply`, naming its object with `{target}` |
| SCORE-UPD's win at 350 (the whisper, the map, the secret path) | a daemon on `score>=350 & !flag:won` |
| FINISH (the score, then RESTART/RESTORE/QUIT) | an `endings` entry with `score: true` and a footer |
| GOTO's “You have moved into a dark place.” | `darkness.arrive` |
| TOUCHBIT set by OPEN, ROB and the like | built in for OPEN (Infocom style); the `{ touch }` step elsewhere |
| the parser's GWIM for a missing tool (“(with the shovel)”) | a script picking the one TOOLBIT thing held |
| MOVE putting things first in a room (newest-first listings) | built in for things; a character who arrived this turn is listed first |

`style: 'infocom'` makes the engine follow Zork's conventions:
- “There is a sword here.”;
- brief descriptions of rooms you've seen;
- newest-first listings;
- Zork's SCORE line and status line (“West of House  Score: 0  Moves: 0”);
- Zork's questions (“What do you want to take?”) and TAKE ALL (“lamp: Taken.”, including what can't be taken, and why).

## The differential test

`tests/worlds/zork1-diff.test.ts` runs a walkthrough through both versions and compares every reply, ignoring case, spacing and quote style. A mismatch prints both sides:

```
> open sack
  native:   Opening the brown sack reveals a lunch, and a clove of garlic.
  original: Opening the brown sack reveals a clove of garlic, and a lunch.
```

- **The walkthrough** covers the early slices: the house and forest, the cellar and the gallery with the lamp lit, the parser (a bare TAKE and its answer, “Which door do you mean?”, AGAIN, OOPS, TAKE ALL and DROP ALL), the troll, the maze, and the cyclops (ULYSSES).
- **Scripted sessions** (`tests/worlds/zork1-sessions.test.ts`) check every puzzle from stage 5a on: each is a short command list played from the Round Room in both versions and compared reply by reply, its wrong orders and side branches included (the dam, the leak, the Loud Room, the mirrors, the rope, the exorcism, the candles, ghost mode). **Both sides are seeded**: a test-only option seeds the interpreter's own generator (`new ZMachineSession(…, { seed })`), so each session plays the same way every time, with a seed pinned per side where the thief stays away.
- **Fights are random,** and our dice aren't Zork's, so the walkthrough has **sync points**: walking into the Troll Room, each side retries until the troll doesn't strike first, and at the fight each side attacks until its troll is dead. The original retries by starting its session again, the native port by trying another seed. The thief wanders at random from the first move, so either side starts over on the next seed whenever he shows up.
- **`tests/worlds/zork1-fight.test.ts`** checks the fight itself: it fights the real troll 300 times, collects everything it prints, and requires every line of 200 native fights to be one the original prints. It found a difference between Zork's source and its story file: the source gives a knocked-out player's foes extra rounds, and Release 119 doesn't. The story file wins.
- **`tests/worlds/zork1-thief.test.ts`** does the same for the thief: 60 original sessions wait in the dark cellar with a treasure until he comes, and every line 100 native runs print must be one the original prints.
- **The whole game** (`tests/worlds/zork1-full.ts`, adapted from the walkthrough Microsoft's Jericho project ships for Zork I) runs natively from the first move to the barrow on a pinned seed, and must end with every treasure in the case, 350 points, the whisper, the map's text and the closing text. **`tests/worlds/zork1-chapters.test.ts`** compares it with the original in nine chapters: for chapter *k* both sides replay chapters 1 to *k* and compare chapter *k* reply by reply, fights being sync points (`@fight <foe> with <weapon>`). Each chapter has a seed pair on which the two sides agree; none falls back to line sets.
- **`tests/worlds/zork1-thief-timing.test.ts`** measures the thief: 40 seeds a side wait in the Round Room until he first shows, and the medians must agree within 25% (measured: 17 turns each).
- **The room order is read from the story file.** `tests/helpers/zobjects.ts` decodes `zork1.z3`'s object tree, and the native world's rooms must follow it, since the thief walks rooms in that order.
- **Expected differences** go in `tests/worlds/zork1-allowlist.ts`, each with a reason, and the test fails if one stops being different. Two kinds: a misspelled word, where Zork says “I don't know the word” and the native engine says it sees no such thing (and, in the app, asks the intent server; the OOPS that follows it matches); and replies after the fight that depend on how it went (DIAGNOSE, SCORE's move count).
- **Random lines** the original prints (the distant songbird) are filtered out: the engine's generator is seeded and reproducible, but it can't replay Zork's own. Random outcomes (the grue, where things scatter when you die) are pinned by seeded unit tests instead, and the death texts are checked against a real death in the original.

## What's next

- **Zork II and Zork III:** a survey of what each would need that the engine doesn't have yet (the balloon, the robot, the wizard's spells, the Royal Puzzle, time travel).
- The npm library.
- Characters who obey orders or follow the player.
