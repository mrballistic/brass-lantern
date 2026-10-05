# Conditions and events

## Conditions

Conditions are strings, used by `requires`, `onEnter`, use rules, dialogue keys, hints, the finale's epilogue and ambient lines. One parser handles all of them (`src/engine/conditions.ts`).

| Condition | True when |
|---|---|
| `flag:NAME` | the flag is set |
| `has:ITEM` | the item is in the inventory |
| `in:ROOM` | the player is in that room |
| `visited:ROOM` | the player has been there |
| `inside:ITEM:PLACE` | the item is directly in PLACE: a room, another item, or `player` |
| `open:ITEM` | the container or door is open |
| `locked:ITEM` | it's locked |
| `on:ITEM` | it's switched on |
| `here:ITEM` | the player can reach it (in the room, carried, or in something open) |
| `!…` | negates any of the above |
| `a & b` | every part holds: `in:break_room & !flag:lunch_freed` |

There's no "or". Write two rules, or two dialogue keys, instead. An unrecognized condition is false.

## Events

An event is a named list of lines. Lines are printed in order. Bracketed lines are printed **and** change the game:

| Line | Effect |
|---|---|
| `[Flag set: Gary is happy]` | Sets the flag `flagLabels['gary is happy']` names. An unmapped label does nothing, so test for it. |
| `[Added to inventory: badge]` | Adds the item whose `name` is "badge". |
| `[Badge consumed]` | Removes the item whose `name` is "badge" from the inventory. |

In a world with `style: 'infocom'`, bracketed lines still take effect but aren't printed.

Facts worth knowing:

- **Events from `onEnter`, `onTake`, `onWear`, `onSmash` and the finale’s `bareHanded` fire once per game.** Events from a use rule’s `then` and from `onGive` run every time the rule matches, so guard them with a `!flag:` condition if they should happen once.
- **Flags only turn on.** Model "before and after" as two flags, or with `!flag:`.
- **Item lines match display names**, not IDs. To upgrade an item, consume the old one and add the new: `[Lamp consumed]`, then `[Added to inventory: lit lamp]`.
- **`intro`** plays when a new game starts. A chapter break is just a line, such as `✨ CHAPTER 2: THE AFTERNOON`.

## How lines are styled

Every line the player sees is classified by how it starts, which sets its look and typewriter speed (`src/engine/output.ts`):

| Starts with | Style | Use it for |
|---|---|---|
| `📍` | room header | added by the engine; don't start your own lines with it |
| `💼 🌀 👔 💕 💻 💾 🔨 💥 📎 ✨ 🪄 🤜 😖 😴 🐟 🌺 📬 📞` | scripted moment | events (18ms/char) |
| `═` or `“` | banner, narration | 12ms/char |
| `[` | system | flags, inventory, hints, score (instant) |
| anything else | prose | descriptions, replies (10ms/char) |

A line starting with an emoji that isn't in the list renders as prose. To use a new one, add it to `EVENT_PREFIX` in `src/engine/output.ts`.

**Copy style:** the built-in replies use curly quotes and apostrophes (“ ” ’). Your world will read best if it does too.
