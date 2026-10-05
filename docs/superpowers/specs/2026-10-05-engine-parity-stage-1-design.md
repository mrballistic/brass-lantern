# Engine parity, stage 1: the world model

**Status:** approved in conversation 2026-10-05; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).

## Why

The goal is a native engine that can carry a **Zork-class game**: an object tree, containers, doors, darkness, NPCs that move and fight, deaths, and a parser with Infocom’s niceties. The yardstick is a **native port of Zork I** (MIT licensed since 2025), growing with each stage and checked against the real Z-machine version, which already runs in this repo.

Decisions made while brainstorming:

- **Full parity is the target**, not a subset for one game.
- **Data first, code hatch.** Grow the declarative vocabulary so most games stay pure data. A typed hook for genuinely procedural actors (a pure function, state in, effects out) arrives in stage 4. The engine still never names a world’s IDs.
- **Vertical slices driven by the port.** Each stage is a playable chunk of Zork I plus exactly the engine features that chunk needs. The foundations are designed for the whole roadmap now, and built only as far as each stage needs.

## Roadmap

| Stage | Engine | Zork I slice |
|---|---|---|
| **1. World model** (this spec) | Object tree; item state; doors; exits with conditions or messages; scenery and shared objects; READ text; first-seen descriptions; diagonals, U and D; instead/after rules on items and rooms; world-defined verbs; save format 2.0 with migration; Office Space verbs and copy out of the shared engine | House, forest, clearing, kitchen, living room, attic |
| **2. Darkness and time** | Dark rooms, light sources, the grue; fuses and daemons that change state; lamp burnout; richer event effects (move things, clear flags, end the game); death and resurrection; multiple endings (the SMASH finale generalized); seeded randomness; VERBOSE/BRIEF; visit points; numeric variables | Cellar and the first underground rooms |
| **3. Parser parity** | “Which lamp do you mean?”; “What do you want to take?”; ALL and ALL EXCEPT for every verb; multiple objects; pronoun slots; AGAIN, OOPS, UNDO; named save slots; SCRIPT; a status line with score and turns | Replays the earlier slices with the full parser |
| **4. Actors** | NPC places, inventories and movement; following; ASK/TELL topics; orders; a contest/combat system and the code hatch; health and DIAGNOSE; weight and capacity | Troll, thief, cyclops and their rooms |
| **5. The whole map** | Vehicles (the boat, the river); the remaining verbs | All of Zork I, to 350 points |

Each stage gets its own spec, plan and build. The rest of this document is stage 1.

## Invariants (unchanged, and binding on everything below)

- The engine never branches on a world’s IDs.
- **An engine miss never mutates state.** The store retries a miss with the LLM’s reading, so a miss must leave `GameState` deep-equal to before.
- The LLM only classifies; replies are reduced to verbs plus identifiers.
- Conditions are parsed only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Existing worlds keep working unchanged: every schema change is additive, and old fields keep their meaning.
- Player-facing text uses curly quotes and apostrophes.

## 1. State and the world model

### Places

```ts
type Place = string | null;   // a room ID, 'player', an item ID, or null (offstage)
interface GameState {
  currentRoom: string;
  locations: Record<string, Place>;   // every item's parent
  itemState: Record<string, ItemState>;
  visited: string[];                  // rooms entered, in order
  flags: Record<string, boolean>;
  moveCount: number;
  turns?: number;
  misses?: number;
  gameOver: boolean;
  firedEvents: string[];
}
interface ItemState { open?: boolean; locked?: boolean; on?: boolean; moved?: boolean }
```

- `locations` replaces `inventory`, `itemsRemoved` and `itemsAdded`. Inventory, a room’s contents and a container’s contents are all derived from it.
- **Initial places** come from `room.items` (as today) and a new `item.contains` (children that start inside or on it). An item named in neither is offstage (`null`) until an event brings it in, which is how `[Added to inventory: …]` items work today.
- **Order:** children list in world declaration order. For Office Space this changes inventory from pickup order to world order; that is the one accepted visible change.
- `itemState` starts from the item’s own declarations (`container.open`, `container.locked`), so a fresh game needs no per-item state.
- `moved` is set the first time the player takes an item. It selects between `initialDescription` and `roomDescription` (section 3).
- `'player'` is reserved: no room or item may use that ID. The audit test fails if one does.
- NPC IDs become valid places in stage 4, so NPC inventories need no further migration.

### Conditions

Added to `conditions.ts`, alongside the existing `flag:`, `has:` and `in:`, all negatable with `!` and joinable with `&`:

