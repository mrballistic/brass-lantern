# Recipes

Each recipe is a small world in [`src/worlds/examples/`](https://github.com/mrballistic/brass-lantern/tree/main/src/worlds/examples) about one idea. The code is included from those files, and the transcripts are what [`tests/worlds/examples/recipes.test.ts`](https://github.com/mrballistic/brass-lantern/blob/main/tests/worlds/examples/recipes.test.ts) checks.

## Containers and keys

A shelf with a glass jar on it, a key in the jar, and a locked tin the key opens.

<<< ../../../src/worlds/examples/containers.ts#items{ts}

- **A `surface`** (the shelf) shows what's on it, and you can reach it.
- **A `container`** holds things. `openable` gives it a lid; `locked` and `key` lock it; `capacity` limits how many things fit directly inside; `opened` replaces the default “Opened.”.
- **`transparent`** lets the player see inside while it's closed, but not reach in: TAKE KEY says which container is in the way.
- **`contains`** says what starts inside or on it.

```
> take key
The glass jar is closed.
> open jar
Opened.
> take key from jar
Taken: tin key.
> unlock tin with key
Unlocked.
> open tin
The lid pops off with a sigh of cinnamon.
> take cookie
Taken: cookie.
> put key in tin
Done.
```

Doors between rooms are the same block on an item with `door: true`; the [two-room game](./two-rooms) has one.

## Darkness and death

A shed with a lamp, and a dark cellar below it.

<<< ../../../src/worlds/examples/darkness.ts#cellar{ts}

<<< ../../../src/worlds/examples/darkness.ts#lamp{ts}

<<< ../../../src/worlds/examples/darkness.ts#darkness{ts}

- **`dark: true`** makes a room need light. A **`light`** item gives it while it's on (it has to be **`switchable`** to turn on), whether it's carried, on the floor, or inside something open.
- **In the dark** the player can only find what they're carrying. Anything else gets `tooDark` (“It’s too dark to see.”), and no time passes.
- **`blunder`** runs when the player tries a direction with no exit in the dark. Zork's grue is a [`chance`](../../reference/conditions-and-events#effects) of death; this one always bites.
- **`death`** says what dying does. With `lives: 1` the player gets one resurrection in `respawn`; the next death plays `final` and ends the game. Without a `death` block, dying ends the game at once.

```
> down
📍 Darkness
It is pitch black. Something breathes nearby.
> take jam
It’s too dark to see.
> east
You stumble into something with far too many teeth.
    ****  You have died  ****
You wake on the shed floor with a headache and a new respect for the dark.
📍 Shed
A garden shed. A hatch in the floor leads down.
You can see: oil lamp.
Exits: down.
> take lamp
Taken: oil lamp.
> turn on lamp
The oil lamp is now on.
> down
📍 Cellar
Damp stone walls. Steps lead up.
You can see: jar of jam.
Exits: up.
```

A lamp that runs out is a variable and a few daemons: see [Time](../../reference/world-schema#time).

## Timers

A kettle that boils three turns after you turn it on, a clock, and a dripping tap.

<<< ../../../src/worlds/examples/timers.ts#kettle{ts}

<<< ../../../src/worlds/examples/timers.ts#clock{ts}

- **A fuse** is the `schedule` effect: run an event after so many turns. `cancel` stops it. Here **`after`** rules start and stop it: they run once TURN ON or TURN OFF has worked.
- **A daemon** runs after every turn while its `if` holds. Two daemons make a clock: one counts minutes in a **variable**, the other chimes when it reaches 5.
- **`ambient`** lines interrupt every few turns while their condition holds.
- **A turn** is a command the engine acted on. Misunderstood commands, questions, and VERBOSE or UNDO take no time.

```
> turn on kettle
The kettle is now on.
> wait
Time passes.
The tap drips.
> wait
Time passes.
> wait
Time passes.
The kettle shrieks. Tea time.
> wait
Time passes.
The clock chimes the hour.
```

## Endings and verbs of your own

A garden with something buried in it, and a chapel. Digging and praying aren't built in, so the world declares them.

<<< ../../../src/worlds/examples/endings.ts#verbs{ts}

<<< ../../../src/worlds/examples/endings.ts#endings{ts}

- **A world verb** does nothing by itself. Rules give it meaning: the flowerbed has an `instead.dig` rule, and so does the garden, for DIG with no object. The chapel has `instead.pray`. Anywhere else, the verb's `reply` answers.
- **`end`** plays an ending: its lines, the score (with `score: true`), then the footer.
- **The score** here comes from the `score` effect, out of `maxScore`. Worlds can also award points for flags with [`scoring`](../../reference/world-schema#world).

```
> dig
The soil is packed hard. You need a spade.
> take spade
Taken: spade.
> dig in flowerbed
You dig. Your spade rings on a strongbox full of coins.
✨ You are rich, and the garden is a mess.
[Score: 50 of 50, in 2 moves.]
Type RESTART to try another ending.
```

Restart, go east and PRAY for the other ending.
