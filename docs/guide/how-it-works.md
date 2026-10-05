# How it works

Three parts, kept deliberately apart:

1. **The engine** (`src/engine/`) is a deterministic state machine. It never knows which game it's running: everything specific to a world, including its rules, is data.
2. **The parser** turns what the player typed into `{ action, target, indirect }`. A regex parser in the browser handles the canonical commands instantly. Anything it can't parse, or parses into something the engine can't act on, can go to the optional [intent server](./intent-server), where an LLM reads it more loosely. The LLM only *classifies* input; it never writes story text.
3. **The world** (`src/worlds/`) is one object. Swap it and you have a different game.

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

The store (`src/stores/game.ts`) runs every line through the same steps:

1. **Meta commands** (SAVE, LOAD, RESTART, COOKIES) are handled by the store itself.
2. **Split.** `splitCommands` (`src/engine/parser.ts`) breaks the line into commands:
   - Clauses always split on `then`, `;` and full stops, except after `dr.`, `mr.` and the like.
   - Within a clause, `and` and commas split only when every piece is a recognized command, or an object after a list verb: `get key and wallet` becomes `get key` and `take wallet`.
   - A clause that isn't clearly a list ("could you grab my keys and wallet") stays whole.
3. **Parse.** `fallbackParse` maps each command to an action, with synonyms, a second object ("give X to Y", "put X in Y"), and a bare word meaning GO.
4. **Pronouns.** `it` / `them` become the last thing the engine acted on.
5. **Execute.** `execute(action, { world, state })` returns the lines to print, whether anything changed, and `understood: false` if it couldn't make sense of the command (no such exit, no such item, no rule that applies).
6. **Retry on a miss.** If the regex couldn't parse the command, or the engine didn't understand it, the store asks the intent server how to read it. If the LLM's reading is different and the engine can act on it, that result is shown instead; otherwise the literal reply stands.
7. **Output.** Lines are styled by their prefix and typed out, and the game is saved if anything changed.

::: warning The one rule to keep
Step 6 runs the engine on the literal reading first, and possibly again on the LLM's reading. That's only safe because **a miss never changes the game**. When you add an engine handler, decide whether you can act before you touch any state. `tests/engine/engine-hooks.test.ts` checks this.
:::

The intent server sees the room by ID and name (`red_mug (red coffee mug)`), so its answer uses IDs the engine matches exactly. Everything still goes through the same fuzzy matcher (`src/engine/fuzzy.ts`: exact ID, then exact name, then substring, then token prefix), so a slightly-off answer still lands.

## Cartridges and sessions

The terminal talks to whatever is running through one interface (`useSession()` in `src/stores/session.ts`):

- **The cartridge menu**, when nothing is inserted.
- **A native world**, run by the engine above.
- **A Z-machine story**, run by ifvms. See [Playing story files](./z-machine).

Inserting or ejecting a cartridge clears the screen.

## The engine

`execute` dispatches on the action to one handler per verb, and each handler reads the world's rules rather than knowing any particular game:

| Concept | Where in the world | Notes |
|---|---|---|
| Conditions | anywhere | `flag:X`, `has:X`, `in:X`, `!`, `&`. One parser, `src/engine/conditions.ts`. |
| Events | `events` | Line lists. `[Flag set: …]`, `[Added to inventory: …]` and `[… consumed]` lines change state; each event fires once. |
| Flags | `flagLabels` | The friendly label in an event line, mapped to a flag ID. |
| Use rules | `item.onUse` | First match wins; checked on both items for two-object uses. |
| Gifts | `npc.onGive`, `npc.refuse` | Giving takes the item; a refusal keeps it. |
| Gated rooms | `room.requires`, `room.denial` | |
| The ending | `finale` | Smash X in room Y holding Z: event, epilogue, score, footer. |
| Timers | `ambient` | Lines every N turns while a condition holds. Turns count only commands the engine acted on. |
| Score | `scoring`, `ranks` | Summed from flags. |

When a world needs behavior the schema can't express, add a *generic* hook to `src/types/world.ts` and the engine. Never branch on a world's IDs.

**Adding a verb** takes three edits:
- the regex in `src/engine/parser.ts`;
- the dispatcher in `src/engine/engine.ts`, plus its HELP text;
- `ACTION_VOCAB` in `server/src/llm.ts`. Without that last one, the server throws away the LLM's answer as an unknown verb.

Many verbs are better as mappings onto existing ones. OPEN, PUSH and UNPLUG are USE; SLEEP is USE BED.

## The terminal

The CRT is hand-written CSS (`src/styles/crt.css`), with no canvas and no UI framework:
- a boot sequence, scanlines, phosphor bloom and a barrel vignette;
- flicker at two rates, plus occasional glitches;
- phosphor decay on older lines, and a block cursor with a square-wave blink.

The amber-on-black contrast is deliberately period-accurate rather than WCAG-compliant. Change `--crt-amber` and friends if you need otherwise.

Each output line is classified by its first characters (`src/engine/output.ts`). The class sets both its style and its typewriter speed:

| Prefix | Type | Speed |
|---|---|---|
| `> ` | your input | instant |
| `📍` | room header | 10ms/char |
| event emoji (`💼🌀👔💕💻💾🔨💥📎✨🪄🤜😖😴🐟🌺📬📞`) | scripted moment | 18ms/char |
| `═`, `“` | banner, narration | 12ms/char |
| `[` | system | instant |
| anything else | prose | 10ms/char |

A restored session renders instantly, with no typewriter replay, and its boot sequence is shortened. The header shows `appName` and the version from `package.json`.

## Saves and analytics

- **Saves** live in `localStorage` only, under `<storagePrefix>:save`, with up to 500 lines of history. They're written after every change. If storage is unavailable (private browsing), play continues and SAVE says so.
- **Analytics** are off unless you set `VITE_GA_MEASUREMENT_ID` at build time. When it's set, nothing is sent and nothing is stored until the player accepts a consent banner, and Do Not Track is honored. Builds without an ID show no banner at all. Events: `page_view`, `game_start`, `session_resumed`, and `game_completed` with the move count.
