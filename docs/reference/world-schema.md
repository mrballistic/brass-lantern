# World schema

Every field a world can use. The source of truth is [`packages/engine/src/types/world.ts`](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/src/types/world.ts), which has a comment on each one. “Condition” means a [condition string](./conditions-and-events#conditions); “event” means a key in `events`.

## World

| Field | Type | |
|---|---|---|
| `startRoom` | room ID | Where a new game begins. |
| `onFoot?` | string[] | Terrains the player can walk into and get out of a vehicle in. Default `['land']`; a custom terrain is walkable only if listed. See [Vehicles](#vehicles). |
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
| `scoreLine?` | string | SCORE’s first line, replacing the style’s own. `{score}`, `{max}` and `{moves}` (“3 moves”) fill in: `'Your potential is {score} of a possible {max}, in {moves}.'` |
| `rankLine?` | string | SCORE’s rank line, replacing the style’s own. `{rank}` fills in: `'This score gives you the rank of {rank}.'` |
| `diagnose?` | `{ healthy?, wounded? }` | DIAGNOSE’s own lines for being unhurt and for being wounded, as fixed text. Unset, the engine’s wording stands. |
| `idle?` | string | Reply to WAIT or SIT where they don’t lead anywhere. Default: “Time passes.” |
| `quit?` | string | Reply to QUIT. |
| `confused?` | string[] | Replies for input nothing understood, rotated. |
| `ambient?` | `Ambient[]` | Timed interruptions. |
| `finale?` | `Finale` | The win condition. |
| `verbs?` | `Record<id, WorldVerb>` | Verbs this world adds. See [World verbs](#world-verbs). |
| `vars?` | `Record<name, number>` | Starting values for numeric variables. |
| `seed?` | number | Seeds the random generator, for reproducible games. Default: the clock. |
| `daemons?` | `{ if, then }[]` | Run after every turn the engine acts on, while `if` holds. `then` is an event name or steps. See [Time](#time). |
| `darkness?` | object | Texts and behavior for dark rooms. See [Darkness](#darkness). |
| `death?` | object | What dying does. See [Death](#death). |
| `endings?` | `Record<id, …>` | Named endings for the `end` effect. See [Endings](#endings). |
| `style?` | `'brass'` or `'infocom'` | Output conventions. See [Style](#style). Default `'brass'`. |
| `emptyInventory?` | string | INVENTORY with nothing carried. Default: “You are empty-handed.” |
| `smashRefusal?` | string | SMASH where nothing can be smashed. |
| `title?` | string | The game’s full title, for VERSION and Infocom-style transcripts (“ZORK I: The Great Underground Empire”). |
| `credits?` | string[] | Lines VERSION prints after the title. |
| `carry?` | `Carry` | Carrying weight. Without it there’s no limit. See [Weight](#weight). |
| `combat?` | `CombatRules` | The player’s side of fights. See [Combat](#combat). |
| `scripts?` | `Record<name, Script>` | The code hatch: functions that return steps. See [Scripts](#scripts). |
| `capture?` | `Capture` | Takes input anywhere, after the room’s own capture. See [Capture](#capture). |
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
| `descriptionScript?` | script name | A [script](#scripts) whose `say` lines (joined with newlines) are the description, ahead of `firstDescription` and `descriptions`. It runs on every look, so it describes the game as it is now. Any step that isn’t a `say` is ignored (and the audit flags it), a script that says nothing falls back to the next description, and the engine restores the seed afterwards, so describing never changes the game. |
| `exits` | `Record<label, room id or Exit>` | What the player can type, and where it goes. Several labels per destination is normal. A label of `wait` or `sit` is taken by WAIT/SIT. See [Exit](#exit). |
| `listExits?` | label[] | What the exit line shows, in order; each gets the compass direction that leads the same way. Omit to list every label. |
| `items` | item ID[] | Items in the room at the start. |
| `npcs` | NPC ID[] | |
| `onEnter` | `{ if, then, repeat? }[]` | Events fired on arrival when the condition holds: once per game, or every time with `repeat: true`. |
| `requires?` | condition | Must hold to enter. |
| `denial?` | string | Shown when `requires` fails. |
| `scenery?` | item ID[] | Items present here without being in the room: a door shared by two rooms, a window, the sky. Examinable and usable, never listed or taken. |
| `instead?`, `after?` | `Record<verb, Rule[]>` | Rules for verbs used in this room. See [Rules](#rules). |
| `tags?` | string[] | Free-form labels for scripts to read (`maze`, `sacred`). The engine doesn’t. |
| `capture?` | `Capture` | Takes input here before it’s parsed. See [Capture](#capture). |
| `water?` | boolean or condition | Water (Zork’s NONLANDBIT): only a water vehicle goes here. A condition for a room that changes (a reservoir that drains: `'!flag:low_tide'`). See [Vehicles](#vehicles). |
| `air?` | boolean or condition | Air (Zork II’s balloon): shorthand for `terrain: 'air'`. Same shape as `water`. |
| `terrain?` | string | What kind of ground this is, for vehicles. Default `'land'` (or `'water'` / `'air'` where those shorthands hold); a set `terrain` wins over them. Any name works (`'sand'`). See [Vehicles](#vehicles). |
| `onEnd?` | `{ if, then }[]` | Run at the end of every command here, after the action and before the clock (Zork’s M-END). After WAIT’s turns when `wait` is set. |

### Exit

| Field | Type | |
|---|---|---|
| `to?` | room ID | Where it goes. Omit for an exit that only prints `denial` (“The door is boarded.”). |
| `if?` | condition | Must hold for this exit alone. |
| `denial?` | string | Shown when `if` fails, or always if there’s no `to`. Default: “You can’t go that way.” |
| `door?` | item ID | An item with `door: true` that must be open. A closed door says “The *name* is closed.” |
| `denials?` | `{ if, text }[]` | Refusals with their own reasons, checked first; the first whose `if` holds refuses with `text` (Zork’s chimney). |
| `then?` | event | Runs as the player goes through, before arriving (Zork’s exit routines). |

Message-only exits aren’t listed unless `listExits` names them.

## Item

| Field | Type | |
|---|---|---|
| `name` | string | Display name, and what event lines like `[Added to inventory: …]` match. Keep it unique. |
| `aliases?` | string[] | Other words players might use. Matched, never shown. |
| `descriptionScript?` | script name | A script whose `say` lines are EXAMINE’s text, ahead of `description` (same rules as a room’s). See [Descriptions from state](#descriptions-from-state). |
| `description` | string | EXAMINE. Leave it empty (`''`) and EXAMINE does what Zork does for an object with no text: a container lists what’s in it or says “The *name* is empty.”; anything else is “There’s nothing special about the *name*.” |
| `portable` | boolean | Can it be taken? |
| `refusal?` | string | Reply to taking a non-portable item. |
| `tags` | string[] | Free-form; the engine doesn’t read them. |
| `onTake?` | event | Fires the first time it’s taken. |
| `onUse?` | `UseRule[]` | See below. |
| `onWear?` | event | Fires the first time it’s worn; WEAR again says “already wearing”. |
| `onSmash?` | event | Fires once, then the item is gone. |
| `contains?` | item ID[] | Items that start inside or on this one. |
| `container?` | `Container` | Makes it a container. See below. |
| `surface?` | boolean | Things can be put on it; what’s on it is always visible and reachable. |
| `scenery?` | boolean | Present but never listed (the house, the forest). |
| `door?` | boolean | A door between rooms; exits name it. Uses `container` for openable/open/locked/key. |
| `size?` | number | Its weight, in worlds with `carry` (Zork’s SIZE). Default 5. |
| `weapon?` | boolean | Something to fight with. |
| `vehicle?` | `{ travels, restsOn?, landing?, leave?, arrive?, lookScript? }` | Something the player can get into and travel in. See [Vehicles](#vehicles). |
| `onEnd?` | `{ if, then }[]` | A vehicle’s end routines: while the player is aboard they run instead of the room’s. |
| `burnable?` | boolean | BURN can set it alight (Zork’s BURNBIT). |
| `flaming?` | boolean | It can set things alight: always, or while it’s on if it switches (Zork’s FLAMEBIT). |
| `treasure?` | number | What it’s worth (Zork’s TVALUE). The engine doesn’t read it; scripts and scoring can. |
| `text?` | string | What READ shows. Default: the description. |
| `initialDescription?` | string | Its own sentence in a room until first taken. |
| `roomDescription?` | string | Its own sentence in a room after that. Items with neither are gathered into “You can see: …”. |
| `roomDescriptionScript?` | script name | A world script whose `say` lines are its room sentence, ahead of both (Zork’s DESCFCN). It says everything itself: no “(outside the raft)” follows, and its contents aren’t listed. One that says nothing falls back to the others. |
| `climbRefusal?` | `{ if?, text }` | Infocom style: climbing it up or down where there’s no way that way says `text` (Zork’s tree: “There are no climbable trees here.”). |
| `switchable?` | boolean | TURN ON and TURN OFF work on it. |
| `light?` | boolean | Gives light while on: it lights a dark room it’s in, carried there, or inside something open or transparent there. |
| `home?` | room ID | Where it goes if the player dies carrying it. |
| `article?` | string | “a”, “an”, “some” or “” in listings. |
| `contentsHeading?` | string | The heading over its contents (“Your collection of treasures consists of:”). |
| `instead?`, `after?` | `Record<verb, Rule[]>` | See [Rules](#rules). |

### Container

| Field | Type | |
|---|---|---|
| `openable?` | boolean | Has a lid or door. Containers that aren’t openable are always open. |
| `open?` | boolean | Starts open. |
| `locked?` | boolean | Starts locked. |
| `key?` | item ID | Locks and unlocks it. |
| `transparent?` | boolean | You can see inside even when it’s closed. |
| `capacity?` | number | How many items fit directly inside. |
| `weight?` | number | The total weight it holds (Zork’s CAPACITY), in worlds with `carry`. |
| `opened?`, `closed?` | string | Lines for opening and closing it, instead of the defaults. |

You can see into a surface, an open container or a transparent one; you can reach into a surface or an open container. The parser only matches what you can see, and taking something you can see but can’t reach says which container is closed.

### UseRule

Rules are tried in order and the **first** whose conditions hold runs. For two-object commands, rules on both items are checked, so one rule covers “put the disk in the drive” and “use the drive with the disk”.

| Field | Type | |
|---|---|---|
| `if?` | condition | |
| `with?` | item ID | Another item that must be in the room or carried. If the player names a second object, it must be this one. `'number'` matches a command whose second object is a number typed by the player (TURN DIAL TO 4); test which with `number:`. |
| `then?` | event | |
| `say?` | string[] | Lines printed without changing anything. |

USE also covers PUSH, PULL, PRESS and ATTACH X TO Y. OPEN and PUT fall back to an item’s use rules when it isn’t a container (or isn’t in your hands), so OPEN DRAWER works on a drawer that has only a use rule. Using an item with `onWear` and no matching rule wears it. Verbs like SLEEP, UNPLUG or INSTALL are [world verbs](#world-verbs) now: declare them and give items `instead` rules.

## Rules

Items and rooms can carry rules for any verb, built-in or declared by the world:

```ts
instead: { move: [{ if: 'flag:rug_moved', say: ['It won’t budge again.'] }, { then: 'rug_moved' }] },
after: { take: [{ if: '!flag:took_egg', then: 'took_egg' }] },
```

- **`instead`** rules run in place of the verb’s default.
- **`after`** rules run after the default succeeds and changes something.
- **Lookup order:** the target item’s rules, then the indirect item’s, then the room’s. The first rule whose `if` holds (and whose `with` matches the other object, when given) wins.
- A rule is the same shape as a UseRule (above).
- **`as: 'target'` or `'indirect'`** limits a rule to its item’s role in the command (Zork’s PRSO and PRSI): a tube that refuses things put *into* it, not itself put somewhere.
- **`prep`** limits it to a preposition: `prep: 'in'` answers PUT … IN, not PUT … ON.
- **In Infocom style** the second object’s rules are asked before the first’s, as Zork’s PERFORM does (POUR WATER ON BELL asks the bell first).
- **`continue: true`** on an `instead` rule runs it and then lets the verb’s default go on as well (Zork’s “print, then RFALSE”): a line before the TAKE that still happens.
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
| `target` | `'none'`, `'optional'`, `'required'` or `'text'` | `'text'` takes the rest of the line as typed words (SAY, ANSWER), read by `said:`. |
| `indirect?` | string[] | Prepositions that introduce a second object (`with`, `on`). |
| `reply?` | string | When no rule applies. Default: “Nothing happens.” `{target}` is replaced by the object’s name, `{a target}` by its name with an article. |
| `held?` | boolean | The object must be something you hold, or can see inside something you hold (Zork’s HELD): POUR WATER means the water in your bottle. |
| `go?` | boolean | Treat it as GO: through the target exit, or the exit labeled with the verb’s ID. |
| `afterBuiltIns?` | boolean | Its words may be built-in words: it reads only lines no built-in verb reads, after them (Zork III’s bare TURN DIAL, where the engine’s TURN wants TO or WITH). |

- A world verb does nothing by itself: give items or rooms `instead` rules for it.
- With no target, it looks for a rule on the room, then on anything in reach (SNOOZE finds the alarm clock).
- A word a built-in verb already uses (`take`, `open`, …) is ignored, unless the verb is `afterBuiltIns`; `auditWorld` reports any (“verb word … is a built-in”).

## Style

- **`'brass'`** (the default) lists items as “You can see: …”, says “Taken: lamp.”, and shows an exit line.
- **`'infocom'`** follows Zork’s conventions:
  - “There is a sword here.” and “Taken.”;
  - no exit line;
  - a room you’ve visited shows just its name and contents unless you LOOK (SUPERBRIEF shows only the name, in either style);
  - lists newest first;
  - SCORE says “Your score is 15 (total of 350 points), in 40 moves.”, and (like VERBOSE, BRIEF and SUPERBRIEF) runs no clock: no move, no timers, though the room’s end routine still runs;
  - the header shows the room, score and moves, like Zork’s status line;
  - questions, TAKE ALL and transcripts use Zork’s wording;
  - bookkeeping lines like `[Flag set: …]` act without being shown;
  - each thing’s contents are listed right after it;
  - READ takes the thing first (“(Taken)”), EXAMINE of a thing with no description reads it, and opening a container whose one untouched thing has a first-seen sentence says “The coffin opens.” and that sentence;
  - a door with no lines of its own “opens” and “is now closed”, and OPEN and CLOSE say “It is already open.” and “It is already closed.”;
  - PUT … ON something that isn’t a surface says “There’s no good surface on the …”;
  - a room’s `scenery` (Zork’s local globals) only answers to a word when nothing else in reach does;
  - the second object’s rules come before the first’s;
  - untouched things’ first-seen sentences are listed before everything else;
  - EXAMINE of a closed box says “The box is closed.”

## Time

After every turn the engine acts on (never after a misunderstood command), these happen in order:

1. **The room’s end routines** (`onEnd`, Zork’s M-END).
2. **Fuses** count down, and those reaching zero run. A fuse is set by the `schedule` effect and removed by `cancel`; one set during a turn starts counting the next turn.
3. **Daemons** run, in order, each while its `if` holds.
4. **Ambient lines** print.

A lamp that burns down is a variable and a few daemons:

```ts
vars: { lamp_fuel: 185 },
daemons: [
  { if: 'on:lamp', then: [{ add: 'lamp_fuel', by: -1 }] },
  { if: 'on:lamp & var:lamp_fuel=85 & here:lamp', then: ['The lamp appears a bit dimmer.'] },
  { if: 'on:lamp & var:lamp_fuel<0', then: 'lamp_dies' },
],
```

With the world’s `wait` set, WAIT runs steps 1 to 3 up to that many times, stopping after one where something happened (a line printed or a fuse fired), and the room’s end routines run after them.

A **move** is one of these turns: MOVES in the header and SCORE count them. Commands that take no game time (VERBOSE, BRIEF, SUPERBRIEF, UNDO, SAVE, RESTORE, SCRIPT, VERSION, a question back to the player) don’t count, and nothing runs after them.

## Darkness

| Field | Type | |
|---|---|---|
| `look?` | string | LOOK and arriving in an unlit dark room. Default: “It is pitch black.” |
| `tooDark?` | string | Acting on something you can’t see. Default: “It’s too dark to see.” |
| `fall?` | string | When the room goes dark around you. Default: “It is now pitch black.” |
| `arrive?` | string | Said on arriving in an unlit room, before its darkness line (Zork’s “You have moved into a dark place.”). |
| `stumble?` | `{ chance, then, aboard? }` | Walking from an unlit dark room into another: `chance`% of `then` instead (Zork’s grue, 80), or `aboard` in a vehicle. |
| `litIf?` | condition | While it holds, every room is lit (Zork’s ALWAYS-LIT, for a spirit). Mustn’t use `lit:`. |
| `blunder?` | `EventStep[]` | Run when the player tries a direction with no exit in the dark. Zork’s grue: `[{ chance: 80, then: [{ die: '…' }], else: ['You can’t go that way.'] }]`. |

In an unlit dark room you can only find what you’re carrying. Trying to act on anything else gets `tooDark`: an understood refusal, so the intent server isn’t asked to re-guess. Turning a light on or off says so (`fall`, or the room’s description).

## Death

| Field | Type | |
|---|---|---|
| `message?` | `(string or { if, text })[]` | Printed after the cause; an entry with `if` only while it holds (Zork’s “Bad luck, huh?”). |
| `penalty?` | number | Added to the score. |
| `lives?` | number | Deaths survived before the final one. |
| `respawn?` | room ID | Where the player wakes. |
| `resurrection?` | string[] | |
| `scatter?` | room ID[] | Carried things are spread over these, at random (seeded). Things with a `home` go there instead; with no scatter rooms, they stay where the player fell. |
| `treasures?` | `'dark'` or `{ to }` | `'dark'`: treasures go to an unlit land room instead, walking the rooms in order at even odds each (Zork’s RANDOMIZE-OBJECTS). `{ to: 'case' }`: treasures without a `home` all go to that room, item or character (a trophy case), drawing no randomness. |
| `keepTimers?` | event[] | Timers a death leaves running, with their counts. Every other timer is cleared. |
| `final?` | string[] | The last death, which ends the game. |
| `then?` | event | Runs after a resurrection, to reset things (Zork’s trap door, unbarred). |
| `variants?` | `{ if, resurrection?, respawn?, then?, before? }[]` | The first whose `if` holds (decided as you die) replaces those fields; `before` runs ahead of the respawn. Zork sends you to Hades as a spirit once you’ve seen the Altar. |
| `instead?` | `{ if, lines }[]` | Checked first: the first that holds prints its lines (not the cause) and ends the game. Dying while already dead. |

The `die` effect uses it. Without a `death` block, dying prints the cause and ends the game. Pending fuses are canceled on death, except those in `keepTimers`.

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
| `holds?` | item ID[] | What it carries at the start. Things a character holds can’t be seen or taken. |
| `descriptions?` | `{ if, text }[]` | Its line in the room and its EXAMINE reply, by state; the first whose condition holds wins. |
| `descriptionScript?` | script name | A script whose `say` lines are that description, ahead of `descriptions`. |
| `instead?`, `after?` | `Record<verb, Rule[]>` | Rules for verbs aimed at it: THROW X AT it, GIVE, TAKE, a world verb. |
| `combat?` | `Combatant` | Makes it someone you can fight. See [Combat](#combat). |
| `aliases?` | string[] | Other words for it (“robber”, “man”). |
| `scenery?` | boolean | Present but not listed: the room’s own description mentions it (Zork’s cyclops). `{ npcState, scenery }` changes it in play. |
| `hidden?` | boolean | Starts hidden: in its room for scripts, but not seen, listed, matched or fought until revealed. |
| `topics?` | `Record<topic, string or { if?, text }[]>` | ASK or TELL it ABOUT a topic. A list is tried in order; the first entry whose `if` holds answers. Text that names an event runs it. |
| `topicAliases?` | `Record<topic, string[]>` | Other words for a topic. |
| `noTopic?` | string | For a topic it has nothing on. Default: its TALK TO line. |
| `refuseOrder?` | string | Its answer to an order. Default: “*Name* ignores you.” |
| `orders?` | `Record<verb, Rule[]>` | Rules for orders, by the inner command’s verb. See [Orders](#orders). |
| `obeys?` | `('go' \| 'take' \| 'drop' \| 'give')[]` | Built-in orders it carries out itself when no order rule answers. |
| `obeyReplies?` | `Record<verb, string>` | Its acknowledgement when it obeys one of those. Default: “Okay.” |
| `follows?` | condition | While it holds, the character goes where the player goes. See [Followers](#followers). |
| `followLine?` | string | What it says on arriving after you. Unset: brass style prints “*Name* follows you.”; Infocom style prints nothing. |
| `heardFrom?` | room ID[] | Rooms from which the player can give it orders while it’s elsewhere (Zork III’s dungeon master on the parapet, ordered from the cell); its orders are carried out where it stands. |

Characters’ places and states live in the game state (`npcs`), starting from the rooms that list them. In brass style the room shows “Present: …”; in Infocom style each character prints its own line.

**Hidden characters.** A character that’s `hidden` (from the start, or by the `npcState` effect with `hidden: true`) is still in its room: `ctx.npcIn` and conditions like `with:` see it, but the player doesn’t, and it doesn’t fight. `{ npcState: 'thief', hidden: false }` reveals it. The `seen:` condition is true only when it’s in the player’s room and not hidden.

### Orders

“*name*, *command*”, “tell *name* to *command*” and a bare “tell *name*” are orders. What happens, in order:

1. **`instead.order`** rules on the character answer first, as for any verb. In one, `ctx.command.words.indirect` is the order as typed. A character with only `instead.order` (no `orders`, no `obeys`) answers, or says `refuseOrder`, and the rest of the line carries on.
2. Otherwise the order is read as a command of its own, with its objects resolved among what the character can reach in **its** room (ME or MYSELF is the player, YOURSELF the character itself; a number typed as an object counts). A word that names nothing there is a miss that changes nothing, so the intent server may still read it; one that matches several things asks which, taking no time. A character can’t refer to what the player carries.
3. **`orders`** rules are keyed by the inner command’s verb: `orders: { push: [...], take: [...] }`. They are the same shape as other [rules](#rules), and their conditions see the inner command (`target:`, `indirect:`, `number:`, `said:`, `direction:`). **The first word typed is tried first**, when it has a table (PUSH reads as USE, so “robot, push the button” runs `orders.push` even when `orders.use` exists); otherwise the parsed verb’s table (“robot, press the button” runs `orders.use`). A rule with `continue: true` runs and then lets step 4 go on.
4. If no rule answered and the verb is in `obeys`, the character performs it, saying `obeyReplies[verb]` (default “Okay.”):
   - **`go`**: it walks that exit of its room. Nothing is printed but its reply: no leaving or arriving lines. No exit, or one that refuses, is a miss that says why (“The robot can’t go that way.”). In Infocom style it walks as the player does: no exit says “You can’t go that way.”, and an exit that refuses says its own refusal.
   - **`take`** and **`drop`**: the thing moves to or from the character (weight limits apply only to the player). One it can’t take or drop is a miss that says why, by name: “The robot can’t take the dial.”, “The robot doesn’t have the sock.” In Infocom style a take it can’t do says the player’s own take line.
   - **`give`**: “give me the key” moves it from the character to the player (the second object is the player).
5. Otherwise `refuseOrder`, or “*Name* ignores you.”

**An order to a character with `orders` or `obeys` ends the rest of the line** (Zork clears the typed-ahead commands), unless it was a miss. That includes an obeying character’s refusal, which takes a turn like any understood command. A character with neither answers orders only through `instead.order` and `refuseOrder`.

**`heardFrom`** lists rooms from which the player can give a character orders while it’s somewhere else. Its orders are carried out where it stands (Zork III’s dungeon master, ordered from the cell while he stands on the parapet).

```ts
robot: {
  name: 'robot',
  obeys: ['go', 'take'],
  obeyReplies: { go: 'Whirr, buzz, click!' },
  orders: {
    push: [{ if: 'target:red_button', then: 'lift_cage' }],
    use: [{ say: ['The robot ignores that.'] }], // “robot, press the button”; “robot, push the button” runs orders.push
  },
},
```

### Followers

`follows` is a condition on the character; while it holds, after each move the **player** makes (GO, doors, ENTER, CLIMB; not a script’s `goTo` or a `moveVehicle`), the character moves into the player’s new room if it was in the room the player left, and is awake and not hidden. It’s checked after the move, so `in:ROOM` sees the new room. Its `followLine` prints as it arrives. The `follow` and `unfollow` effects set and clear the character’s `following` state (an optional field of its game state, not a flag), which `following:NPC` reads, for a switch rather than a condition. Characters who arrive take the engine’s placing order, so room listings keep it.

## Weight

```ts
carry: { limit: 100, self: 5, fumble: { over: 7, chance: 8 } },
```

| Field | Type | |
|---|---|---|
| `limit` | number | The total weight the player can carry when healthy. |
| `self?` | number | The player’s own weight, counted in (Zork’s ADVENTURER is 5). |
| `fumble?` | `{ over, chance }` | Carrying more than `over` things, each TAKE has `count × chance` percent to fumble. |
| `tooHeavy?`, `tooHeavyHurt?`, `fumbled?` | string | The refusals. |

An item weighs its `size` plus everything inside it. Wounds lower the limit and healing restores it.

## Combat

A character with `combat` can be fought: ATTACK *it* WITH *a weapon*. The engine owns the mechanics, ported from Zork I: strength against strength picks one of six blow tables, and a seeded roll picks the result (missed, staggered, wounded, knocked out, killed, disarmed). After every turn the engine acts on, characters in the room who are fighting swing back.

| `Combatant` field | Type | |
|---|---|---|
| `strength` | number | The troll: 2. |
| `weapon?` | item ID | What it fights with, while it holds it. |
| `fears?` | `{ item, by }` | The player’s weapon that weakens it (the troll fears the sword, by 1). |
| `wake?` | number | Percent added each turn to its chance of waking while out cold. Default 25. |
| `firstStrike?` | number | Percent chance each turn to start a fight while you’re in the room. |
| `messages?` | `Partial<Record<BlowResult, string[]>>` | Its blows at the player, one picked at random. `{weapon}` and `{defender}` are filled in. |
| `onDeath?`, `onUnconscious?`, `onWake?` | event | When it dies, is knocked out, comes round. |
| `onBusy?` | event | Instead of swinging when its weapon is on the floor (the troll recovers his axe). |

| `CombatRules` field | Type | |
|---|---|---|
| `messages?` | same | The player’s blows. |
| `strength?` | `{ min, max }` | The player’s strength, from `min` at no score to `max` at `maxScore` (Zork: 2 to 7). |
| `cureWait?` | number | Turns for one wound to heal (Zork: 30). |
| `texts?` | `Partial<Record<CombatText, string>>` | Fixed lines: refusals, the death line, the fog. Defaults: Zork’s words in Infocom style, short ones in brass. |

**In Infocom style** ATTACK works the way Zork’s parser does: with one weapon in hand, `kill troll` picks it (“(with the sword)”); otherwise it asks what to attack with; a weapon you aren’t holding is refused without taking a turn. DIAGNOSE reports your wounds. A [recipe](../guide/building-worlds/recipes#a-guard-to-fight) shows a whole fight.

## Numbers, typed words and prepositions

**Numbers.** A number in an object slot is the player’s typed number (Zork’s INTNUM): `turn dial to 4`, `set year to 776`. It’s digits up to 1000, or H:MM as minutes (hours under 8 count as afternoon); a bigger number is just an unknown word. Both forms are built-in and go through rules as the verb `turn` with the second object `number`. With no rule, Infocom style says Zork’s “This has no effect.”; brass style misses, so the intent server may still read the input. A bare TURN X keeps its own meaning. The command keeps the digits as typed, so a number no rule wants misses with them (“take 5”: “You don’t see a “5” here.”); `number` is a reserved ID, like `player`. Digits that name a thing in sight or a character here (an item named “locker 12” or aliased `5`; whole words only, so “1” is not locker 12) are that thing, as Zork’s parser reads a word it knows before trying a number: `turn dial to 12` with locker 12 present is TURN DIAL WITH the locker, its rules fire, and `number:12` still holds. Only when nothing is called that are the digits `number`. TURN X WITH a thing, with no rule, says “This has no effect.” in every style.

```ts
dial: {
  instead: { turn: [
    { with: 'number', if: 'number:4', then: 'door_opens' },
    { with: 'number', say: ['The dial clicks and nothing happens.'] },
  ] },
},
```

- **`number:N`** and `number<op>N` read it in conditions; **`{ setVar: 'year', from: 'number' }`** stores it; **`{number}`** in a line prints it, and `ctx.number` has it in a script.
- A rule with `with: 'number'` matches only a command whose second object is a number.
- An order can carry one (“robot, turn the dial to 4” runs `orders.turn` with `number:4`).

**Typed words.** A world verb with `target: 'text'` (SAY, INCANT, ANSWER) takes the rest of the line as typed words. They are never resolved to things, so naming nothing is no miss. Outer quotes are dropped and whitespace collapsed. **`said:WORDS`** matches them as lowercase whole words, with punctuation and quotes ignored (`said:a well` matches `answer “A well.”`), and `ctx.text` has them. The verb consumes the whole rest of the line, so it ends the line: `say "well". west` drops WEST, as in Zork. A quoted phrase isn’t split at its full stops or commas. Only double quotes (straight or curly) quote; a single quote is an apostrophe (`answer 'don't know'` keeps every word). This applies to every world: a quoted “. ” doesn’t end a command. Unlike Zork, where only a quoted phrase is typed words, **unquoted text counts too**: `answer well` solves a riddle that wants “a well”.

**Prepositions.** These forms go through the ordinary rules. With no rule, Infocom style gives Zork’s reply below; brass style misses with the same line (all but READ, which reads), so the intent server can still read the input. A rule answers in both styles.

| Form | Rule verb | Built-in reply |
|---|---|---|
| PUT/PUSH/SLIDE X UNDER Y | `put`, `prep: 'under'` | “You can’t do that.” |
| PUT X BEHIND Y | `put`, `prep: 'behind'` | “That hiding place is too obvious.” |
| THROW X OFF/OVER Y | `throw`, `prep: 'off'` or `'over'` | “You can’t throw anything off of that!” |
| READ X THROUGH/WITH Y | `read`, with the second object | reads X |
| PUSH X *direction*, PUSH X TO Y | `push`, `direction:DIR` / the second object | “You can’t push things to that.” |

**ME.** ME and MYSELF in an object slot name the player; so do SELF and YOURSELF, unless something in sight (or someone here) is named or aliased that. Rules match them with `target:player` or `indirect:player` (and `with: 'player'`). The engine adds no replies of its own for ME: a verb aimed at it with no rule misses with the word typed (“You don’t see a “me” here.”), so a world says what Zork says (“You can’t tie anything to yourself.”) in a rule. The reserved ID `player` is never matched against a thing’s or character’s name (a “record player” is safe from TAKE ME); typed, “player” is an ordinary word. In an order, ME is the speaker (“robot, give me the key”) and YOURSELF the character (“robot, push yourself”).

## Descriptions from state

- **Templates.** `{var:NAME}` (0 when unset) and `{number}` fill in from the game in any room, item or character description, a `descriptions` entry and an event line. A `{number}` with no number typed stays as written. Expanding reads the game and changes nothing.
- **`descriptionScript`** on a room, item or character names a [script](#scripts) that builds the description from the game: its `say` lines, joined with newlines. It comes first, ahead of `descriptions`, `firstDescription` and `description`. It’s for descriptions a condition list can’t say: a grid of cells, a dial’s setting, a room that lists its own exits.
- **`roomDescriptionScript`** on an item is its sentence in a room listing, ahead of its other sentences; it says everything itself, so no “(outside the boat)” follows and its contents aren’t listed (Zork’s DESCFCN).
- **`vehicle.lookScript`** describes a vehicle from inside. See [Vehicles](#vehicles).
- A description script may use `ctx.roll`, but the engine puts the seed back afterwards, so looking never changes the game. A script that says nothing falls back to the next description. The audit runs each description script once on a new game and flags a step that isn’t a `say`, or a script name that doesn’t exist.

## Scripts

The code hatch, for behavior data can’t express (a thief’s mind, a sword that glows near monsters):

```ts
scripts: {
  fortune: (ctx) => [ctx.roll(3) === 1 ? '“Beware of geese.”' : '“Soup is coming.”'],
},
events: { reading: [{ script: 'fortune' }] },
```

A script gets a read-only view of the game and returns ordinary steps, which the engine runs. `ctx` has:
- `state` (frozen in development and tests), `world`;
- `random()` and `roll(n)`, from the game’s seeded generator, so saves and UNDO replay exactly;
- `here(id)`, `carried(id)`, `holder(id)`, `room()`, `npc(id)`;
- `npcIn(id, room)` (hidden or not), `hidden(id)`;
- `aboard()`, the vehicle the player is in, `water(room?)` and `terrain(room?)` (the room’s terrain name);
- `rooms()` in the world’s order, `visited(room)`, `tags(room)`, `lit(room?)`;
- `children(place)`, what’s directly in a room, item or character, in listing order;
- `test(condition)`, whether a [condition](./conditions-and-events#conditions) holds now, through the engine’s own parser (scripts never parse conditions themselves);
- `exits(room)`, the exits the player could take from that room now (`{ direction, to }[]`): the exit’s `if` holds and its door is open;
- `resolve(words, scope?)`, words read as an item the way the parser would: `'here'` (within reach, the default), `'held'` or `'all'`; null if none matches;
- `number` and `text`, the number or the typed words in the command being run (TURN DIAL TO 4, SAY HELLO);
- `treasure(id)`, an item’s `treasure` value or 0;
- `playerStrength()`, the player’s fight strength now;
- `line`, the raw input, and `action`, the parsed command, when a [capture](#capture) runs the script; `parse(text)`, which reads a command with the world’s verbs as the parser would;
- `arg`, from `{ script, arg }`;
- `command`, the command being run with its objects resolved to IDs, when a rule ran the script. `command.words` keeps the words typed for objects that didn’t resolve.

Scripts run only where events run, so a command the engine didn’t understand still changes nothing. The world audit fails on a `script` effect naming no script. See the [scripts recipe](../guide/building-worlds/recipes#scripts).

## Vehicles

```ts
raft: { name: 'raft', vehicle: { travels: 'water' }, container: { open: true }, … },
pond: { name: 'Pond', water: true, … },
```

- **BOARD** (GET IN, CLIMB IN) gets in a vehicle that’s on the ground here; **DISEMBARK** (GET OUT, GET OFF, STAND) gets out, except where the room’s terrain isn’t one the player walks (water, air, sand unless `onFoot` lists it): “You realize that getting out here would be fatal.” While aboard, EXIT on its own is DISEMBARK too (Zork’s V-EXIT); otherwise it’s the direction out. In Infocom style, DISEMBARK with no object names the one vehicle in sight: “(raft)”.
- **Terrains:** every room has one: `terrain`, or `'water'` / `'air'` from those shorthands, else `'land'`. The world’s `onFoot` (default `['land']`) lists those the player walks on. A vehicle’s `travels` is a terrain name or list (`['land', 'sand']`); the old `'water'`, `'air'` and `'none'` still work (`'none'` is `[]`: it never moves). Its `restsOn` (default `['land']`, unless it travels on land) are the terrains it comes to rest on from one it travels, and it can’t cross from one to another.
- **Moving:** on foot, a room’s terrain must be in `onFoot`, else “You can’t go there without a vehicle.” Aboard, the destination’s terrain must be in `travels`, or in `restsOn` while you’re on a terrain in `travels`, else “You can’t go there in a raft.” (a vehicle won’t go overland). The vehicle goes wherever you go, scripted moves included, and you stay aboard.
- **Landing:** `landing` (the same forms as `leave`) is said as the vehicle comes onto a `restsOn` terrain from a traveled one you can’t walk on (`landing: 'The balloon lands.'`). Unset, a water vehicle says Zork’s “The raft comes to a rest on the shore.” and a blank line; others say nothing.
- **`leave` / `arrive`:** said as it leaves with you aboard (before the new room) and as it arrives (after), and by `{ moveVehicle }`. `leave` is worked out in the room being left (a script’s `ctx.room()` is the origin, and its draw comes before any grue draw), once the move is known to be allowed. `arrive` and `landing` are worked out in the new room. Each of the three is a string, a list (one line picked with the seeded generator; a plain string draws nothing), or `{ script: 'name' }` (that script’s `say` lines print; its other steps don’t run). A script’s draws from the generator are kept, unlike a description script, which restores the seed. The audit runs each script once and flags any step that isn’t a `say`. Example: a dune buggy over a sand maze is `vehicle: { travels: ['land', 'sand'], leave: ['The engine roars.', 'Sand sprays.'] }` with the maze rooms `terrain: 'sand'`.
- **Aboard:** DROP puts things in the vehicle, TAKE *vehicle* says “You’re inside of it!”, and the room’s things stay in reach. The vehicle’s rules are asked before the room’s (Zork’s M-BEG): an `instead.go` on it can refuse directions. Its `onEnd` runs in place of the room’s. GO goes through rules too, so a room can have `instead.go` rules.
- **Looking:** the header names the vehicle (“Pond, in the raft”); the vehicle isn’t listed, its contents are; in Infocom style the room’s things are “(outside the raft)”, as Zork’s PRINT-CONT does. A vehicle’s `lookScript` (`vehicle: { travels: 'air', lookScript: 'basketLook' }`) describes it from inside: its `say` lines follow the room’s description, and the name on a brief arrival, but not a room whose own `descriptionScript` described it in full (Zork’s vehicle M-LOOK, which a room’s M-LOOK cuts off).
- Dying takes you out of the vehicle, which stays where you died. Conditions `aboard`, `aboard:ITEM`, `water:here|ROOM` and `terrain:NAME[:here|ROOM]`; effects `{ board }` and `{ disembark }`; script helpers `ctx.aboard()`, `ctx.water(room?)` and `ctx.terrain(room?)`.

See the [raft recipe](../guide/building-worlds/recipes#a-raft-on-a-pond).

## Capture

```ts
capture: { if: '!flag:quiet', script: 'echo' },
```

A room’s capture, then the world’s, sees each command of a line before it’s parsed, while its `if` holds. The script reads `ctx.line` and returns steps to take it, or nothing to let it parse as usual. Add `{ free: true }` for a reply that takes no time.

It also sees commands that arrive already parsed (AGAIN, OOPS, an answer to a question, the intent server’s reading), with `ctx.line` unset and `ctx.action` holding the command, so a limit like a spirit’s can’t be slipped past. A capture that only cares about raw words returns nothing when `ctx.line` is unset.

- Taking a command ends the line: the rest is dropped, as Zork’s Loud Room drops it.
- It runs ahead of the intent server, so captured input is never sent to the LLM.
- SAVE, RESTORE, UNDO and the other store commands come first, so a capture can’t trap the player; it never runs once the game is over.
- A capture that declines changes nothing, even if it rolled the dice.

Zork uses it twice: the Loud Room, which hears everything as noise until you say ECHO, and a spirit’s limits (DEAD-FUNCTION) after death. See the [listening room recipe](../guide/building-worlds/recipes#a-room-that-listens).

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
