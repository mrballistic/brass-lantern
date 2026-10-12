# Brass Lantern 2.2.0: names resolve the way players type them

**Status:** approved in conversation 2026-10-12, section by section.

## Goal

Fix the name-resolution gaps found playing Office Space 2.1.4, add a typo-tolerant match with optional world-voiced replies, and release them as **2.2.0** (a minor: `World.typoReplies` and `GameState.typoMocked` are optional additions). Then move Office Space onto 2.2.0 as **2.1.5**.

What the transcripts showed:

- In Lumbergh’s office, carrying his mug, `examine lumbergh` and `give report to lumbergh` both ask “Which do you mean: the desk drawer, the banner, or the Lumbergh’s coffee mug?”. Objects are tried before people, and the substring tier matches “lumbergh” inside the IDs `lumbergh_drawer`, `lumbergh_banner`, `lumberghs_mug` and the name “Lumbergh’s coffee mug”.
- `give lumbergh tps report` (no TO) parses as one object, “lumbergh tps report”; it only ever worked when the LLM re-read it.
- `lunbergh` matches nothing.
- `put on hawaiian shirt` with the shirt on the floor says “You aren’t carrying a “hawaiian shirt”.”
- Answering “both” to a which-question is read as a fresh command (a direction).
- The which-question always prints “the”, so a possessive name reads “the Lumbergh’s coffee mug”.

## Constraints

- Fidelity is the gate: the full engine suite, including the Zork I diff and full-run tests and the Zork II/III slices, stays green after every task. A Zork difference that a change introduces is fixed, or allowlisted with its reason only if the original agrees with the new behaviour.
- Engine misses never mutate state. Nothing in this spec writes state on a turn the engine didn’t act on.
- Randomness only inside effects: typo replies rotate deterministically, no draw.
- The engine never branches on a world’s IDs; the reply voice is world data.
- Fuzzy matching stays in `packages/engine/src/engine/fuzzy.ts`; resolution helpers in `model.ts`.
- Smart punctuation in every player-facing line. Publishing needs the owner’s approval (the `npm-publish` environment, then npm’s staged-publish 2FA). Office Space tags deploy, so they wait for the owner’s go-ahead.
- Never read, print or commit `.env` files.

## 1. Ranked matching, objects and people together

`fuzzy.ts` reports how strongly a candidate matches, strongest first:

1. **Exact:** the whole input equals the ID, the name or an alias.
2. **Name word:** the input is a whole word (or run of whole words) of the name or an alias.
3. **ID word or name part:** the input is a whole word of the ID, or a substring of the name or an alias.
4. **ID part:** the input is a substring of the ID.
5. **Word start:** the existing token-prefix tier, under the 2.1.0 rule (every typed word of three or more letters matches a token).
6. **Typo:** Section 2.

`fuzzyCandidates` returns every candidate tied at the strongest rank present (the ask-on-tie contract is unchanged); a new export returns the rank alongside, so callers can compare pools. `fuzzyMatch` follows the same ranking and returns the first of the best. The existing `byId` (intent-server turns) and `selfWords` options and the whole-number rule keep their current precedence ahead of the ranks.

A resolution helper in `model.ts` resolves a word against objects and people at once: each pool is ranked, and the strongest rank wins. On a tie between pools, objects win (today’s behaviour), except where the caller asks for people first (Section 3). Several winners within the winning pool still raise the which-question.

Callers that today try objects and then people switch to the helper: EXAMINE (`verbs/objects.ts`), ATTACK and THROW AT (`verbs/attack.ts`), BURN (`verbs/burn.ts`), FOLLOW (`verbs/follow.ts`). Callers that resolve only objects or only people keep doing so, with the new ranking inside.

Example: “lumbergh” is a name word of “Bill Lumbergh” (rank 2), and only a name part of “Lumbergh’s coffee mug” and an ID word of `lumbergh_drawer` (rank 3), so Lumbergh wins.

## 2. Typos, and the replies to them

**Matching (rank 6).** Applies only to a typed word of five or more letters that matched no candidate word at an earlier rank.

- Distance is optimal-string-alignment Damerau–Levenshtein (substitution, insertion, deletion, adjacent transposition) on normalized words.
- Each such word is compared with every word of the candidate’s name, aliases and ID, and with that word’s prefix cut to the typed word’s length. Similarity is `1 − distance / max(length)`; a pair passes at **0.8** or more. (“lunbergh” vs “lumbergh”: 0.875. “lunberg” vs “lumbergh”: 0.75, but vs the prefix “lumberg”: 0.857.)
- In a several-word phrase, every typed word of three or more letters must still match a candidate word, exactly, by prefix, or by typo (the 2.1.0 rule, with typos counting). So a misspelled first word can’t drift to a candidate that matches only the second.
- Among typo matches the highest similarity wins (summed over typo-matched words); equal similarity raises the which-question.
- Only the candidates the verb already considers (in sight, carried, present). Intent-server turns (`byId`) skip this rank. Exits stay exact (unchanged).

**Reporting.** A match at rank 6 notes `{ typed, id }` for the turn (alongside the existing acted-on record), where `typed` is the player’s word as typed.

