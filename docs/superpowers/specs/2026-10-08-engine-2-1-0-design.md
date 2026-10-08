# Brass Lantern 2.1.0: fixes found consuming 2.0.0

**Status:** approved in conversation 2026-10-08, section by section.

## Goal

Fix the engine gaps Office Space 2.1.0 ran into, plus the general-purpose engine items any world author could hit, and release them as **2.1.0** (a minor: FOLLOW, the NPC `article` field and save repair are additions). Then move Office Space onto 2.1.0 and delete the workarounds it needed, as Office Space **2.1.1**.

Zork-fidelity backlog items (Infocom-style edge cases from the parity stages) stay out of scope.

## Constraints

- Fidelity is the gate: the full engine suite, including the Zork I diff and full-run tests and the Zork II/III slices, stays green after every task. A Zork test that loses a name match gets an alias in that world, never a looser rule.
- Defaults don't change behaviour for existing worlds unless the item below says so (the fuzzy rule and the EXAMINE gate are the deliberate behaviour changes).
- Smart punctuation in every player-facing line. Publishing needs the owner’s approval (the `npm-publish` environment, then npm’s staged-publish 2FA). Office Space tags deploy, so they wait for the owner’s go-ahead.
- Never read, print or commit `.env` files.

## 1. Parser and matching

- **FOLLOW is a built-in verb.** `FOLLOW X` parses to `{ action: 'follow', target }`; bare `FOLLOW` asks “What do you want to follow?”. Dispatch goes through `withRules('follow')`: `instead.follow` rules first; with none, a character gets “You’d rather {The name} came to you. Try {NAME}, FOLLOW ME.” (using the NPC article, Section 2) and a thing gets “You can’t follow that.”. Inside orders, `X, FOLLOW ME` now parses with no world verb, so `orders.follow` rules fire. Added in the four places a built-in verb lives: the parser (`RE`, `VERB_PATTERNS`, `BUILT_IN_WORDS`, `BARE_VERBS`), the dispatcher, HELP, and the intent server’s `ACTION_VOCAB` (so `@brass-lantern/server` releases 2.1.0 too). No following state is added: “start following” is a possible later feature.
- **“and” inside names.** `splitCommands(input, verbs, names?)` takes an optional list of item and character names/aliases that contain “ and ”; phrases on that list are masked before splitting and restored after, longest first, word-bounded. `createGame` and the Vue store pass the world’s list (computed once). Worlds without such names behave as before.
- **The fuzzy rule.** The token-overlap tier (the last resort, in both `fuzzyCandidates` and `fuzzyMatch`) matches only when every typed word of three or more letters matches a token of the candidate’s id, name or aliases. Earlier tiers (exact id, name, alias, substring) are unchanged.
- **ME / MYSELF topics.** ASK/TELL X ABOUT ME and dialogue choices match a topic or choice named or aliased exactly “me”/“myself” (an option on `fuzzyCandidates`, passed only from those callers). ME still never fuzzy-matches objects.
- **Word tables.** Lookups in `SINGLE_WORD`, `BARE_VERBS`, `DIRECTIONS` and similar tables use `Object.hasOwn` (or null-prototype tables), so “constructor”, “tostring” and “__proto__” are just unknown words.

## 2. World data and the audit

- **`direction:`** accepts any lowercase word in conditions (`conditionProblems`), since orders set it to the typed target.
- **One exit check.** A shared `exitRefusal(exit, world, state)` covers `if`, `denials` and doors; the player’s moves, characters’ moves and `ctx.exits` all use it, so scripts respect `denials`.
- **Templates in listings.** `{var:NAME}` and `{number}` expand in item listing sentences (room listings, contents, surfaces).
- **`go: true` world verbs** (DRIVE, LAND) run through `withRules('go')`, so `instead.go` rules see them.
- **NPC `article`.** Optional `article?: string` on characters; default “the” in brass style (no change). `''` marks a proper name. Brass lines that prefix a character name (“The X can’t go that way.” and the new FOLLOW refusal) use it.

## 3. Darkness and light

- **EXAMINE in the dark.** EXAMINE of a character in an unlit room gives the darkness reply, as GIVE already does. Only EXAMINE changes; fights, orders and talk in the dark are untouched.
- **LIGHT a burning thing.** `turn_on` on a `flaming` item that isn’t `switchable` replies “It’s already lit.” instead of “You can’t turn that on.”. Room lighting is unchanged: only `light: true` items that are on give light. Worlds can still override with `instead.turn_on`.

## 4. Saves

When restoring a current-format save, any item id the save has no `locations` entry for gets its starting place from the world’s initial state. Items the player used up keep their recorded `null`. The save format version doesn’t change.

## 5. Testing and release (brass-lantern)

- Each fix gets a failing test first in the existing engine test files, mostly small Office Space-shaped cases in a tiny test world: “take flair from lost and found”, “give smiley flair” after it’s gone, “samir, follow me”, bare “follow samir”, “ask joanna about me”, an order rule with `direction:basement`, a save missing an item, EXAMINE a character in the dark, LIGHT a lit match, “constructor”, a `go: true` verb meeting an `instead.go` rule, a template in a listing, `ctx.exits` meeting a denial, an `article: ''` refusal line.
- The Vue store passes names to `splitCommands` (store test); the server’s vocabulary gains `follow` (server test); `auditWorld` passes on every bundled world.
- All packages to 2.1.0 (`packages/engine/src/version.ts`, engine, vue, server; vue’s engine range to `^2.1.0`). CHANGELOG; world reference (`article`, FOLLOW, the fuzzy rule); commands docs (FOLLOW); backlog items crossed off.
- Whole-branch review, PR, merge and tag `v2.1.0` with the owner’s approval. This is the first release on npm trusted publishing: confirm each package’s Trusted Publisher (repo `mrballistic/brass-lantern`, workflow `release.yml`, environment `npm-publish`) is configured before tagging.

## 6. Office Space 2.1.1 (phase 2, in `infocom-office-space`)

- `@brass-lantern/engine` and `/vue` to `^2.1.0`; the server’s `@brass-lantern/server` to `^2.1.0`.
- Remove the workarounds:
  - the `follow` world verb (the built-in takes over; extra phrasings either go or stay as non-clashing world-verb words; `orders.follow` rules unchanged);
  - Milton’s basement order script, back to a plain `direction:basement` order rule;
  - `placeFixtures` and `fixtures_21` (a test loads a simulated 2.0.0 save and sees the fixtures on the very first LOOK);
  - the lost and found box’s `lost` alias and its “take found” refusal;
  - `giveLoveFlair`, if the existing repeated-give test passes without it; otherwise it stays.
- `article: ''` on the proper-name characters (Samir, Milton, Joanna, Lumbergh, Michael Bolton, Tom, Lawrence, Stan, Brian).
- CHANGELOG 2.1.1, versions 2.1.1, the whole suite (perfect run included) green, review, PR; tag `v2.1.1` with the owner’s go-ahead.
