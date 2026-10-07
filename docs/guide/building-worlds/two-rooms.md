# A two-room game

This page builds the smallest complete game, [`src/worlds/examples/two-rooms.ts`](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/src/worlds/examples/two-rooms.ts), from nothing. You're home after a long time away; the door is locked, and you left the key somewhere obvious. [A test](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/tests/worlds/examples/two-rooms.test.ts) plays it to the end, and the code below is that file.

## Two rooms

<<< ../../../packages/engine/src/worlds/examples/two-rooms.ts#rooms{ts}

- **`startRoom`** is where a new game begins.
- **`exits`** map what the player types to where it goes. A plain string (`north: 'hall'`) is enough for an open way through; here each exit is an object naming a **`door`**, an item that has to be open before anyone passes. Several labels for the same way (`north`, `in`) are normal.
- **`listExits`** is what the exit line shows. Without it, every label is listed.
- **`scenery`** lists items that are present without being *in* the room: the door belongs to both rooms, so both name it, and it's never listed or taken.
- **`items`**, **`npcs`** and **`onEnter`** are required even when empty.

## Things

<<< ../../../packages/engine/src/worlds/examples/two-rooms.ts#items{ts}

- **Every item has a `name`** (shown to players), a **`description`** (EXAMINE), and says whether it's **`portable`**. **`aliases`** are other words for it.
- **The door** is an item with `door: true` and a `container` block: it can be opened, it starts locked, and the `key` item unlocks it. UNLOCK DOOR WITH KEY and OPEN DOOR work with no rules at all.
- **The mat hides the key.** An **`instead`** rule replaces what a verb normally does. EXAMINE MAT runs the `find_key` event the first time; once `found_key` is set the rule's `if` fails and EXAMINE prints the description as usual.
- **The key starts nowhere.** It isn't in any room's `items`, so it's offstage until an event moves it.
- **The side table is a `surface`**: what's on it is always visible and in reach. `contains` puts the letter there at the start.
- **The letter ends the game** with an `instead` rule on READ.

## What happens

<<< ../../../packages/engine/src/worlds/examples/two-rooms.ts#events{ts}

- **`events`** are named lists of steps. A string prints; an object is an [effect](../../reference/conditions-and-events#events-and-effects). `find_key` prints a line, sets a flag and moves the key onto the porch.
- **`intro`** plays when a new game starts.
- **`end`** plays one of the world's **`endings`**: its lines, then the footer, and the game is over.
- **`npcs`, `dialogue` and `flagLabels`** are required. This game has no people, and its flags are set by effects rather than [bracket lines](../../reference/conditions-and-events#bracket-lines-the-older-form), so they're empty.

## Playing it

This is the transcript the test checks, word for word:

```
You’re back at the old house at last. You’re sure you left the key somewhere obvious.
📍 Front Porch
A creaky porch in front of an old house. A doormat lies at your feet.
Exits: north.
> north
The front door is closed.
> examine mat
You lift a corner of the mat. Underneath: a brass key.
> take key
Taken: brass key.
> unlock door with key
Unlocked.
> open door
Opened.
> north
📍 Hall
A dusty hall that smells of old books. The front door is south.
Sitting on the side table is:
  A letter
Exits: south.
> take letter
Taken: letter.
> read letter
“Dear me,” it begins. “If you’re reading this, you remembered the mat. Welcome home.”
✨ You’re home.
Type RESTART to play again.
```

Players won't type exactly this. “Look under the mat” or “use the key on the door” aren't commands the engine can act on by itself, so with the [intent server](../intent-server) running they can be mapped onto EXAMINE MAT and UNLOCK DOOR WITH KEY. Without it, the player gets a nudge to rephrase.

## Where next

- Give the game a person to talk to, hints and a score: [Snack Attack](../your-first-world) shows all three.
- Make the hall dark until you find a lamp: [darkness](./recipes#darkness-and-death).
- Every field, with its default: the [world schema](../../reference/world-schema).