**Replies.** Optional `World.typoReplies?: string[]`, templates with `{typed}` (the word as typed, in the player’s casing) and `{name}` (the thing’s name, article rules from Section 4). When a turn the engine acted on resolved something by typo, and that ID isn’t in `GameState.typoMocked`, the engine prints one reply ahead of the command’s own lines and appends the ID. The reply is `typoReplies[typoMocked.length % typoReplies.length]` (rotation, no RNG), taken before appending. No `typoReplies`: corrections are silent and `typoMocked` isn’t written. A turn that missed writes nothing.

- `GameState.typoMocked?: string[]` is optional, so saves need no migration; a missing field reads as empty.
- `auditWorld` flags an empty `typoReplies` array and any `{…}` placeholder other than `{typed}` and `{name}`.

**Out of scope:** typos the LLM corrects (the engine never sees what was misspelled), room names in GO TO, verbs.

## 3. GIVE

- **GIVE PERSON THING.** In the dispatcher’s `give` case, before `withRules`: when there is no indirect object and the whole target doesn’t resolve to something carried, try splitting the target’s words. If a leading run of words names a person present (any rank, typos included) and the rest, minus a leading THE, names something carried, rewrite to `{ target: rest, indirect: person }`. Longest person-run first. If no split fits, the action is unchanged, so the reply is today’s. A split that resolves by typo reports like any other (Section 2).
- **People first for GIVE/SHOW … TO.** The indirect object of `give` and `show` resolves through the Section 1 helper with people preferred on a tie, including where `withRules` resolves the indirect slot for world rules. (The 2.1.4 question “the desk drawer, the banner, or the mug?” came from rule resolution trying objects.)

## 4. WEAR, “both”, and the article

- **WEAR takes first.** If WEAR’s target isn’t carried but is in sight and portable, run the built-in TAKE through its normal path (`withRules('take')`, so take rules and refusals apply). If the take leaves it carried, print `(first taking the {name})` and continue with WEAR; otherwise return the take’s reply. A failed take changes nothing beyond what TAKE itself would.
- **“Both”.** When a which-question is pending and the answer is `both`, `all` or `each` (optionally after THE, as answers already allow):
  - For `take`, `drop` and `put`, run the existing ALL handling restricted to the asked-about candidates, in their listed order.
  - For any other verb, reply “One at a time: {the list}?” (the same list as the question) and keep the question pending.
- **The article.** The which-question list (`ask.ts`) prints each item with its own article: “the” by default, none when `article` is `''`. Characters, who can now appear in a which-list via Section 1, use the NPC article helper (lowercase mid-sentence).

## 5. Testing, docs, release (brass-lantern)

- **Failing test first** for every change.
  - `fuzzy.ts` unit tests: each rank and their order; the typo maths (lunbergh, lunberg, a four-letter word untouched, two equal typo matches asking); ID words ranking below name words; the 2.1.0 every-word rule with typos counting.
  - Fixture-world tests: an item whose ID and name contain a character’s name losing EXAMINE and GIVE … TO to that character; GIVE PERSON THING, with THE and with a typo; WEAR from the floor, and WEAR refused by a take rule changing nothing; “both” for TAKE and for GIVE; typo replies firing once per ID, rotating, absent without `typoReplies`, and not recorded on a miss; the audit flags; a which-list with `article: ''` and with a character.
  - `packages/engine/tests/fixtures/world.ts` gains a `typoReplies` list and an item named after one of its characters.
- **Stays green:** the Zork I diff and full runs, the Zork II/III slices, the tutorial test, coverage thresholds (80/80/80, branches 75). `auditWorld` passes on every bundled world.
- **Office Space probe before the PR:** pack the engine, install it into a scratch copy of Office Space, and play the 2.1.4 transcripts’ failing lines (Section “What the transcripts showed”) plus the perfect run.
- **Versions:** all packages to 2.2.0 (`packages/engine/src/version.ts`, engine, vue, server; vue’s engine range to `^2.2.0`).
- **Docs:** world reference (`typoReplies`, `typoMocked` noted under state, how names match); commands reference (implicit take on WEAR, GIVE PERSON THING, “both”); HELP only if its wording changes; CHANGELOG; backlog items touched crossed off.
- Whole-branch review, PR, merge and tag `v2.2.0` with the owner’s approval.

## 6. Office Space 2.1.5 (phase 2, in `infocom-office-space`)

- `@brass-lantern/engine` and `/vue` to `^2.2.0`; the server’s `@brass-lantern/server` to `^2.2.0`.
- `typoReplies` in Lumbergh’s voice (smart punctuation, American spelling), three or four of them.
- `article: ''` on `lumberghs_mug`.
- Tests: the 2.1.4 failing lines now work (`examine lumbergh` and `give report to lumbergh` in his office carrying the mug, `give lumberg tps report`, `give lunbergh report`, `put on hawaiian shirt` from the floor, “both” at Chotchkie’s), and the gameplay/perfect runs stay green.
- CHANGELOG 2.1.5, versions 2.1.5, review, PR; tag `v2.1.5` with the owner’s go-ahead.
