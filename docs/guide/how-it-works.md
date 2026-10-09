# How it works

Three parts, kept deliberately apart, and shipped as three npm packages ([Using the library](./using-the-library)): the engine and parser are `@brass-lantern/engine`, the terminal and stores are `@brass-lantern/vue`, and the intent server is `@brass-lantern/server`. The engine imports no Vue, Pinia or browser globals, so the same turn loop runs in a browser, in Node (`createGame`) and in tests.

This page is a tour of the internals. File paths are in the [repo](https://github.com/mrballistic/brass-lantern), for readers of the source; nothing here is needed to use the packages.

1. **The engine** (`packages/engine/src/engine/`) is a deterministic state machine. It never knows which game it’s running: everything specific to a world, including its rules, is data.
2. **The parser** turns what the player typed into `{ action, target, indirect }`. A regex parser in the browser handles the canonical commands instantly. Anything it can’t parse, or parses into something the engine can’t act on, can go to the optional [intent server](./intent-server), where an LLM reads it more loosely. The LLM only *classifies* input; it never writes story text.
3. **The world** (`packages/engine/src/worlds/`) is one object. Swap it and you have a different game.

```
browser                                      intent server (optional)
┌───────────────────────────────────┐        ┌────────────────────────┐
│ terminal ─► store                 │  POST  │ /api/parse-intent       │
│               │ splitCommands     │ ─────► │ rate limit, size caps   │──► Gemini
│               ▼ regex parser      │        │ model chain, deadline   │
│               ▼ engine ◄── world  │ ◄───── │ reply sanitizing        │
│               │  (miss? ask LLM)  │        └────────────────────────┘
│               ▼ output + save     │
└───────────────────────────────────┘
```

## From keystroke to reply

The store (`packages/vue/src/stores/game.ts`) runs every line through the same steps:

1. **Meta commands** (SAVE, RESTORE, LOAD, UNDO, RESTART, SCRIPT, THEME, BLOOM, EFFECTS, EJECT, COOKIES) are handled by the store itself, and so is the answer to a SAVE or RESTORE prompt.
2. **Split.** `splitCommands` (`packages/engine/src/engine/parser.ts`) breaks the line into commands:
   - First the line is cleaned (`cleanInput`): trimmed, with every run of whitespace made one space. A line still longer than `MAX_INPUT_LENGTH` (1,000 characters) is refused whole: the parsers return nothing, and `createGame().send`, `interpret` and the Vue store answer “[That’s too long for me to follow. Nothing happened.]” (`TOO_LONG_REPLY`) before anything runs. Every pattern is written for the cleaned form, so no line costs more than linear time to read.
   - Clauses always split on `then`, `;` and full stops, except after `dr.`, `mr.` and the like.
   - Within a clause, `and` and commas split only when every piece is a recognized command, or an object after a list verb: `get key and wallet` becomes `get key` and `take wallet`.
   - A clause that isn’t clearly a list (“could you grab my keys and wallet”) stays whole.
   - Anything inside quotes is masked first, so a quoted “. ” or “, ” never splits a line (`answer “a well. yes”` is one command). A text verb (SAY, ANSWER) takes the rest of the line, and ends it.
   - Names that contain “and” (`andNames(world)`: every item and character name and alias with the word in it, longest first) are masked too, so `take flair from lost and found and go north` is two commands. The store and `createGame` work the list out once per world.

   Each command may be **captured** first: a room’s or the world’s `capture` (`captureLine` in `packages/engine/src/engine/engine.ts`) can take it before it’s parsed, which ends the line. Captured input never reaches the intent server.
3. **The conversation.** `interpret` (`packages/engine/src/engine/conversation.ts`) looks at the command in the light of the last one:
   - **an answer** to a question the engine just asked (“Which door do you mean?” → `trap`) fills in the waiting command and runs it, **without** asking the intent server;
   - **AGAIN** (`g`) runs the last command again;
   - **OOPS *word*** swaps the word nobody understood in the last line and runs that.

   Anything else is a fresh command, and drops any waiting question.
4. **Parse.** `fallbackParse` maps each command to an action, with synonyms, a second object (“give X to Y”, “put X in Y”), ALL and EXCEPT, and a bare word meaning GO. Besides `target` and `indirect`, an action can carry:
   - **`number`**: a number in an object slot (`turn dial to 4`, `set year to 776`), the value alongside the digits typed (`parseNumber`: digits to 1000, or H:MM as minutes); rules see that slot as `number`;
   - **`text`**: for a world verb with `target: 'text'`, the rest of the line, outer double quotes dropped;
   - **`prep`**: `in`, `on`, `under`, `behind`, `off`, `over` or `through`, for the forms that take one (PUT X UNDER Y, THROW X OFF Y, READ X THROUGH Y);
   - **`direction`**: for PUSH X NORTH (and CLIMB UP/DOWN a thing);
   - **ME, MYSELF, SELF and YOURSELF** stay as typed: the engine decides they name the player (the reserved ID `player`, for rules), and never matches them, or `player` from the intent server, against things’ names.
5. **Pronouns.** `it`, `them` and `that` become the last thing the engine acted on; `him` and `her`, the last person.
6. **Execute.** `execute(action, { world, state })` returns the lines to print, whether anything changed, and `understood: false` if it couldn’t make sense of the command (no such exit, no such item, no rule that applies). When a noun matches more than one thing, or a verb is missing its object, it returns a **question** (`ask`) instead, before touching anything. Before running a command that changes the game, the store keeps a snapshot for UNDO (the last 50, for this session only).
7. **Retry on a miss.** If the regex couldn’t parse the command, or the engine didn’t understand it, the store asks the intent server how to read it. If the LLM’s reading is different and the engine can act on it, that result is shown instead; otherwise the literal reply stands.
8. **Time passes.** After a command the engine acted on (never after a misunderstood one, a question, or a command like VERBOSE that takes no time), the room’s end routines run (`onEnd`), then the move counter goes up, wounds heal, timers fire, daemons run, characters fight, and ambient lines print, in that order (`packages/engine/src/engine/time.ts`, after Zork’s CLOCKER). If the light changed, the reply says so.
9. **Output.** Lines are styled by their prefix and typed out, and the game is saved if anything changed.

::: warning The one rule to keep
Step 7 runs the engine on the literal reading first, and possibly again on the LLM’s reading. That’s only safe because **a miss never changes the game**. When you add an engine handler, decide whether you can act before you touch any state. `packages/engine/tests/engine/engine-hooks.test.ts` checks this.
:::

The intent server sees the room by ID and name (`red_mug (red coffee mug)`), so its answer uses IDs the engine matches exactly. Everything still goes through the same fuzzy matcher (`packages/engine/src/engine/fuzzy.ts`: exact ID, then exact name, then substring, then token prefix), so a slightly-off answer still lands. The token-prefix tier needs every typed word of three or more letters to match a word of the candidate, so an extra word (“red ball” for a plain “ball”) misses rather than landing on something that merely shares a word.

## Cartridges and sessions

The terminal talks to whatever is running through one interface (`useSession()` in `packages/vue/src/stores/session.ts`):

- **The cartridge menu**, when nothing is inserted.
- **A native world**, run by the engine above.
- **A Z-machine story**, run by ifvms. See [Playing story files](./z-machine).

Inserting or ejecting a cartridge clears the screen.

## The engine

`execute` (`packages/engine/src/engine/engine.ts`) dispatches on the action to one handler per verb (`packages/engine/src/engine/verbs/`), and each handler reads the world’s rules rather than knowing any particular game.

**The object tree.** Every item has one parent: a room, the player, another item, or nowhere yet (`GameState.locations`, in `packages/engine/src/engine/model.ts`). Inventory, a room’s contents and a container’s contents are all read from that one map. Containers and surfaces nest. What the player can *see* (through glass) and *reach* (into open things) is computed from the tree, and the parser only matches what can be seen.

| Concept | Where in the world | Notes |
|---|---|---|
| Conditions | anywhere | `flag:`, `has:`, `held:`, `in:`, `visited:`, `inside:`, `open:`, `locked:`, `on:`, `here:`, `var:`, `number:`, `said:`, `target:`, `indirect:`, `direction:`, `terrain:`, `water:`, `aboard`, `seen:`, `following:`, `carrying`, `lit:`, `alive:`, `awake:`, `fighting:`, `with:`, `!`, `&`. One parser, `packages/engine/src/engine/conditions.ts`. |
| Rules | `instead`, `after` on items and rooms | Replace a verb’s default, or follow it. `packages/engine/src/engine/rules.ts`. |
| Containers, doors | `item.container`, `item.surface`, `item.door` | Open, close, lock, put in, take from. |
| Exits | `room.exits` | A room ID, or `{ to, if, denial, door, denials, then }`. GO runs through rules. |
| Vehicles | `item.vehicle`, `room.terrain` / `water` / `air`, `world.onFoot` | BOARD, DISEMBARK, and Zork’s rules for water and land, generalized to named terrains: a vehicle `travels` on some, rests on others (`packages/engine/src/engine/verbs/vehicle.ts`, `movement.ts`). |
| Effects | `events` | Lines and typed effects: flags, moves, variables, timers, chance, death, endings (`packages/engine/src/engine/effects.ts`). |
| Darkness | `room.dark`, `item.light`, `world.darkness` | In an unlit dark room you can only find what you carry (`packages/engine/src/engine/model.ts` `isLit`). |
| Death, endings | `world.death`, `world.endings` | `packages/engine/src/engine/death.ts`, `packages/engine/src/engine/endings.ts`. |
| Characters | `npcs`, `room.npcs` | Places, held things, states, hiding and descriptions (`GameState.npcs`, read through `packages/engine/src/engine/model.ts`). |
| Topics, orders | `npc.topics`, `npc.orders`, `npc.obeys`, `npc.refuseOrder`, `instead.order` | ASK *X* ABOUT *Y* and “*X*, do this” (`packages/engine/src/engine/verbs/talk.ts`; see [Orders](#orders) below). |
| Followers | `npc.follows`, `{ follow }` | Characters who go where the player goes (`packages/engine/src/engine/verbs/movement.ts`). |
| Combat, health | `npc.combat`, `world.combat` | Zork’s blows, tables, wounds and healing (`packages/engine/src/engine/combat.ts`). |
| Weight | `world.carry`, `item.size` | `packages/engine/src/engine/weight.ts`. |
| Scripts | `world.scripts` | The code hatch: functions that return steps (`packages/engine/src/engine/scripts.ts`). `descriptionScript` also builds descriptions from state; `{var:NAME}` and `{number}` fill in text (`packages/engine/src/engine/text.ts`). |
| Events | `events` | Line lists. `[Flag set: …]`, `[Added to inventory: …]` and `[… consumed]` lines change state. Events from `onEnter`, `onTake`, `onWear`, `onSmash` and `bareHanded` fire once; use-rule and gift events run every time. |
| Flags | `flagLabels` | The friendly label in an event line, mapped to a flag ID. |
| Use rules | `item.onUse` | The older form of `instead.use`. |
| Gifts | `npc.onGive`, `npc.refuse` | Giving takes the item; a refusal keeps it. |
| Gated rooms | `room.requires`, `room.denial` | |
| The ending | `finale` | Smash X in room Y holding Z: event, epilogue, score, footer. |
| Timers | `ambient` | Lines every N turns while a condition holds. Turns count only commands the engine acted on. |
| Score | `scoring`, `ranks`, `maxScore`, `scoreLine`, `rankLine` | Summed from flags, conditions that hold, and the `score` variable; the lines are templates. |
| Status line | `style`, `statusLine` | Zork’s room, score and moves in Infocom style; `MOVES: n` (or score and moves) otherwise. |

When a world needs behavior the schema can’t express, the engine gets a *generic* hook (in `packages/engine/src/types/world.ts` and the engine); it never branches on a world’s IDs. [CONTRIBUTING.md](https://github.com/mrballistic/brass-lantern/blob/main/CONTRIBUTING.md) has the details.

### Orders

“*X*, *command*” (and TELL *X* TO *command*) is its own verb, `order`, handled by `handleOrder` in `packages/engine/src/engine/verbs/talk.ts`. The pipeline, in order:

1. **Address.** The character is matched in the player’s room, or among those whose `heardFrom` names it. No one matching is a miss.
2. **`instead.order` rules** answer first, and the order’s words stay words (they aren’t resolved as things).
3. **Parse the inner command** with `fallbackParse`, as the player would have typed it. A character with neither `orders` nor `obeys` stops here with `refuseOrder`.
4. **Resolve its objects before anything changes**, among what the *character* can reach (its room’s things and what it holds), plus ME (the player), a typed number, and other characters present. A name that matches nothing is a miss; one that matches several is a question, and neither takes time or changes state.
5. **`orders` rules**, keyed by the inner verb (or the first typed word when the parsed verb has no table, so the parsed verb wins a clash). Their conditions see the inner command through the same command record rules use: `target:`, `indirect:`, `number:`, `said:`, `direction:`.
6. **`obeys`**: if no rule answered, the engine performs GO, TAKE, DROP or GIVE ME itself, moving the character or its things. A refusal here is understood and takes a turn.
7. **Ends the line.** A result for a character with `orders` or `obeys` carries `stopLine`, and the store drops the rest of the typed line (Zork’s P-CONT). A miss never does, so the intent-server retry isn’t affected.

**Adding a verb** is usually a world change: declare it in `world.verbs` and give things `instead` rules for it. The parser learns its words from the world, and the browser tells the intent server which world verbs to accept, so neither needs editing.

A *built-in* verb, with default behavior in the engine, is a change to the engine itself (for contributors; see [CONTRIBUTING.md](https://github.com/mrballistic/brass-lantern/blob/main/CONTRIBUTING.md)), and takes three edits:
- the regex in `packages/engine/src/engine/parser.ts`, plus its words in `BUILT_IN_WORDS`;
- the dispatcher in `packages/engine/src/engine/engine.ts` (wrapped in `withRules`), plus its HELP text;
- `ACTION_VOCAB` in `packages/server/src/llm.ts`. Without that last one, the server throws away the LLM’s answer as an unknown verb.

**Saves** are format 2.0. A 1.0 save (from before the object tree) is converted on load by `packages/engine/src/engine/migrate.ts`, so players keep their games. A 2.0 save that has no place for an item (one a later version of the world added) gets that item’s starting place; an item recorded as `null` (used up) stays gone.

## The terminal

The CRT is hand-written CSS (`packages/vue/src/styles/crt.css`), with no canvas and no UI framework. Every rule is scoped to the game’s shell, which fills its container, so the effects stay inside the game’s box on any page:
- a boot sequence, scanlines, phosphor bloom and a barrel vignette;
- flicker at two rates, plus occasional glitches;
- phosphor decay on older lines, and a block cursor with a square-wave blink.

The default look, `crt-amber`, is deliberately period-accurate rather than WCAG-compliant. The colors are twelve `--bl-*` role variables set by a **theme**, so a game can ship `crt-green`, a plain `simple` look (light or dark, following the system) or a palette of its own, and the player can switch with THEME. Reduced motion turns off flicker, glitch and noise. [Using the library](./using-the-library#themes) has the details.

Each output line is classified by its first characters (`packages/engine/src/engine/output.ts`). The class sets both its style and its typewriter speed:

| Prefix | Type | Speed |
|---|---|---|
| `> ` | your input | instant |
| `📍` | room header | 10ms/char |
| event emoji (`💼🌀👔💕💻💾🔨💥📎✨🪄🤜😖😴🐟🌺📬📞`) | scripted moment | 18ms/char |
| `═`, `“` | banner, narration | 12ms/char |
| `[` | system | instant |
| anything else | prose | 10ms/char |

A restored session renders instantly, with no typewriter replay, and its boot sequence is shortened. The header shows the game’s `terminalName` and `version` options, then the cartridge’s title (in builds with a menu); on the right, a native world’s status line (`MOVES: n`, or Zork’s “West of House  Score: 0  Moves: 0” in Infocom style) or the story’s own, and a COOKIES button when analytics are configured.

## Saves and analytics

- **Saves** live in `localStorage` only, one per cartridge, under `<storagePrefix>:save:<cartridge id>` (or the cartridge’s `saveKey`), with up to 500 lines of history. [Cartridges and storage](../reference/cartridges#browser-storage) lists every key. They’re written after every change. SAVE *name* keeps an extra copy under `<save key>:named:<name>`, and RESTORE *name* brings it back. If storage is unavailable (private browsing), play continues and SAVE says so.
- **UNDO** history is memory only: up to 50 snapshots, gone on reload, RESTART or RESTORE.
- **SCRIPT** downloads a transcript as a text file when it stops; nothing is stored.
- **Analytics** are the app’s, not the library’s: the packages send nothing anywhere. A game tells `GameOptions.analytics.onEvent` about `game_start` and `session_resumed` (each with a `cartridge` parameter for story files) and, for native worlds, `game_completed` with the move count; what happens next, and whether the player has consented, is up to the app. Given `analytics.openConsent`, the header shows a COOKIES link and the COOKIES command calls it. The demo site, for example, sends those events to Google Analytics only when `VITE_GA_MEASUREMENT_ID` is set at build time, and only after the player accepts its `ConsentBanner`; it honors Do Not Track, and a build without an ID shows no banner.