| Condition | True when |
|---|---|
| `open:X` | item X is open |
| `locked:X` | item X is locked |
| `on:X` | item X is switched on |
| `here:X` | X is reachable by the player (section 3) |
| `visited:ROOM` | the player has entered ROOM |
| `inside:X:PLACE` | X’s parent is PLACE (a room, an item, or `player`) |

`has:X` keeps its meaning: X’s parent is `player`.

### Save format 2.0

- `SAVE_VERSION` becomes `'2.0'`.
- `persistence.load()` no longer discards a 1.0 save. It returns the raw payload, and the store calls `migrateState(world, saved)` from `src/engine/migrate.ts`.
- **1.0 → 2.0:**
  1. start from the world’s initial places;
  2. move every item in `itemsRemoved[room]` to `null`;
  3. move every item in `itemsAdded[room]` to that room;
  4. move every item in `inventory` to `player`;
  5. set `itemState` to `{}` and `visited` to `[currentRoom]`;
  6. drop the old fields, and stamp the save 2.0.
- An unknown version, or a migration that throws, still discards the save. That is today’s behavior, and the store already starts a new game when there is no save.
- Tests:
  - a shared migration test against the fixture world;
  - in the private repo, a test that migrates a real 1.0 Office Space save and plays on from it.

## 2. Verbs and rules

### Built-in verbs (engine defaults; parser, dispatcher, HELP, `ACTION_VOCAB`)

New in stage 1:

| Verb | Forms | Default |
|---|---|---|
| `open`, `close` | OPEN X, CLOSE/SHUT X | Containers and doors. Opening a closed opaque container prints its contents (“Opening the small mailbox reveals a leaflet.”). |
| `lock`, `unlock` | LOCK/UNLOCK X WITH Y | Needs the item named by `container.key` (doors use the same block). |
| `put` | PUT X IN/ON Y, INSERT X IN Y | Into an open container with room, or onto a surface. |
| `take` (extended) | TAKE X FROM Y | From a reachable container or surface. |
| `search` | LOOK IN X, SEARCH X | Lists contents, if it can see inside. |
| `read` | READ X | `item.text`, else the description. |
| `turn_on`, `turn_off` | TURN ON/OFF X, SWITCH ON X, LIGHT X | Items with `switchable: true`. |
| `enter`, `climb` | ENTER X, CLIMB (UP/DOWN) X, GO IN | Takes the room exit whose label matches X or the verb (`climb`, `up`, `in`), else the rules. |
| directions | NE, NW, SE, SW, U, D | Added to the parser, the fuzzy direction map and the compass. |

Changes to existing verbs:

- **OPEN, PUSH, PULL and PRESS stop being USE synonyms.**
  - OPEN becomes its own verb.
  - PUSH, PULL and PRESS become world verbs (below) in the worlds that need them.
  - A world that relied on “open X” meaning USE keeps working through the compatibility rule: when OPEN finds no container or door, it falls back to X’s `onUse` rules.
- **EXAMINE** also lists what’s inside an open or transparent container, or on a surface.

### World verbs (declared by the world, no engine default)

```ts
verbs?: Record<string, {
  words: string[];               // 'pray', 'ring', 'move', 'push'
  target: 'none' | 'optional' | 'required';
  indirect?: string[];           // prepositions taking a second object: ['with', 'on']
  reply?: string;                // when no rule matches; default “Nothing happens.”
}>
```

- **Parsing.** `fallbackParse` builds the patterns from the world’s `verbs`, after the built-ins. Built-in verbs win any clash, and the audit test reports a clash.
- **The LLM.**
  - The intent context gains `verbs: string[]` (the world’s verb IDs).
  - The server accepts an `action` that is in `ACTION_VOCAB` or in `context.verbs`.
  - Both pass the existing identifier regex, so the reply is still a verb plus identifiers.
  - The system prompt lists the world verbs alongside the built-ins.
- **Dispatch.** A world verb runs the rules (below), checking the target item, then the indirect item, then the current room. If no rule matches, it prints `reply` and returns `understood: true` with no state change.
- **What moves out of the shared engine:**
  - SNOOZE, INSTALL and SLEEP-as-USE-BED become Office Space world verbs with rules.
  - The DRIVE, GUT, CLEAN, DRINK, UNPLUG, ANSWER, STAPLE and CLIP synonyms move into Office Space’s world: as world verbs, or as `aliases` and words on its rules.
  - Tutorial-specific synonyms, if any, move into `tutorial.ts`.

### Rules

