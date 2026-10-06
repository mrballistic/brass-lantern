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
- **`blunder`** runs when the player tries a direction with no exit in the dark. Zork's grue is a [`chance`](../../reference/conditions-and-events#events-and-effects) of death; this one always bites.
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

## A guard to fight

An armory with a sword and an anvil too heavy to lift, and a guard who won't let you through.

<<< ../../../src/worlds/examples/guard.ts#items{ts}

<<< ../../../src/worlds/examples/guard.ts#guard{ts}

<<< ../../../src/worlds/examples/guard.ts#gate{ts}

- **`carry`** turns on weight. Each item weighs its `size` (5 if unset) plus what's inside it, and TAKE refuses what would go over `limit`.
- **`combat`** on a character makes it someone you can fight with a `weapon`. The engine runs the fight: your strength against theirs, a seeded roll, and Zork's tables of results. The guard's `messages` are its blows at you; `world.combat` holds yours (short defaults here).
- **`holds`** gives the guard his club. While he has it he fights back; knock it away and `onBusy` runs instead of a swing.
- **`awake:guard`** in the exit's `denials` keeps the way shut until he's dead or out cold.
- **`seed`** fixes the world's random generator, so this transcript plays the same way every time. Leave it out and every game differs.
- **DIAGNOSE** says how hurt you are; wounds heal with time.

```
> take anvil
[That’s too heavy to carry with everything else.]
> take sword
Taken: sword.
> north
📍 Gatehouse
A stone arch. Beyond it, daylight. The armory is south.
Present: guard.
Exits: south, north.
> north
The guard steps in front of you.
The guard shoves you back.
> attack guard with sword
You’re still reeling from that last blow.
The guard’s club whistles past your head.
> attack guard with sword
You wound the guard.
The club catches your shoulder.
> attack guard with sword
The guard drops their weapon.
The guard gropes for his club.
> attack guard with sword
The guard can’t defend themselves.
The guard is dead.
> diagnose
[You have a light wound, which will be cured after 28 moves.]
[You can be killed by one more light wound.]
> north
📍 Courtyard
Sunlight, at last.
✨ You walk out into the sun.
You’re free.
```

In Infocom style the same fight uses Zork's words, and `kill guard` picks the one weapon you're holding. Native Zork I's troll is this recipe with Zork's own numbers and messages.

## Scripts

A fortune teller who tells you one of three fortunes, then sticks to it.

<<< ../../../src/worlds/examples/fortune.ts#script{ts}

- **A script** is a function in `scripts` that returns ordinary steps: lines and effects. Events call it with `{ script: 'name' }`.
- **It reads the game, it doesn't change it.** `ctx.state` is read-only; to change things, return effects (`setVar` here). That keeps the engine's guarantees: a command it didn't understand changes nothing, and saves replay exactly.
- **`ctx.roll(3)`** is 1 to 3 from the game's seeded generator, never `Math.random()`.
- **A rule on a character** (`instead.consult` on Madame Zora) answers a world verb aimed at her.

```
> consult madame
“You will find what you lost under the sofa.”
> consult madame
“I have told you already,” she sighs.
“You will find what you lost under the sofa.”
```

Reach for a script only when data can't say it. Most behavior is rules, conditions and effects.


## Topics and orders

A librarian who answers questions, and won't be bossed about.

<<< ../../../src/worlds/examples/topics.ts#librarian{ts}

- **`topics`** answer ASK (or TELL) *librarian* ABOUT *something*. Each topic is a line, or a list of entries tried in order; the first whose `if` holds wins.
- **An entry can name an event**, which runs instead of printing. Asking about the archive lends you the key, once; after that the `has:brass_key` entry answers first.
- **`topicAliases`** are other words for a topic, matched the same way item names are, so “the archive”, “archives” and “key” all find `archive`.
- **`noTopic`** answers anything else. Without it, ASK falls back to what TALK TO would say.
- **`refuseOrder`** answers an order: “librarian, open the door” or “tell librarian to open the door”. Without it the reply is “librarian ignores you.” A rule on the character (`instead.order`) can answer a particular order instead; in a script it runs, `ctx.command.words.indirect` is what was ordered (“open the door”).

```
> ask librarian about books
“Shelved by colour. Don’t ask.”
> ask librarian about the weather
“I couldn’t say, dear.”
> librarian, open the door
“Shh.”
> ask librarian about the archive
“Oh, the archive.” She slides a brass key across the desk.
> ask librarian about the archive
“You have the key. Go on, then.”
```

Characters don't carry out orders yet; they answer them.

## A wandering character

A cat who wanders three rooms and walks off with your sock.

<<< ../../../src/worlds/examples/wanderer.ts#cat{ts}

- **A daemon** runs after every turn the engine acts on. This one's `if` (`alive:cat`) keeps the cat moving for as long as it lives, and its step is a script.
- **The script decides; its steps act.** `ctx.npcIn` finds the cat, `ctx.roll` decides whether it moves, and `{ moveNpc }` moves it. Lines are printed only when the player can see the cat leave or arrive (`ctx.room()` is where the player is).
- **`ctx.children(room)`** lists what's on the floor there. `{ move: 'sock', to: 'cat' }` puts the sock in the cat's keeping; a character's holdings aren't listed in a room.
- The world's **`seed`** fixes the cat's path, so the transcript below plays the same way every time.

```
> wait
Time passes.
The cat pads in.
The cat bats the sock away somewhere. It’s gone.
> look
📍 Hall
A narrow hall. The kitchen is east, the garden south.
Present: cat.
Exits: east, south.
> east
📍 Kitchen
A warm kitchen. The hall is west.
Exits: west.
The cat pads in.
```

Native Zork I's thief is this recipe grown up: he moves through the rooms, steals what's worth stealing, and stays out of sight (`hidden`) until he chooses to show himself.
