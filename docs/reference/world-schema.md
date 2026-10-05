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
| `scoring?` | `{ flag, points }[]` | SCORE sums points for set flags; the maximum is the total. |
| `ranks?` | `{ min, title }[]` | The highest `min` the score reaches is the rank. |
| `idle?` | string | Reply to WAIT or SIT where they don't lead anywhere. Default: "Time passes." |
| `quit?` | string | Reply to QUIT. |
| `confused?` | string[] | Replies for input nothing understood, rotated. |
| `ambient?` | `Ambient[]` | Timed interruptions. |
| `finale?` | `Finale` | The win condition. |

## Room

| Field | Type | |
|---|---|---|
| `name` | string | Shown as the room header. |
| `description` | string | |
| `exits` | `Record<label, room id>` | What the player can type, and where it goes. Several labels per destination is normal. A label of `wait` or `sit` is taken by WAIT/SIT. |
| `listExits?` | label[] | What the exit line shows, in order; each gets the compass direction that leads the same way. Omit to list every label. |
| `items` | item ID[] | Items in the room at the start. |
| `npcs` | NPC ID[] | |
| `onEnter` | `{ if, then }[]` | Events fired on arrival when the condition holds. |
| `requires?` | condition | Must hold to enter. |
| `denial?` | string | Shown when `requires` fails. |

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
| `onSmash?` | event | Fires once, then the item is gone from the room. |
| `onSnooze?` | event | SNOOZE in its room. Repeatable, and changes nothing. |

### UseRule

Rules are tried in order and the **first** whose conditions hold runs. For two-object commands, rules on both items are checked, so one rule covers "put the disk in the drive" and "use the drive with the disk".

| Field | Type | |
|---|---|---|
| `if?` | condition | |
| `with?` | item ID | Another item that must be in the room or carried. If the player names a second object, it must be this one. |
| `then?` | event | |
| `say?` | string[] | Lines printed without changing anything. |

USE also covers OPEN, PUSH, PULL, PRESS, UNPLUG, ANSWER, INSERT, PUT/ATTACH X IN/ON/TO Y and INSTALL. SLEEP, NAP and GO TO BED mean USE BED, so give a bed-like item the alias `bed`. Using an item with `onWear` and no matching rule wears it.

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