```ts
interface Rule {           // today’s UseRule
  if?: string;             // condition
  with?: string;           // the other item (indirect object), for two-object verbs
  then?: string;           // event to run
  say?: string[];          // lines to print
}
// on Item and Room:
instead?: Record<string, Rule[]>;   // runs in place of the default
after?: Record<string, Rule[]>;     // runs after the default succeeds
```

- **Order:** the target item’s rules, then the indirect item’s, then the room’s. The first rule whose `if` holds (and whose `with` matches the other object, when given) wins.
- **`instead`:** if a rule matches, its `say` and `then` run and the default is skipped.
- **`after`:** runs only when the default succeeded and changed state.
- **The old hooks keep working, as shorthand:**

  | Old field | Means | Notes |
  |---|---|---|
  | `onUse` | `instead.use` | |
  | `onTake` | `after.take` | Still one-shot, as today. |
  | `onWear` | `after.wear` | |
  | `onSmash` | `instead.smash` | One-shot. |
  | `onSnooze` | an `instead` rule on the world verb `snooze` | After Office Space moves SNOOZE out. |

  The engine normalizes these at load, so there is one code path.
- **One-shot events:** every event an `instead` or `after` rule runs is recorded in `firedEvents`, as today. Firing it once is still the job of the call sites that were one-shot (enter, take, wear, smash); a rule that should fire once guards itself with `!flag:`, as the docs now say.
- **The miss invariant:** a verb with no applicable default and no matching rule is a miss (`understood: false`, no change). Built-in defaults check everything they need (reachability, open, locked, capacity) **before** touching state; each refusal is an understood, non-mutating reply such as “The mailbox is closed.”, never a miss, so the LLM isn’t asked to re-guess a clear refusal.

## 3. Exits, doors, containers and descriptions

### Exits

```ts
exits: Record<string, string | Exit>;
interface Exit {
  to?: string;        // omitted: a message-only exit
  if?: string;        // condition for this exit alone
  denial?: string;    // shown when `if` fails, when `door` is closed, or always if no `to`
  door?: string;      // an item that must be open
}
```

- A plain string is today’s exit, and room-level `requires`/`denial` still apply on entry.
- Default denials:
  - a closed door: “The *door name* is closed.”;
  - a failed `if` with no `denial`: “You can’t go that way.”
- `listExits` is unchanged. A message-only exit is matchable but listed only if `listExits` names it.

### Doors and shared objects

- A door is an ordinary item with `door: true` and a `container` block for `openable`, `open`, `locked` and `key` (`capacity` and `transparent` are ignored for doors; live state is in `itemState`). It is named in both rooms’ `scenery` lists.
- `room.scenery: string[]` names items present in the room without being in it: examinable, usable and matchable, never listed, never takeable. The same mechanism covers Zork’s shared objects (the window, the chimney, the stairs).
- `item.scenery: true` keeps an item that lives in one room out of the room listing.
- Taking scenery goes down today’s non-portable path: `refusal`, else “You can’t take the *name*.”

### Containers and surfaces

```ts
container?: { openable?: boolean; open?: boolean; locked?: boolean; key?: string; transparent?: boolean; capacity?: number };
surface?: boolean;
contains?: string[];   // initial children (in a container, or on a surface)
switchable?: boolean;
door?: boolean;
```

- **Reachable** (`here:`, and what the parser matches against): the item is in the current room, in `room.scenery`, carried, or inside something reachable that is open or a surface. **Visible** adds things inside reachable transparent containers.
- The parser’s candidate list becomes the visible set. Acting on something visible but not reachable says so: “The trophy case is closed.”
- **Defaults:**
  - you can’t take from, put into or search a closed opaque container;
  - `capacity` counts direct children;
  - you can’t put a container inside itself or inside its own contents.
- **Listing:**
  - a room lists its non-scenery items, then, nested and indented, what’s in open or transparent containers and on surfaces (“The small mailbox contains: a leaflet.”);
  - EXAMINE does the same for one item;
  - INVENTORY nests the same way.

### Descriptions

- `item.text`: READ.
- `item.initialDescription`: the item’s own sentence in a room listing until it’s `moved` (Zork’s FDESC, e.g. “A battery-powered brass lantern is on the trophy case.”).
- `item.roomDescription`: its sentence after that (Zork’s LDESC, e.g. “There is a brass lantern (battery-powered) here.”).
- Items with neither sentence are gathered into today’s “You can see: …” line, so worlds that don’t use these look exactly as they do now.
- `room.firstDescription`: replaces `description` on the first visit only (decided by `visited`).

## 4. The Zork I slice, testing, and the shared engine

### The native slice

`src/worlds/zork1.ts` ships as a demo cartridge titled **ZORK I · NATIVE**, alongside the Z-machine original.

