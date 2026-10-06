# World schema

Every field a world can use. The source of truth is [`src/types/world.ts`](https://github.com/mrballistic/brass-lantern/blob/main/src/types/world.ts), which has a comment on each one. "Condition" means a [condition string](./conditions-and-events#conditions); "event" means a key in `events`.

## World

| Field | Type | |
|---|---|---|
| `startRoom` | room ID | Where a new game begins. |
| `rooms` | `Record<id, Room>` | |
| `items` | `Record<id, Item>` | |
| `npcs` | `Record<id, NPC>` | |
| `dialogue` | `Record<npc id, Dialogue>` | What TALK TO says. |
| `events` | `Record<id, EventStep[]>` | Lines and [effects](./conditions-and-events#events-and-effects). `intro` plays when a new game starts. |
| `flagLabels` | `Record<label, flag id>` | Maps the lowercased label in `[Flag set: …]` lines to a flag ID. |
| `hints?` | `Hint[]` | HINT shows the first whose condition holds. |
| `scoring?` | `{ flag, points }[]` or `{ if, points }[]` | SCORE sums points for set flags, plus conditions that hold right now (a treasure in the case), plus the `score` variable. |
| `maxScore?` | number | The total SCORE reports. Default: the sum of `scoring`. |
| `ranks?` | `{ min, title }[]` | The highest `min` the score reaches is the rank. |
| `idle?` | string | Reply to WAIT or SIT where they don't lead anywhere. Default: "Time passes." |
| `quit?` | string | Reply to QUIT. |
| `confused?` | string[] | Replies for input nothing understood, rotated. |
| `ambient?` | `Ambient[]` | Timed interruptions. |
| `finale?` | `Finale` | The win condition. |
| `verbs?` | `Record<id, WorldVerb>` | Verbs this world adds. See [World verbs](#world-verbs). |
| `vars?` | `Record<name, number>` | Starting values for numeric variables. |
| `seed?` | number | Seeds the random generator, for reproducible games. Default: the clock. |
| `daemons?` | `{ if, then }[]` | Run after every turn the engine acts on, while `if` holds. `then` is an event name or steps. See [Time](#time). |
| `darkness?` | `Darkness` | Texts and behavior for dark rooms. See [Darkness](#darkness). |
| `death?` | `Death` | What dying does. See [Death](#death). |
| `endings?` | `Record<id, Ending>` | Named endings for the `end` effect. See [Endings](#endings). |
| `style?` | `'brass'` or `'infocom'` | Output conventions. See [Style](#style). Default `'brass'`. |
| `emptyInventory?` | string | INVENTORY with nothing carried. Default: “You are empty-handed.” |
| `smashRefusal?` | string | SMASH where nothing can be smashed. |
| `title?` | string | The game's full title, for VERSION and Infocom-style transcripts (“ZORK I: The Great Underground Empire”). |
| `credits?` | string[] | Lines VERSION prints after the title. |
| `carry?` | `Carry` | Carrying weight. Without it there's no limit. See [Weight](#weight). |
| `combat?` | `CombatRules` | The player's side of fights. See [Combat](#combat). |
| `scripts?` | `Record<name, Script>` | The code hatch: functions that return steps. See [Scripts](#scripts). |
| `capture?` | `Capture` | Takes input anywhere, after the room's own capture. See [Capture](#capture). |
| `wait?` | `{ turns }` | WAIT runs the clock up to `turns` times, stopping after a turn where something happened (Zork: 3). Each counts as a move. |
| `statusLine?` | `'moves'` or `'score'` | The header in brass style: `MOVES: n` (the default) or `SCORE: n  MOVES: n`. Infocom style always shows the room, score and moves. |

## Room

| Field | Type | |
|---|---|---|
| `name` | string | Shown as the room header. |
| `description` | string | |
| `firstDescription?` | string | Replaces `description` on the first visit only. |
| `dark?` | boolean | Needs a light source to see in. |
| `descriptions?` | `{ if, text }[]` | Descriptions that depend on the state of things (“a small window which is open”). The first whose condition holds replaces `description`. |
| `exits` | `Record<label, room id or Exit>` | What the player can type, and where it goes. Several labels per destination is normal. A label of `wait` or `sit` is taken by WAIT/SIT. See [Exit](#exit). |
| `listExits?` | label[] | What the exit line shows, in order; each gets the compass direction that leads the same way. Omit to list every label. |
| `items` | item ID[] | Items in the room at the start. |
| `npcs` | NPC ID[] | |
| `onEnter` | `{ if, then, repeat? }[]` | Events fired on arrival when the condition holds: once per game, or every time with `repeat: true`. |
| `requires?` | condition | Must hold to enter. |
| `denial?` | string | Shown when `requires` fails. |
| `scenery?` | item ID[] | Items present here without being in the room: a door shared by two rooms, a window, the sky. Examinable and usable, never listed or taken. |
| `instead?`, `after?` | `Record<verb, Rule[]>` | Rules for verbs used in this room. See [Rules](#rules). |
| `tags?` | string[] | Free-form labels for scripts to read (`maze`, `sacred`). The engine doesn't. |
| `capture?` | `Capture` | Takes input here before it's parsed. See [Capture](#capture). |
| `water?` | boolean or condition | Water (Zork's NONLANDBIT): only a water vehicle goes here. A condition for a room that changes (a reservoir that drains: `'!flag:low_tide'`). See [Vehicles](#vehicles). |
| `onEnd?` | `{ if, then }[]` | Run at the end of every command here, after the action and before the clock (Zork's M-END). After WAIT's turns when `wait` is set. |

### Exit

| Field | Type | |
|---|---|---|
| `to?` | room ID | Where it goes. Omit for an exit that only prints `denial` (“The door is boarded.”). |
| `if?` | condition | Must hold for this exit alone. |
| `denial?` | string | Shown when `if` fails, or always if there's no `to`. Default: “You can’t go that way.” |
| `door?` | item ID | An item with `door: true` that must be open. A closed door says “The *name* is closed.” |
| `denials?` | `{ if, text }[]` | Refusals with their own reasons, checked first; the first whose `if` holds refuses with `text` (Zork's chimney). |
| `then?` | event | Runs as the player goes through, before arriving (Zork's exit routines). |

Message-only exits aren't listed unless `listExits` names them.

## Item

| Field | Type | |
|---|---|---|
| `name` | string | Display name, and what event lines like `[Added to inventory: …]` match. Keep it unique. |
| `aliases?` | string[] | Other words players might use. Matched, never shown. |
| `description` | string | EXAMINE. Leave it empty (`''`) and EXAMINE does what Zork does for an object with no text: a container lists what's in it or says “The *name* is empty.”; anything else is “There’s nothing special about the *name*.” |
| `portable` | boolean | Can it be taken? |
| `refusal?` | string | Reply to taking a non-portable item. |
| `tags` | string[] | Free-form; the engine doesn't read them. |
| `onTake?` | event | Fires the first time it's taken. |
| `onUse?` | `UseRule[]` | See below. |
| `onWear?` | event | Fires the first time it's worn; WEAR again says "already wearing". |
| `onSmash?` | event | Fires once, then the item is gone. |
| `contains?` | item ID[] | Items that start inside or on this one. |
| `container?` | `Container` | Makes it a container. See below. |
| `surface?` | boolean | Things can be put on it; what's on it is always visible and reachable. |
| `scenery?` | boolean | Present but never listed (the house, the forest). |
| `door?` | boolean | A door between rooms; exits name it. Uses `container` for openable/open/locked/key. |
| `size?` | number | Its weight, in worlds with `carry` (Zork's SIZE). Default 5. |
| `weapon?` | boolean | Something to fight with. |
| `vehicle?` | `{ travels: 'water' }` | Something the player can get into and travel in. See [Vehicles](#vehicles). |
| `onEnd?` | `{ if, then }[]` | A vehicle's end routines: while the player is aboard they run instead of the room's. |
| `burnable?` | boolean | BURN can set it alight (Zork's BURNBIT). |
| `flaming?` | boolean | It can set things alight: always, or while it's on if it switches (Zork's FLAMEBIT). |
| `treasure?` | number | What it's worth (Zork's TVALUE). The engine doesn't read it; scripts and scoring can. |
| `text?` | string | What READ shows. Default: the description. |
| `initialDescription?` | string | Its own sentence in a room until first taken. |
| `roomDescription?` | string | Its own sentence in a room after that. Items with neither are gathered into “You can see: …”. |
| `switchable?` | boolean | TURN ON and TURN OFF work on it. |
| `light?` | boolean | Gives light while on: it lights a dark room it's in, carried there, or inside something open or transparent there. |
| `home?` | room ID | Where it goes if the player dies carrying it. |
| `article?` | string | “a”, “an”, “some” or “” in listings. |
| `contentsHeading?` | string | The heading over its contents (“Your collection of treasures consists of:”). |
| `instead?`, `after?` | `Record<verb, Rule[]>` | See [Rules](#rules). |

### Container

| Field | Type | |
|---|---|---|
| `openable?` | boolean | Has a lid or door. Containers that aren't openable are always open. |
| `open?` | boolean | Starts open. |
| `locked?` | boolean | Starts locked. |
| `key?` | item ID | Locks and unlocks it. |
| `transparent?` | boolean | You can see inside even when it's closed. |
| `capacity?` | number | How many items fit directly inside. |
| `weight?` | number | The total weight it holds (Zork's CAPACITY), in worlds with `carry`. |
| `opened?`, `closed?` | string | Lines for opening and closing it, instead of the defaults. |

You can see into a surface, an open container or a transparent one; you can reach into a surface or an open container. The parser only matches what you can see, and taking something you can see but can't reach says which container is closed.

> `onSnooze` was removed in 1.4.0: SNOOZE is no longer built in. Declare it as a [world verb](#world-verbs) and give the item an `instead.snooze` rule.

### UseRule

Rules are tried in order and the **first** whose conditions hold runs. For two-object commands, rules on both items are checked, so one rule covers "put the disk in the drive" and "use the drive with the disk".

| Field | Type | |
|---|---|---|
| `if?` | condition | |
| `with?` | item ID | Another item that must be in the room or carried. If the player names a second object, it must be this one. |
| `then?` | event | |
| `say?` | string[] | Lines printed without changing anything. |

USE also covers PUSH, PULL, PRESS and ATTACH X TO Y. OPEN and PUT fall back to an item's use rules when it isn't a container (or isn't in your hands), so worlds written before OPEN and PUT existed keep working. Using an item with `onWear` and no matching rule wears it. Verbs like SLEEP, UNPLUG or INSTALL are [world verbs](#world-verbs) now: declare them and give items `instead` rules.

## Rules

Items and rooms can carry rules for any verb, built-in or declared by the world:

```ts
instead: { move: [{ if: 'flag:rug_moved', say: ['It won’t budge again.'] }, { then: 'rug_moved' }] },
after: { take: [{ if: '!flag:took_egg', then: 'took_egg' }] },
```

- **`instead`** rules run in place of the verb's default.
- **`after`** rules run after the default succeeds and changes something.
- **Lookup order:** the target item's rules, then the indirect item's, then the room's. The first rule whose `if` holds (and whose `with` matches the other object, when given) wins.
- A rule is the same shape as a UseRule (above).
- **`as: 'target'` or `'indirect'`** limits a rule to its item's role in the command (Zork's PRSO and PRSI): a tube that refuses things put *into* it, not itself put somewhere.
- **`prep`** limits it to a preposition: `prep: 'in'` answers PUT … IN, not PUT … ON.
- **In Infocom style** the second object's rules are asked before the first's, as Zork's PERFORM does (POUR WATER ON BELL asks the bell first).
- **`continue: true`** on an `instead` rule runs it and then lets the verb's default go on as well (Zork's “print, then RFALSE”): a line before the TAKE that still happens.
- **On a character**, rules answer verbs aimed at it, including `order` (see [NPC](#npc)).
- **The older hooks still work:** `onUse` is `instead.use`, and `onTake` is a one-shot `after.take`.

## World verbs

A world can add verbs without touching the engine or the intent server:

```ts
verbs: {
  pray: { words: ['pray'], target: 'none', reply: 'If you pray enough, your prayers may be answered.' },
  move: { words: ['move', 'shift'], target: 'required' },
  drive: { words: ['drive', 'drive to'], target: 'optional', go: true },
},
```

| Field | Type | |
|---|---|---|
| `words` | string[] | Words and phrases that mean it. Phrases are matched before built-in verbs, single words after. |
| `target` | `'none'`, `'optional'` or `'required'` | |
| `indirect?` | string[] | Prepositions that introduce a second object (`with`, `on`). |
| `reply?` | string | When no rule applies. Default: “Nothing happens.” |
| `held?` | boolean | The object must be something you hold, or can see inside something you hold (Zork's HELD): POUR WATER means the water in your bottle. |
| `go?` | boolean | Treat it as GO: through the target exit, or the exit labeled with the verb's ID. |

- A world verb does nothing by itself: give items or rooms `instead` rules for it.
- With no target, it looks for a rule on the room, then on anything in reach (SNOOZE finds the alarm clock).
- A word a built-in verb already uses (`take`, `open`, …) is ignored; `verbClashes(world.verbs)` lists any.

## Style

- **`'brass'`** (the default) lists items as “You can see: …”, says “Taken: lamp.”, and shows an exit line.
- **`'infocom'`** follows Zork's conventions:
  - “There is a sword here.” and “Taken.”;
  - no exit line;
  - a room you've visited shows just its name and contents unless you LOOK (SUPERBRIEF shows only the name, in either style);
  - lists newest first;
  - SCORE says “Your score is 15 (total of 350 points), in 40 moves.”;
  - the header shows the room, score and moves, like Zork's status line;
  - questions, TAKE ALL and transcripts use Zork's wording;
  - bookkeeping lines like `[Flag set: …]` act without being shown.
  - each thing's contents are listed right after it;
  - READ takes the thing first (“(Taken)”), EXAMINE of a thing with no description reads it, and opening a container whose one untouched thing has a first-seen sentence says “The coffin opens.” and that sentence;
  - PUT … ON something that isn't a surface says “There’s no good surface on the …”;
  - a room's `scenery` (Zork's local globals) only answers to a word when nothing else in reach does;
  - the second object's rules come before the first's;
  - untouched things' first-seen sentences are listed before everything else;
  - EXAMINE of a closed box says “The box is closed.”

## Time

After every turn the engine acts on (never after a misunderstood command), these happen in order:
0. **The room's end routines** (`onEnd`, Zork's M-END).
1. **Fuses** count down, and those reaching zero run. A fuse is set by the `schedule` effect and removed by `cancel`; one set during a turn starts counting the next turn.
2. **Daemons** run, in order, each while its `if` holds.
3. **Ambient lines** print.

A lamp that burns down is a variable and a few daemons:

```ts
vars: { lamp_fuel: 185 },
daemons: [
  { if: 'on:lamp', then: [{ add: 'lamp_fuel', by: -1 }] },
  { if: 'on:lamp & var:lamp_fuel=85 & here:lamp', then: ['The lamp appears a bit dimmer.'] },
  { if: 'on:lamp & var:lamp_fuel<0', then: 'lamp_dies' },
],
```

With the world's `wait` set, WAIT runs steps 1 to 3 up to that many times, stopping after one where something happened (a line printed or a fuse fired), and the room's end routines run after them.

A **move** is one of these turns: MOVES in the header and SCORE count them. Commands that take no game time (VERBOSE, BRIEF, SUPERBRIEF, UNDO, SAVE, RESTORE, SCRIPT, VERSION, a question back to the player) don't count, and nothing runs after them.

## Darkness

| Field | Type | |
|---|---|---|
| `look?` | string | LOOK and arriving in an unlit dark room. Default: “It is pitch black.” |
| `tooDark?` | string | Acting on something you can't see. Default: “It’s too dark to see.” |
| `fall?` | string | When the room goes dark around you. Default: “It is now pitch black.” |
| `stumble?` | `{ chance, then, aboard? }` | Walking from an unlit dark room into another: `chance`% of `then` instead (Zork's grue, 80), or `aboard` in a vehicle. |
| `litIf?` | condition | While it holds, every room is lit (Zork's ALWAYS-LIT, for a spirit). Mustn't use `lit:`. |
| `blunder?` | `EventStep[]` | Run when the player tries a direction with no exit in the dark. Zork's grue: `[{ chance: 80, then: [{ die: '…' }], else: ['You can’t go that way.'] }]`. |

In an unlit dark room you can only find what you're carrying. Trying to act on anything else gets `tooDark`: an understood refusal, so the intent server isn't asked to re-guess. Turning a light on or off says so (`fall`, or the room's description).

## Death

| Field | Type | |
|---|---|---|
| `message?` | `(string or { if, text })[]` | Printed after the cause; an entry with `if` only while it holds (Zork's “Bad luck, huh?”). |
| `penalty?` | number | Added to the score. |
| `lives?` | number | Deaths survived before the final one. |
| `respawn?` | room ID | Where the player wakes. |
| `resurrection?` | string[] | |
| `scatter?` | room ID[] | Carried things are spread over these, at random (seeded). Things with a `home` go there instead; with no scatter rooms, they stay where the player fell. |
| `final?` | string[] | The last death, which ends the game. |
| `then?` | event | Runs after a resurrection, to reset things (Zork's trap door, unbarred). |
| `variants?` | `{ if, resurrection?, respawn?, then?, before? }[]` | The first whose `if` holds (decided as you die) replaces those fields; `before` runs ahead of the respawn. Zork sends you to Hades as a spirit once you've seen the Altar. |
| `instead?` | `{ if, lines }[]` | Checked first: the first that holds prints its lines (not the cause) and ends the game. Dying while already dead. |

The `die` effect uses it. Without a `death` block, dying prints the cause and ends the game. Pending fuses are cancelled on death.

## Endings

`endings: { victory: { lines: [...], score: true, footer: ['Type RESTART to play again.'] } }`. The `end` effect plays one: its lines, the score and rank if `score` is set, then the footer, and the game is over. The `finale` is an ending too, reached by smashing.

## NPC

| Field | Type | |
|---|---|---|
| `name` | string | |
| `description` | string | EXAMINE. |
| `onGive?` | `Record<item id, event>` | GIVE hands the item over and fires the event. |
| `refuse?` | `Record<item id, string>` | Declines that item; the player keeps it. |
| `refuseGift?` | string | Declines anything else. |
| `holds?` | item ID[] | What it carries at the start. Things a character holds can't be seen or taken. |
| `descriptions?` | `{ if, text }[]` | Its line in the room and its EXAMINE reply, by state; the first whose condition holds wins. |
| `instead?`, `after?` | `Record<verb, Rule[]>` | Rules for verbs aimed at it: THROW X AT it, GIVE, TAKE, a world verb. |
| `combat?` | `Combatant` | Makes it someone you can fight. See [Combat](#combat). |
| `aliases?` | string[] | Other words for it (“robber”, “man”). |
| `scenery?` | boolean | Present but not listed: the room's own description mentions it (Zork's cyclops). |
| `hidden?` | boolean | Starts hidden: in its room for scripts, but not seen, listed, matched or fought until revealed. |
| `topics?` | `Record<topic, string or { if?, text }[]>` | ASK or TELL it ABOUT a topic. A list is tried in order; the first entry whose `if` holds answers. Text that names an event runs it. |
| `topicAliases?` | `Record<topic, string[]>` | Other words for a topic. |
| `noTopic?` | string | For a topic it has nothing on. Default: its TALK TO line. |
| `refuseOrder?` | string | Its answer to an order. Default: “*Name* ignores you.” |

Characters' places and states live in the game state (`npcs`), starting from the rooms that list them. In brass style the room shows “Present: …”; in Infocom style each character prints its own line.

**Hidden characters.** A character that's `hidden` (from the start, or by the `npcState` effect with `hidden: true`) is still in its room: `ctx.npcIn` and conditions like `with:` see it, but the player doesn't, and it doesn't fight. `{ npcState: 'thief', hidden: false }` reveals it. The `seen:` condition is true only when it's in the player's room and not hidden.

**Orders.** “*name*, *command*” and “tell *name* to *command*” are orders. The character's `instead.order` rules answer first, then `refuseOrder`. Characters don't obey yet.

## Weight

```ts
carry: { limit: 100, self: 5, fumble: { over: 7, chance: 8 } },
```

| Field | Type | |
|---|---|---|
| `limit` | number | The total weight the player can carry when healthy. |
| `self?` | number | The player's own weight, counted in (Zork's ADVENTURER is 5). |
| `fumble?` | `{ over, chance }` | Carrying more than `over` things, each TAKE has `count × chance` percent to fumble. |
| `tooHeavy?`, `tooHeavyHurt?`, `fumbled?` | string | The refusals. |

An item weighs its `size` plus everything inside it. Wounds lower the limit and healing restores it.

## Combat

A character with `combat` can be fought: ATTACK *it* WITH *a weapon*. The engine owns the mechanics, ported from Zork I: strength against strength picks one of six blow tables, and a seeded roll picks the result (missed, staggered, wounded, knocked out, killed, disarmed). After every turn the engine acts on, characters in the room who are fighting swing back.

| `Combatant` field | Type | |
|---|---|---|
| `strength` | number | The troll: 2. |
| `weapon?` | item ID | What it fights with, while it holds it. |
| `fears?` | `{ item, by }` | The player's weapon that weakens it (the troll fears the sword, by 1). |
| `wake?` | number | Percent added each turn to its chance of waking while out cold. Default 25. |
| `firstStrike?` | number | Percent chance each turn to start a fight while you're in the room. |
| `messages?` | `Partial<Record<BlowResult, string[]>>` | Its blows at the player, one picked at random. `{weapon}` and `{defender}` are filled in. |
| `onDeath?`, `onUnconscious?`, `onWake?` | event | When it dies, is knocked out, comes round. |
| `onBusy?` | event | Instead of swinging when its weapon is on the floor (the troll recovers his axe). |

| `CombatRules` field | Type | |
|---|---|---|
| `messages?` | same | The player's blows. |
| `strength?` | `{ min, max }` | The player's strength, from `min` at no score to `max` at `maxScore` (Zork: 2 to 7). |
| `cureWait?` | number | Turns for one wound to heal (Zork: 30). |
| `texts?` | `Partial<Record<CombatText, string>>` | Fixed lines: refusals, the death line, the fog. Defaults: Zork's words in Infocom style, short ones in brass. |

**In Infocom style** ATTACK works the way Zork's parser does: with one weapon in hand, `kill troll` picks it (“(with the sword)”); otherwise it asks what to attack with; a weapon you aren't holding is refused without taking a turn. DIAGNOSE reports your wounds. A [recipe](../guide/building-worlds/recipes#a-guard-to-fight) shows a whole fight.

## Scripts

The code hatch, for behavior data can't express (a thief's mind, a sword that glows near monsters):

```ts
scripts: {
  fortune: (ctx) => [ctx.roll(3) === 1 ? '“Beware of geese.”' : '“Soup is coming.”'],
},
events: { reading: [{ script: 'fortune' }] },
```

A script gets a read-only view of the game and returns ordinary steps, which the engine runs. `ctx` has:
- `state` (frozen in development and tests), `world`;
- `random()` and `roll(n)`, from the game's seeded generator, so saves and UNDO replay exactly;
- `here(id)`, `carried(id)`, `holder(id)`, `room()`, `npc(id)`;
- `npcIn(id, room)` (hidden or not), `hidden(id)`;
- `aboard()`, the vehicle the player is in, and `water(room?)`;
- `rooms()` in the world's order, `visited(room)`, `tags(room)`, `lit(room?)`;
- `children(place)`, what's directly in a room, item or character, in listing order;
- `treasure(id)`, an item's `treasure` value or 0;
- `playerStrength()`, the player's fight strength now;
- `line`, the raw input, and `action`, the parsed command, when a [capture](#capture) runs the script; `parse(text)`, which reads a command with the world's verbs as the parser would;
- `arg`, from `{ script, arg }`;
- `command`, the command being run with its objects resolved to IDs, when a rule ran the script. `command.words` keeps the words typed for objects that didn't resolve.

Scripts run only where events run, so a command the engine didn't understand still changes nothing. The world audit fails on a `script` effect naming no script. See the [scripts recipe](../guide/building-worlds/recipes#scripts).

## Vehicles

```ts
raft: { name: 'raft', vehicle: { travels: 'water' }, container: { open: true }, … },
pond: { name: 'Pond', water: true, … },
```

- **BOARD** (GET IN, CLIMB IN) gets in a vehicle that's on the ground here; **DISEMBARK** (GET OUT, GET OFF, STAND) gets out, except on water: “You realize that getting out here would be fatal.” In Infocom style, DISEMBARK with no object names the one vehicle in sight: “(raft)”.
- **Moving:** without a vehicle, water is out of reach (“You can’t go there without a vehicle.”); aboard, the vehicle won't go overland (“You can’t go there in a raft.”); coming from water onto land it rests on the shore (“The raft comes to a rest on the shore.”), and you stay aboard. The vehicle goes wherever you go, scripted moves included.
- **Aboard:** DROP puts things in the vehicle, TAKE *vehicle* says “You’re inside of it!”, and the room's things stay in reach. The vehicle's rules are asked before the room's (Zork's M-BEG): an `instead.go` on it can refuse directions. Its `onEnd` runs in place of the room's. GO goes through rules too, so a room can have `instead.go` rules.
- **Looking:** the header names the vehicle (“Pond, in the raft”); the vehicle isn't listed, its contents are; in Infocom style the room's things are “(outside the raft)”, as Zork's PRINT-CONT does.
- Dying takes you out of the vehicle, which stays where you died. Conditions `aboard`, `aboard:ITEM` and `water:here|ROOM`; effects `{ board }` and `{ disembark }`; script helpers `ctx.aboard()` and `ctx.water(room?)`.

See the [raft recipe](../guide/building-worlds/recipes#a-raft-on-a-pond).

## Capture

```ts
capture: { if: '!flag:quiet', script: 'echo' },
```

A room's capture, then the world's, sees each command of a line before it's parsed, while its `if` holds. The script reads `ctx.line` and returns steps to take it, or nothing to let it parse as usual. Add `{ free: true }` for a reply that takes no time.

It also sees commands that arrive already parsed (AGAIN, OOPS, an answer to a question, the intent server's reading), with `ctx.line` unset and `ctx.action` holding the command, so a limit like a spirit's can't be slipped past. A capture that only cares about raw words returns nothing when `ctx.line` is unset.

- Taking a command ends the line: the rest is dropped, as Zork's Loud Room drops it.
- It runs ahead of the intent server, so captured input is never sent to the LLM.
- SAVE, RESTORE, UNDO and the other store commands come first, so a capture can't trap the player; it never runs once the game is over.
- A capture that declines changes nothing, even if it rolled the dice.

Zork uses it twice: the Loud Room, which hears everything as noise until you say ECHO, and a spirit's limits (DEAD-FUNCTION) after death. See the [listening room recipe](../guide/building-worlds/recipes#a-room-that-listens).

## Dialogue

```ts
dialogue: {
  gary: {
    default: '“Has anyone seen my mug?”',
    'flag:gary_happy': '“Thanks for the mug.”',
    'flag:gary_happy & has:stapler': '“Careful with that stapler.”',
  },
}
```

`default` plus any number of condition keys. TALK TO uses the **last** key whose condition holds, so order them from least to most specific.

## Ambient

| Field | Type | |
|---|---|---|
| `if` | condition | |
| `every` | number | Turns between interruptions. A turn is a command the engine acted on. |
| `lines` | string[] | Printed in rotation. |

## Finale

Smashing `item` in `room` while carrying `with` ends the game: `event`, then each matching `epilogue` event in order, then the score and rank, then `footer`.

| Field | Type | |
|---|---|---|
| `room` | room ID | |
| `item` | item ID | |
| `with` | item ID | The tool. |
| `event` | event | |
| `epilogue` | `{ if, then }[]` | Checked after `event` runs, so flags it sets count. |
| `footer` | event | |
| `bareHanded?` | event | One-shot, for smashing `item` without the tool. |
| `bareHandedAgain?` | string | Later bare-handed attempts. |
| `wrongRoom?` | string | Smashing it with the tool somewhere else. |
