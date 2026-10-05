# Porting Zork

Brass Lantern ships Zork I twice: the original story file, run by the Z-machine interpreter, and **ZORK I · NATIVE**, a rebuild as an ordinary Brass Lantern world (`src/worlds/zork1.ts`). The native version is how the engine proves it can carry an Infocom-class game. A test plays both side by side and fails if they disagree.

It covers the house and the forest so far. The underground arrives as the engine gains darkness, timers, actors and combat.

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
- **Random lines** the original prints (the distant songbird) are filtered out until the engine has seeded randomness.

## What's next

- **Darkness and time:** dark rooms, the lamp running down, the grue, death and resurrection.
- **Parser parity:** “Which lamp do you mean?”, AGAIN, OOPS, UNDO.
- **Actors:** the troll, the thief, the cyclops, combat, carrying weight.
- **The rest of the map**, vehicles included.