- **Rooms:** West of House, North of House, South of House, Behind House, the three forest rooms, Forest Path, Up a Tree, the grating clearing, Clearing, Kitchen, Living Room, Attic.
- **Objects:**
  - mailbox and leaflet, front door (boarded: a message exit), window (a door between Behind House and Kitchen);
  - sack (lunch and garlic), bottle (water), table;
  - trophy case, rug and trap door, brass lantern, sword;
  - attic: rope, knife;
  - tree: nest and egg;
  - clearing: leaves and grating.
- **Text** comes from Zork I’s MIT source (`historicalsource/zork1`), credited in THIRD_PARTY_NOTICES.
- **The boundary:** the trap door and the grating open and close, but going down gives “The rest of the Great Underground Empire isn’t built yet.” Darkness, the cellar and the trap door slamming shut are stage 2.
- **Score:** taking the egg (5), and treasures in the trophy case, through `after` rules that set flags. Room visit points (the kitchen’s 10) are stage 2.
- **Known gaps:** randomness (the songbird, varied refusals), which an allowlist records.

### Differential testing (the yardstick)

- `tests/worlds/zork1-diff.test.ts` plays one command script against both the native world (real parser and engine) and `zork1.z3` (headless, through `ZMachineSession`).
- Each reply is compared after normalizing: case, whitespace, straight versus curly quotes, and the status line removed.
- A curated walkthrough of the whole slice must match line for line.
- **Intended differences** live in an allowlist next to the test: command, both texts, and a reason (“native has no grue yet”, “random”). The allowlist is expected to shrink stage by stage.
- A command the script uses that the slice doesn’t support is a failure, not an allowlist entry.

### Office Space and the private repo

- Office Space’s verbs and engine copy move into its world:
  - SNOOZE, INSTALL and SLEEP as world verbs;
  - its synonyms as world verbs or aliases;
  - “Just the weight of corporate despair.” (the empty-inventory line) and “Smashing things at work is, somehow, still frowned upon.” as new optional world fields (`emptyInventory`, `smashRefusal`) with neutral engine defaults;
  - the SCORE line in HELP made neutral.
- The event-emoji whitelist in `output.ts` stays as is: it’s styling, not story.
- The private repo syncs; its world gains the verbs and fields above. **Its existing tests pass unchanged**, apart from assertions on inventory order. Its 1.0 saves migrate (section 1).

### Code structure

`src/engine/engine.ts` (669 lines) splits by concern:

| File | Owns |
|---|---|
| `engine.ts` | `execute`, the dispatcher, HELP, turn bookkeeping |
| `model.ts` | places, initial state, reachability and visibility, moving items, containment checks |
| `rules.ts` | normalizing old hooks, matching `instead`/`after` rules |
| `describe.ts` | room, contents and inventory text |
| `verbs/*.ts` | built-in verb handlers, grouped (movement, objects, containers, people, meta) |
| `migrate.ts` | save migration |

`conditions.ts` and `fuzzy.ts` keep their monopolies; `model.ts` supplies them the reachability they need.

### Tests

- **The fixture world** gains a use of every new field: a container with a key, a transparent container, a surface, a door, scenery, a shared object, `initialDescription`/`roomDescription`/`firstDescription`, `text`, a switchable item, world verbs, and `instead`/`after` rules.
- **`tests/engine/engine-hooks.test.ts`:** every new verb, given input it can’t act on, leaves state deep-equal.
- **Migration:** fixture 1.0 saves (empty, mid-game, with dropped and added items) migrate to the expected 2.0 state.
- **The server:** world verbs in `context.verbs` are accepted; anything else is still dropped to `unknown`.
- **The tutorial and Snack Attack** tests pass unchanged.
- **Thresholds** stay at 80% lines/functions/statements and 75% branches.

### Docs

- **world-schema:** every new field.
- **conditions-and-events:** the new conditions.
- **commands:** the new verbs.
- **your-first-world:** a container, and an `instead` rule in Snack Attack, if it reads naturally, with its test kept in sync.
- **A new guide page, *Porting Zork*:** how the native slice maps ZIL concepts to the schema.
- **CHANGELOG.**

## Out of scope for stage 1

- Darkness and light, fuses and daemons, death, endings, randomness, VERBOSE/BRIEF, visit points (stage 2).
- Disambiguation, orphaning, ALL beyond TAKE, multiple objects, AGAIN/OOPS/UNDO, save slots (stage 3).
- NPC places and movement, topics, orders, combat, the code hatch, weight (stage 4).
- Vehicles (stage 5).
