# Engine parity, stage 6a: foundations for Zork II and Zork III

**Status:** approved in conversation 2026-10-07; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [the Zork II/III survey](../surveys/2026-10-06-zork2-zork3-survey.md) (gaps 1–9) and stages 1–5d. Zork I native is complete (1.12.0, 1.12.5).

## Decisions made while brainstorming

- **6a lands the shared engine features before the npm library** (owner's choice): each changes the `World` type or the parser, which become the library's public API. The library follows 6a; Zork II (6b) and Zork III (6c) native follow the library. The Office Space world upgrades wait until after the library, as its first real consumer.
- **Scope is the survey's gaps 1–9.** Gaps 10–12 (Zork's timer order, a per-command room hook, the small items) wait for 6b/6c's differentials to demand them.
- **Proof: fixture tests plus slices against the story files** (owner's choice). Every feature is test-first on the fixture world; four small native slices of Zork II and III are played against zork2.z3 and zork3.z3.
- **Orders are option C** (owner's choice): order rules on the parsed inner command, plus a few built-in verbs an obeying character performs itself.
- **Data first, with the script hatch**, as before. Where the story file and the ZIL source disagree, the story file wins.

## Invariants (unchanged)

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies; the intent server's vocabulary grows with the new forms and drops anything else.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`. Scripts reach both through the script context, never by parsing.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working: Zork I's full game and its nine chapters match exactly; Office Space syncs with no world changes and no player-visible change.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.

## 1. The parser and orders

### Numbers (Zork's INTNUM)

- A number in an object slot parses as the number object: `ParsedAction.number` carries the value and the slot reads `number` (`turn dial to 4`, `set year to 776`). As Zork's NUMBER?: digits up to 1000, and H:MM as minutes (hours under 8 count as afternoon). A larger number isn't a number: like any unknown word it's a miss, which the intent server may still read.
- Conditions: `number:N` and `number<op>N` (`<`, `<=`, `>`, `>=`), negatable, joined with `&` like the rest.
- Effect: `{ setVar: NAME, from: 'number' }` stores it (the time machine's year).
- A rule's `with: number` matches a command whose second object is a number.

### Typed words (Zork's SAY, INCANT, ANSWER)

- A world verb with `target: 'text'` takes the rest of the line as its argument: unresolved, never a miss for naming nothing. Surrounding quotes are dropped.
- `ParsedAction.text`; condition `said:WORDS` matches it case-folded, ignoring punctuation and quotes, on whole words.
- The verb consumes the rest of the line (Zork reads P-LEXV and clears P-CONT): `splitCommands` doesn't split inside a quoted phrase, and a text verb's line ends with it.

### TURN / SET X TO N

- `turn X to|for Y` and `set X to Y` are built-in forms (Zork's V-TURN): they go through `withRules` as `turn` with the second object (a number or a thing). Default: “This has no effect.”
- Bare TURN X keeps its current meaning. A world's “turn it to something” prompt (Zork III's PRE-TURN for the dials) is a world rule.

### Prepositions

`ParsedAction.prep` widens from `in | on` to add `under | behind | off | over | through`, and `direction` carries a direction for PUSH.

| Form | Verb | Default (Zork's) |
|---|---|---|
| PUT/PUSH/SLIDE X UNDER Y | `put` prep `under` | “You can't do that.” |
| PUT X BEHIND Y | `put` prep `behind` | “That hiding place is too obvious.” |
| THROW X OFF/OVER Y | `throw` prep `off`/`over` | “You can't throw anything off of that!” |
| READ X THROUGH/WITH Y | `read` with indirect | V-READ (reads X) |
| PUSH X *direction* / PUSH X TO Y | `push` with `direction` / indirect | “You can't push things to that.” |

Each new form goes through the usual rules, so worlds handle the puzzles as data. HELP and the intent server's `ACTION_VOCAB` learn them.

### “Me”

ME, MYSELF and SELF in an object slot name the player. Rules match them with the reserved target `player`; built-in verbs give their own replies (Zork's “You can't tie anything to yourself.” is a world matter). In an order, ME is the speaker (GIVE ME THE WAND).

### Orders (option C)

1. “X, *command*” (and TELL X TO *command*) parses the inner command with the full parser. Its objects resolve among what the character can reach in its own room, plus the player as ME.
2. The character's `order` rules match on the inner verb: an order rule is keyed `orders: { [verb]: Rule[] }` on the NPC, with `if` / `with` / `then` / `say` as other rules, and the inner command's target and indirect available to conditions and scripts.
3. If no rule fires and the character lists the verb in `obeys`, the engine performs it as the character:
   - `go DIR`: the character walks that exit of its room (doors and conditions checked as for an NPC move; it leaves and arrives with its usual lines).
   - `take X` / `drop X`: X moves to or from the character (weight rules apply only to the player).
   - `give X to me`: X moves from the character to the player.
   Each built-in prints a plain default the world can override per verb (`obeyReplies`).
4. Otherwise `refuseOrder` or “X ignores you.” stands, as now.
5. An order ends the rest of the line (Zork clears P-CONT), like a refused move.

Orders with no rules and no `obeys` behave exactly as today, so Zork I and Office Space don't change.

## 2. World features

### Descriptions built from state

- Templates: `{var:NAME}` and `{number}` expand in any room, item or NPC description, `descriptions` entry, and event line.
- `descriptionScript: NAME` on a room or item: the named script returns the description text. Order: `descriptionScript`, then `descriptions` (first whose `if` holds), then `firstDescription` (first visit), then `description`.

### Script helpers

The script context gains:
- `test(condition)`: evaluates a condition string through `conditions.ts`.
- `exits(room)`: the directions passable now from a room, with their destinations.
- `resolve(words, scope?)`: words to an item or NPC ID through `fuzzy.ts`.
- `number`, `text`: the command's new arguments.

New condition `held:ITEM`: carried at any depth (Zork's HELD). `has:` keeps meaning carried directly.

### SCORE and DIAGNOSE text

- `scoring.line`: a template for the score line, with `{score}`, `{max}`, `{moves}`, `{moves|move}` (plural-aware). Zork II: “Your score would be {score} (total of {max} points), in {moves}.”; Zork III: “Your potential is {score} of a possible {max}, in {moves}.”
- `combat.diagnose` (or a world-level `diagnose`) overrides DIAGNOSE's lines with templates; unset means today's text.

### Followers

- `follows?: string` on an NPC: a condition; while it holds, after each move the player makes, the character moves into the player's new room.
- `followLine?: string`: printed when it arrives with you (default: none in Infocom style, “X follows you.” in brass).
- Steps `{ follow: NPC }` / `{ unfollow: NPC }` set and clear a flag the condition can test, for worlds that want a switch rather than a condition.
- Arrival uses the shared placing sequence, so listings keep their order.

### Vehicles beyond water

- `vehicle.travels: 'water' | 'air' | 'none'` (Zork's VTYPE). A room accepts a vehicle when tagged for its kind (`water` as now; `air` new). `'none'`: a thing you sit or stand in that doesn't move.
- `vehicle.arrive?` / `vehicle.leave?`: lines printed when the vehicle enters or leaves a room (the balloon's landing).
- Timers and scripts can move a vehicle with its passenger (`{ moveVehicle: ROOM }`).

### Death

- `death.keepTimers?: string[]`: timers a death leaves running (the engine cancels all today).
- `death.treasures` gains `{ to: PLACE }` beside `'dark'`.
- `home` already sends other carried things back.

## 3. The proof

### Fixture tests

Every feature above gets fixture-world tests, test-first: parser forms, defaults, conditions, orders (rules, `obeys`, refusal, line end), templates, followers, vehicles, death options, and the intent server's vocabulary.

### Slices against the story files

Four test-only native slices, data first with scripts where Zork computes, as 6b/6c would write them. They live under `tests/worlds/zork2-slices/` and `tests/worlds/zork3-slices/` and aren't shipped cartridges.

| Slice | Game | Rooms | Proves |
|---|---|---|---|
| The robot | II | Low Room, Machine Room, the cage's closet, the carousel | orders (GO, PUSH BUTTON, LIFT CAGE, GIVE ME …), ME, `obeys`, `refuseOrder` |
| The riddle and the door | II | Riddle Room; Dreary and Tiny Rooms | typed words (ANSWER “A WELL”), PUT MAT UNDER DOOR |
| The balloon | II | the volcano's air rooms and ledges | `'air'` vehicles, landing lines, a computed description, a timer that moves the vehicle |
| The endgame | III | Parapet, the cells, the bronze door | numbers (TURN DIAL TO 4), an order with a number, the Dungeon Master following, “Your potential is …” |

Each slice comparison:
- The original plays a walkthrough prefix from the start, seeded, to reach the slice (Jericho's walkthroughs where they fit the release; our own otherwise).
- The native slice starts in an equivalent state (room, inventory, flags, the relevant objects' states) from a small builder.
- The slice's commands must match exactly, apart from a short per-game allowlist of random lines.

`tests/worlds/zsession.ts` generalises over the story file and world so the same helpers drive all three games.

### Cost

The slices replay long prefixes in the original; keep each under a minute and reuse a single prefix run per slice.

## 4. Docs and release

- WORLDS.md: orders and `obeys`, numbers and typed words, the new prepositions, ME, templates and `descriptionScript`, followers, vehicle kinds, the death options, `scoring.line`. The tutorial world gains a small order and a number puzzle if they fit; its test plays them.
- ARCHITECTURE.md: the order pipeline and the new parser slots.
- README: players can now give orders and type numbers and quoted answers.
- CHANGELOG 1.13.0. Office Space syncs with no world changes; its suites pass untouched.

## Edge cases the review checks

- An order to a character not present, or to an item, or with an inner command that misses: no state change, and the miss text names the problem.
- An order that the character's rules decline falls through to `obeys`, then to the refusal; a built-in obeyed verb that can't happen (no such exit, X not reachable) is a miss with no state change.
- Numbers out of range, a number where a thing is expected, a thing where a number is expected.
- A typed-word verb with nothing after it; quotes left open; `said:` against punctuation and case.
- `held:` through closed containers (Zork's HELD walks containers regardless of open).
- A follower blocked by a door or a condition, a follower when the player dies or is moved by a script, two followers.
- A vehicle entering a room not tagged for its kind; an `'air'` vehicle moved by a timer with the player aboard and not aboard.
- Templates with an unset variable; `descriptionScript` naming no script (the audit refuses it).
- The intent server returning a new verb or preposition, and an unknown one.

## Out of scope

- The full Zork II and Zork III ports (6b, 6c): the wizard and his spells, the Royal Puzzle, the mirror box, time travel, the earthquake.
- Survey gaps 10–12: Zork's timer queue order, a room hook before every command, rooms blocked during play, seeing into another room, variable carry limits and fumble odds, conditional darkness text, global scenery, an add-moves effect, a total-weight condition, any object glowing.
- The npm library (next) and the Office Space world upgrades (after the library).
