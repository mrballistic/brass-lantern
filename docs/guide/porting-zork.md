# Porting Zork

Brass Lantern ships Zork I twice: the original story file, run by the Z-machine interpreter, and **ZORK I · NATIVE**, a rebuild as an ordinary Brass Lantern world (`src/worlds/zork1.ts`). The native version is how the engine proves it can carry an Infocom-class game. A test plays both side by side and fails if they disagree.

It covers the house, the forest, and the first rooms underground: the cellar, the chasm, the gallery and the studio, with darkness, the lamp burning down, the grue, and death; the Troll Room, the East-West Passage and the Round Room, with the troll, combat, the sword's glow and carrying weight; and the maze, the grating, the Cyclops Room and the thief's Treasure Room, with the thief (wandering, stealing, fighting) and the cyclops. The rest of the map arrives in stage 5.

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
| an interrupt (`QUEUE`, `ENABLE`) | a fuse (`schedule`) or a daemon |
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

- **The walkthrough** covers the stage slices: the house and forest, the cellar and the gallery with the lamp lit, the parser (a bare TAKE and its answer, “Which door do you mean?”, AGAIN, OOPS, TAKE ALL and DROP ALL), the troll, the maze, and the cyclops (ULYSSES).
- **Fights are random,** and our dice aren't Zork's, so the walkthrough has **sync points**: walking into the Troll Room, each side retries until the troll doesn't strike first, and at the fight each side attacks until its troll is dead. The original retries by starting its session again, the native port by trying another seed. The thief wanders at random from the first move, so the original starts over whenever he shows up, and the native walkthrough keeps him offstage (his fidelity is tested on its own, below).
- **`tests/worlds/zork1-fight.test.ts`** checks the fight itself: it fights the real troll 300 times, collects everything it prints, and requires every line of 200 native fights to be one the original prints. It found a difference between Zork's source and its story file: the source gives a knocked-out player's foes extra rounds, and Release 119 doesn't. The story file wins.
- **`tests/worlds/zork1-thief.test.ts`** does the same for the thief: 60 original sessions wait in the dark cellar with a treasure until he comes, and every line 100 native runs print must be one the original prints.
- **The room order is read from the story file.** `tests/helpers/zobjects.ts` decodes `zork1.z3`'s object tree, and the native world's rooms must follow it, since the thief walks rooms in that order.
- **Expected differences** go in `tests/worlds/zork1-allowlist.ts`, each with a reason, and the test fails if one stops being different. Two kinds: a misspelled word, where Zork says “I don't know the word” and the native engine says it sees no such thing (and, in the app, asks the intent server; the OOPS that follows it matches); and replies after the fight that depend on how it went (DIAGNOSE, SCORE's move count).
- **Random lines** the original prints (the distant songbird) are filtered out: the engine's generator is seeded and reproducible, but it can't replay Zork's own. Random outcomes (the grue, where things scatter when you die) are pinned by seeded unit tests instead, and the death texts are checked against a real death in the original.

## What's next

- **Stage 5:** the rest of the map, vehicles included, and the thief's exact timing against the original.
- Characters who obey orders or follow the player.
