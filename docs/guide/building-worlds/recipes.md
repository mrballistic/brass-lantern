# Recipes

Each recipe is a small, complete world about one idea, in [`packages/engine/src/worlds/examples/`](https://github.com/mrballistic/brass-lantern/tree/main/packages/engine/src/worlds/examples). Every transcript on this page is what [a test](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/tests/worlds/examples/pages.test.ts) gets by typing its commands into that world.

**How a recipe fits into a world.** A recipe is a whole world file, built like the [two-room game](./two-rooms): one `World` object with rooms, items, characters and events. The code blocks under each heading show the part of the file the recipe is about; the rest (the rooms around it, the events it names, its `seed`) is in **The whole world**, folded under the notes. To put an idea in your own game, copy the parts it shows into your world’s object, along with anything they name.

**To play a recipe**, you don’t need to copy anything: every one ships with the engine under the name its file exports. Set up a project as in [Play it](./two-rooms#play-it) and type each `> ` line of a transcript, without the `> `:

```ts
import { createGame } from '@brass-lantern/engine';
import { containers } from '@brass-lantern/engine/worlds';

const game = createGame(containers);
for (const command of ['take key', 'open jar', 'take key from jar']) {
  console.log(`> ${command}`);
  console.log(game.send(command).lines.join('\n'));
}
```

Each transcript starts from a new game (a fresh `createGame`), just after its opening lines (`game.opening`). Where randomness matters, the world’s `seed` fixes it, so the same commands give the same replies every time.

**Rules** appear in every recipe. They hang off a verb (`instead: { examine: [ … ] }`), as a list:

- **`instead`** rules replace what the verb does; **`after`** rules run once it has worked.
- **A rule’s keys:** `if` is a [condition](../../reference/conditions-and-events#conditions) that has to hold; `with` names the second object it applies to (`unlock tin with key`); `then` names an event to run; `say` prints lines instead.
- **The first rule that fits wins.** The list is tried in order, so put the specific rules before a catch-all `{ say: [ … ] }`. The thing’s own rules are asked before the room’s.

[Rules](../../reference/world-schema#rules) has the whole shape, and [Events and effects](../../reference/conditions-and-events#events-and-effects) lists the steps an event can take.

## Containers and keys

A shelf with a glass jar on it, a key in the jar, and a locked tin the key opens.

<<< ../../../packages/engine/src/worlds/examples/containers.ts#items{ts}

- **A `surface`** (the shelf) shows what’s on it, and you can reach it.
- **A `container`** holds things. `openable` gives it a lid; `locked` and `key` lock it; `capacity` limits how many things fit directly inside; `opened` replaces the default “Opened.”.
- **`transparent`** lets the player see inside while it’s closed, but not reach in: TAKE KEY says which container is in the way.
- **`contains`** says what starts inside or on it.

::: details The whole world: containers.ts
<<< ../../../packages/engine/src/worlds/examples/containers.ts{ts}
:::

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

<<< ../../../packages/engine/src/worlds/examples/darkness.ts#cellar{ts}

<<< ../../../packages/engine/src/worlds/examples/darkness.ts#lamp{ts}

<<< ../../../packages/engine/src/worlds/examples/darkness.ts#darkness{ts}

- **`dark: true`** makes a room need light. A **`light`** item gives it while it’s on (it has to be **`switchable`** to turn on), whether it’s carried, on the floor, or inside something open.
- **In the dark** the player can only find what they’re carrying. Anything else gets `tooDark` (“It’s too dark to see.”), and no time passes.
- **`blunder`** runs when the player tries a direction with no exit in the dark. Zork’s grue is a [`chance`](../../reference/conditions-and-events#events-and-effects) of death; this one always bites.
- **`death`** says what dying does. With `lives: 1` the player gets one resurrection in `respawn`; the next death plays `final` and ends the game. Without a `death` block, dying ends the game at once.

::: details The whole world: darkness.ts
<<< ../../../packages/engine/src/worlds/examples/darkness.ts{ts}
:::

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

<<< ../../../packages/engine/src/worlds/examples/timers.ts#kettle{ts}

<<< ../../../packages/engine/src/worlds/examples/timers.ts#clock{ts}

- **A fuse** is the `schedule` effect: run an event after so many turns. `cancel` stops it. Here **`after`** rules start and stop it: they run once TURN ON or TURN OFF has worked.
- **A daemon** runs after every turn while its `if` holds. Two daemons make a clock: one counts minutes in a **variable**, the other chimes when it reaches 5.
- **`ambient`** lines interrupt every few turns while their condition holds.
- **A turn** is a command the engine acted on. Misunderstood commands, questions, and VERBOSE or UNDO take no time.

::: details The whole world: timers.ts
<<< ../../../packages/engine/src/worlds/examples/timers.ts{ts}
:::

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

A garden with something buried in it, and a chapel. Digging and praying aren’t built in, so the world declares them.

<<< ../../../packages/engine/src/worlds/examples/endings.ts#verbs{ts}

<<< ../../../packages/engine/src/worlds/examples/endings.ts#endings{ts}

- **A world verb** does nothing by itself. Rules give it meaning: the flowerbed has an `instead.dig` rule, and so does the garden, for DIG with no object. The chapel has `instead.pray`. Anywhere else, the verb’s `reply` answers.
- **`end`** plays an ending: its lines, the score (with `score: true`), then the footer.
- **The score** here comes from the `score` effect, out of `maxScore`. Worlds can also award points for flags with [`scoring`](../../reference/world-schema#world).

::: details The whole world: endings.ts
<<< ../../../packages/engine/src/worlds/examples/endings.ts{ts}
:::

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

The other ending, from a new game:

```
> east
📍 Chapel
Cool and quiet. The garden is west.
Exits: west.
> pray
A warm calm settles over you.
✨ You leave lighter than you came.
[Score: 10 of 50, in 1 move.]
Type RESTART to try another ending.
```

## A guard to fight

An armory with a sword and an anvil too heavy to lift, and a guard who won’t let you through.

<<< ../../../packages/engine/src/worlds/examples/guard.ts#items{ts}

<<< ../../../packages/engine/src/worlds/examples/guard.ts#guard{ts}

<<< ../../../packages/engine/src/worlds/examples/guard.ts#gate{ts}

- **`carry`** turns on weight. Each item weighs its `size` (5 if unset) plus what’s inside it, and TAKE refuses what would go over `limit`.
- **`combat`** on a character makes it someone you can fight with a `weapon`. The engine runs the fight: your strength against theirs, a seeded roll, and Zork’s tables of results. The guard’s `messages` are its blows at you; `world.combat` holds yours (short defaults here).
- **The engine’s own fight lines say “they”** (“The guard drops their weapon.”), since it doesn’t know who a character is. The world’s own `combat` block (not the guard’s) replaces the two that would say it here, `messages.loseWeapon` and `texts.defenceless`, so the guard is “he” throughout.
- **`holds`** gives the guard his club. While he has it he fights back; knock it away and `onBusy` runs instead of a swing.
- **`awake:guard`** in the exit’s `denials` keeps the way shut until he’s dead or out cold.
- **`seed`** (here `seed: 1`, in the whole world below) fixes the world’s random generator, so this transcript plays the same way every time. Leave it out and every game differs.
- **DIAGNOSE** says how hurt you are; wounds heal with time.

::: details The whole world: guard.ts
<<< ../../../packages/engine/src/worlds/examples/guard.ts{ts}
:::

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
The club flies out of the guard’s hand.
The guard gropes for his club.
> attack guard with sword
The guard can’t defend himself.
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

In [Infocom style](../../reference/world-schema#style) (`style: 'infocom'` on the world) the same fight uses Zork’s words, and `kill guard` picks the one weapon you’re holding. The native Zork I that ships with the engine (`import { zork1 } from '@brass-lantern/engine/worlds'`) has a troll that is this recipe with Zork’s own numbers and messages.

## Scripts

A fortune teller who tells you one of three fortunes, then sticks to it.

<<< ../../../packages/engine/src/worlds/examples/fortune.ts#script{ts}

- **A script** is a function in `scripts` that returns ordinary steps: lines and effects. Events call it with `{ script: 'name' }`. It gets one argument, `ctx`, the game as the script sees it; [Scripts](../../reference/world-schema#scripts) lists what’s on it.
- **It reads the game, it doesn’t change it.** `ctx.state` is read-only; to change things, return effects (`setVar` here). That keeps the engine’s guarantees: a command it didn’t understand changes nothing, and saves replay exactly.
- **`ctx.roll(3)`** is 1 to 3 from the game’s seeded generator, never `Math.random()`. With this world’s `seed: 3` the fortune is the sofa one; another seed picks another.
- **A rule on a character** (`instead.consult` on Madame Zora) answers a world verb aimed at her.

::: details The whole world: fortune.ts
<<< ../../../packages/engine/src/worlds/examples/fortune.ts{ts}
:::

```
> consult madame
“You will find what you lost under the sofa.”
> consult madame
“I have told you already,” she sighs.
“You will find what you lost under the sofa.”
```

Reach for a script only when data can’t say it. Most behavior is rules, conditions and effects.

## Topics and orders

A librarian who answers questions, and won’t be bossed about.

<<< ../../../packages/engine/src/worlds/examples/topics.ts#librarian{ts}

- **`topics`** answer ASK (or TELL) *librarian* ABOUT *something*. Each topic is a line, or a list of entries tried in order; the first whose `if` holds wins.
- **An entry can name an event**, which runs instead of printing. Asking about the archive lends you the key, once; after that the `has:brass_key` entry answers first.
- **`topicAliases`** are other words for a topic, matched the same way item names are, so “the archive”, “archives” and “key” all find `archive`.
- **A topic keyed `me`** answers ASK *librarian* ABOUT ME, and ABOUT MYSELF too.
- **`noTopic`** answers anything else. Without it, ASK falls back to what TALK TO would say.
- **`refuseOrder`** answers an order: “librarian, open the door” or “tell librarian to open the door”. Without it the reply is “librarian ignores you.” A rule on the character (`instead.order`) can answer a particular order instead; in a script it runs, `ctx.command.words.indirect` is what was ordered (“open the door”).

::: details The whole world: topics.ts
<<< ../../../packages/engine/src/worlds/examples/topics.ts{ts}
:::

```
> ask librarian about books
“Shelved by colour. Don’t ask.”
> ask librarian about me
“You look like someone with an overdue book.”
> ask librarian about the weather
“I couldn’t say, dear.”
> librarian, open the door
“Shh.”
> ask librarian about the archive
“Oh, the archive.” She slides a brass key across the desk.
> ask librarian about the archive
“You have the key. Go on, then.”
```

A character with no `orders` or `obeys` only answers; see [Orders, numbers and a buggy](#orders-numbers-and-a-buggy) for one that carries them out.

## A wandering character

A cat who wanders three rooms and walks off with your sock.

<<< ../../../packages/engine/src/worlds/examples/wanderer.ts#cat{ts}

- **A daemon** runs after every turn the engine acts on. This one’s `if` (`alive:cat`) keeps the cat moving for as long as it lives, and its step is a script.
- **The script decides; its steps act.** `ctx.npcIn` finds the cat, `ctx.roll` decides whether it moves, and `{ moveNpc }` moves it. Lines are printed only when the player can see the cat leave or arrive (`ctx.room()` is where the player is).
- **`ctx.children(room)`** lists what’s on the floor there. `{ move: 'sock', to: 'cat' }` puts the sock in the cat’s keeping; a character’s holdings aren’t listed in a room.
- The world’s **`seed`** (`seed: 4`) fixes the cat’s path, so the transcript below plays the same way every time: the cat stays in the kitchen for six turns, then comes to the hall and takes the sock, which starts on the hall floor. It keeps wandering after that (hall, kitchen, garden and round again), which is why it turns up in the kitchen behind you. `ctx` is described under [Scripts](../../reference/world-schema#scripts).

::: details The whole world: wanderer.ts
<<< ../../../packages/engine/src/worlds/examples/wanderer.ts{ts}
:::

```
> wait
Time passes.
> wait
Time passes.
> wait
Time passes.
> wait
Time passes.
> wait
Time passes.
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

Native Zork I’s thief is this recipe grown up: he moves through the rooms, steals what’s worth stealing, and stays out of sight (`hidden`) until he chooses to show himself.

## A room that listens

A cave that hears everything you say as an echo, until you say the magic word.

<<< ../../../packages/engine/src/worlds/examples/echo.ts#cave{ts}

<<< ../../../packages/engine/src/worlds/examples/echo.ts#script{ts}

- **This world is in [Infocom style](../../reference/world-schema#style)** (`style: 'infocom'`), like Zork: rooms show no exit line, and a room you’ve been in before shows just its name.
- **[`capture`](../../reference/world-schema#capture)** sees each command before the parser does, while its `if` holds. The script reads the raw words from `ctx.line`.
- **Returning steps takes the command**, and drops the rest of the line. **Returning nothing declines**: the command is parsed as usual, so OUT still leaves.
- **A capture also sees commands that arrive already parsed** (AGAIN, the intent server’s reading), with `ctx.line` unset; this one only hears raw words, so it returns nothing then.
- **`{ free: true }`** makes the reply take no time. The transcript below counts three moves: IN, LOOK and OUT.
- Captured words never reach the intent server, and SAVE, UNDO and RESTART are handled before any capture, so a player can’t get stuck.

::: details The whole world: echo.ts
<<< ../../../packages/engine/src/worlds/examples/echo.ts{ts}
:::

```
> in
📍 Echoing Cave
A vast cave. Every sound comes back to you, louder. The way out is out.
> hello there
there there ...
> echo
The cave falls silent.
> look
📍 Echoing Cave
A vast cave, quiet now. The way out is out.
> out
📍 Ledge
```

Native Zork I’s Loud Room is this recipe with Zork’s rules: ECHO quiets it, and when the dam’s gates are open at high tide its end routine (`onEnd`) throws you out.

## A raft on a pond

A raft, a pond you can’t wade, and an island beyond it.

<<< ../../../packages/engine/src/worlds/examples/raft.ts#raft{ts}

<<< ../../../packages/engine/src/worlds/examples/raft.ts#pond{ts}

- **This world is in [Infocom style](../../reference/world-schema#style)** too, so the vehicle lines are Zork’s: “Pond, in the raft”, “(raft)” when the parser fills in what you meant, and “(outside the raft)” on the room’s things.
- **`vehicle`** makes an item something to get into: BOARD it while it’s on the ground, DISEMBARK to get out.
- **`water`** marks a room only a water vehicle reaches. On foot it’s “You can’t go there without a vehicle.”; aboard, getting out there is refused.
- **The raft goes where you go**, and comes to rest on the island’s shore with you still aboard. Things you drop land in the raft, and the room’s things are “(outside the raft)”.

::: details The whole world: raft.ts
<<< ../../../packages/engine/src/worlds/examples/raft.ts{ts}
:::

```
> east
You can’t go there without a vehicle.
> board raft
You are now in the raft.
> east
📍 Pond, in the raft
The middle of the pond. Lily pads drift by. An island lies to the east, the bank to the west.
> disembark
(raft)
You realize that getting out here would be fatal.
> east
The raft comes to a rest on the shore.

📍 Island, in the raft
A tiny island with one tree. The pond is west.
There is a pine cone here. (outside the raft)
```

Native Zork I’s magic boat is this recipe with Zork’s rules on top: inflating it, the label, LAUNCH, punctures and the river’s current.

## Orders, numbers and a buggy

A workshop with a robot that does as it’s told, a dial you turn to a number, and a dune buggy for the sand beyond the yard.

<<< ../../../packages/engine/src/worlds/examples/workshop.ts#robot{ts}

- **`obeys`** lists the built-in orders the robot carries out itself: GO, TAKE, DROP and GIVE (“robot, give me the wrench”). `obeyReplies` is what it says; the default is “Okay.”
- **`orders`** is a table of rules per verb, for anything else (“robot, push the button”). Its rules read the order as the player wrote it: `target:button` is what it was told to push. “Push” is also the word the parser files under USE; the word typed is tried first, so `orders.push` answers it even when `orders.use` exists.
- **`direction:`** in an `orders.go` rule is the place the character was told to go, as typed: “robot, go to the dunes” is `direction:dunes`. A rule that answers stops the robot obeying; anything else (“robot, go east”) falls through to `obeys`.
- **An order ends the rest of the line**, and the objects of an order are looked up in *its* room, not the player’s.

<<< ../../../packages/engine/src/worlds/examples/workshop.ts#dial{ts}

- **A number** is a second object: `turn dial to 4`. A rule says `with: 'number'` and tests `number:4`; `{ setVar: 'dial', from: 'number' }` keeps it and `{number}` prints it. `{var:dial}` fills in a description from the game, so EXAMINE shows where the dial points now.

<<< ../../../packages/engine/src/worlds/examples/workshop.ts#sand{ts}

<<< ../../../packages/engine/src/worlds/examples/workshop.ts#buggy{ts}

- **A terrain** is any name a room gives itself ([Vehicles](../../reference/world-schema#vehicles) has the fields). On foot you can walk only where `onFoot` allows (default `['land']`), so the dunes need a vehicle that `travels` on `'sand'`. `leave` (and `arrive`, `landing`) are lines the vehicle says as it goes; with more than one, the seeded generator picks (this world’s `seed: 4` picks “Sand sprays behind you.” first).

::: details The whole world: workshop.ts
<<< ../../../packages/engine/src/worlds/examples/workshop.ts{ts}
:::

```
> robot, go to the dunes
The robot looks at its treads, then at the sand, and stays put.
> robot, push the button
The robot extends its clamp and presses the button. Somewhere, a bell rings.
> robot, go east
Whirr, click!
> turn dial to 2
The dial clicks round to 2. Nothing else happens.
> examine dial
The brass dial points at 2.
> east
📍 Yard
A gravel yard. The workshop is west, and dunes begin to the east.
You can see: dune buggy.
Present: robot.
Exits: west, east.
> east
You can’t go there without a vehicle.
> board buggy
You are now in the dune buggy.
> east
Sand sprays behind you.
📍 Dune (in the dune buggy)
Soft sand rolls away in every direction. The yard is west; a bigger dune lies east.
Exits: west, east.
```

Turn the dial to 4 instead and the hatch opens, which ends the game.

