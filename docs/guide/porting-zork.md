# Porting Zork

Brass Lantern ships Zork I twice: the original story file, run by the Z-machine interpreter, and **ZORK I · NATIVE**, a rebuild as an ordinary Brass Lantern world (`src/worlds/zork1.ts`). The native version is how the engine proves it can carry an Infocom-class game. A test plays both side by side and fails if they disagree.

It covers the house, the forest, and the first rooms underground: the cellar, the chasm, the gallery and the studio, with darkness, the lamp burning down, the grue, and death. The rest arrives as the engine gains a fuller parser, actors and combat.

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
| `TVALUE` (points while a treasure is in the case) | a score entry with a condition: `{ if: 'inside:painting:trophy_case', points: 6 }` |

`style: 'infocom'` makes the engine follow Zork's conventions:
- “There is a sword here.”;
- brief descriptions of rooms you've seen;
- newest-first listings;
- Zork's SCORE line.

## The differential test

`tests/worlds/zork1-diff.test.ts` runs a walkthrough through both versions and compares every reply, ignoring case, spacing and quote style. A mismatch prints both sides:

```
> open sack
  native:   Opening the brown sack reveals a lunch, and a clove of garlic.
  original: Opening the brown sack reveals a clove of garlic, and a lunch.
```

- **Expected differences** go in `tests/worlds/zork1-allowlist.ts`, each with a reason, and the test fails if one stops being different. The list is empty today.
- **Random lines** the original prints (the distant songbird) are filtered out: the engine's generator is seeded and reproducible, but it can't replay Zork's own. Random outcomes (the grue, where things scatter when you die) are pinned by seeded unit tests instead, and the death texts are checked against a real death in the original.

## What's next

- **Parser parity:** “Which lamp do you mean?”, AGAIN, OOPS, UNDO.
- **Actors:** the troll, the thief, the cyclops, combat, carrying weight.
- **The rest of the map**, vehicles included.
