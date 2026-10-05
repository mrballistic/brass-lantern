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
| `events` | `Record<id, string[]>` | Line lists. `intro` plays when a new game starts. |
| `flagLabels` | `Record<label, flag id>` | Maps the lowercased label in `[Flag set: …]` lines to a flag ID. |
| `hints?` | `Hint[]` | HINT shows the first whose condition holds. |
| `scoring?` | `{ flag, points }[]` | SCORE sums points for set flags. |
| `maxScore?` | number | The total SCORE reports. Default: the sum of `scoring`. |
| `ranks?` | `{ min, title }[]` | The highest `min` the score reaches is the rank. |
| `idle?` | string | Reply to WAIT or SIT where they don't lead anywhere. Default: "Time passes." |
| `quit?` | string | Reply to QUIT. |
| `confused?` | string[] | Replies for input nothing understood, rotated. |
| `ambient?` | `Ambient[]` | Timed interruptions. |
| `finale?` | `Finale` | The win condition. |
| `verbs?` | `Record<id, WorldVerb>` | Verbs this world adds. See [World verbs](#world-verbs). |
| `style?` | `'brass'` or `'infocom'` | Output conventions. See [Style](#style). Default `'brass'`. |
| `emptyInventory?` | string | INVENTORY with nothing carried. Default: “You are empty-handed.” |
| `smashRefusal?` | string | SMASH where nothing can be smashed. |

## Room

| Field | Type | |
|---|---|---|
| `name` | string | Shown as the room header. |
| `description` | string | |
| `firstDescription?` | string | Replaces `description` on the first visit only. |
| `descriptions?` | `{ if, text }[]` | Descriptions that depend on the state of things (“a small window which is open”). The first whose condition holds replaces `description`. |
| `exits` | `Record<label, room id or Exit>` | What the player can type, and where it goes. Several labels per destination is normal. A label of `wait` or `sit` is taken by WAIT/SIT. See [Exit](#exit). |
| `listExits?` | label[] | What the exit line shows, in order; each gets the compass direction that leads the same way. Omit to list every label. |
| `items` | item ID[] | Items in the room at the start. |
| `npcs` | NPC ID[] | |
| `onEnter` | `{ if, then }[]` | Events fired on arrival when the condition holds. |
| `requires?` | condition | Must hold to enter. |
| `denial?` | string | Shown when `requires` fails. |
| `scenery?` | item ID[] | Items present here without being in the room: a door shared by two rooms, a window, the sky. Examinable and usable, never listed or taken. |
| `instead?`, `after?` | `Record<verb, Rule[]>` | Rules for verbs used in this room. See [Rules](#rules). |

### Exit

| Field | Type | |
|---|---|---|
| `to?` | room ID | Where it goes. Omit for an exit that only prints `denial` (“The door is boarded.”). |
| `if?` | condition | Must hold for this exit alone. |
| `denial?` | string | Shown when `if` fails, or always if there's no `to`. Default: “You can’t go that way.” |
| `door?` | item ID | An item with `door: true` that must be open. A closed door says “The *name* is closed.” |

Message-only exits aren't listed unless `listExits` names them.

## Item

| Field | Type | |
|---|---|---|
| `name` | string | Display name, and what event lines like `[Added to inventory: …]` match. Keep it unique. |
| `aliases?` | string[] | Other words players might use. Matched, never shown. |
| `description` | string | EXAMINE. |
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
| `text?` | string | What READ shows. Default: the description. |
| `initialDescription?` | string | Its own sentence in a room until first taken. |
| `roomDescription?` | string | Its own sentence in a room after that. Items with neither are gathered into “You can see: …”. |
| `switchable?` | boolean | TURN ON and TURN OFF work on it. |
| `light?` | boolean | Gives light while on (darkness arrives in a later release; listings say “providing light”). |
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

USE also covers OPEN, PUSH, PULL, PRESS, UNPLUG, ANSWER, INSERT, PUT/ATTACH X IN/ON/TO Y and INSTALL. SLEEP, NAP and GO TO BED mean USE BED, so give a bed-like item the alias `bed`. Using an item with `onWear` and no matching rule wears it.

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
| `go?` | boolean | Treat it as GO: through the target exit, or the exit labeled with the verb's ID. |

- A world verb does nothing by itself: give items or rooms `instead` rules for it.
- With no target, it looks for a rule on the room, then on anything in reach (SNOOZE finds the alarm clock).
- A word a built-in verb already uses (`take`, `open`, …) is ignored; `verbClashes(world.verbs)` lists any.

## Style

- **`'brass'`** (the default) lists items as “You can see: …”, says “Taken: lamp.”, and shows an exit line.
- **`'infocom'`** follows Zork's conventions:
  - “There is a sword here.” and “Taken.”;
  - no exit line;
  - a room you've visited shows just its name and contents unless you LOOK;
  - lists newest first;
  - SCORE says “Your score is 15 (total of 350 points), in 40 moves.”;
  - bookkeeping lines like `[Flag set: …]` act without being shown.

## NPC

| Field | Type | |
|---|---|---|
| `name` | string | |
| `description` | string | EXAMINE. |
| `onGive?` | `Record<item id, event>` | GIVE hands the item over and fires the event. |
| `refuse?` | `Record<item id, string>` | Declines that item; the player keeps it. |
| `refuseGift?` | string | Declines anything else. |

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
