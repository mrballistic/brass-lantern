# Brass Lantern 2.2.0 Name Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Names resolve the way players type them: whole words beat fragments across objects and people, close misspellings match (with optional world-voiced replies), GIVE PERSON THING parses, WEAR takes first, “both” answers a which-question, and which-lists use each item’s article.

**Architecture:** `fuzzy.ts` gains `rankCandidates`, which reports a rank (1 exact … 6 typo) with the tied IDs; `fuzzyCandidates`/`fuzzyMatch` become thin wrappers. `model.ts` gains `pickThing`, which ranks objects and people together, and records typo resolutions per turn (like `noteActed`). `engine.ts` prints a typo reply on turns the engine acted on, splits GIVE PERSON THING before rules, and takes before WEAR. `conversation.ts` answers “both”.

**Tech Stack:** TypeScript 6, Vitest 5, npm workspaces (`packages/engine`, `packages/vue`, `packages/server`, `apps/site`), VitePress docs.

**Spec:** `docs/superpowers/specs/2026-10-12-name-matching-design.md`

## Global Constraints

- Work in `~/current_work/brass-lantern` on branch `name-matching-2-2-0`. Engine paths below are relative to `packages/engine/`.
- Fidelity gate: the full engine suite (Zork I diff and full runs, Zork II/III slices, tutorial) stays green after every task. Run `npm run test -w @brass-lantern/engine` before each commit.
- Engine misses never mutate state; nothing writes `typoMocked` on a turn that missed or asked.
- Randomness only inside effects: typo replies rotate (`typoMocked.length % typoReplies.length`), no RNG.
- The engine never branches on a world’s IDs. Fuzzy matching lives only in `src/engine/fuzzy.ts`.
- Typo matching (rank 6) is off in Infocom style (`world.style === 'infocom'`) and on intent-server turns (`byId`): Zork’s parser never guesses, and IDs are already exact. (Refinement of the spec, which is silent on style.)
- Typo threshold **0.8** similarity, typed words of **5+** letters only.
- Ties between objects and people: EXAMINE and world-rule resolution prefer objects; ATTACK and FOLLOW prefer people (their order today); the indirect object of GIVE and SHOW prefers people. BURN is unchanged. (Refinement: the spec’s “objects win ties” is today’s order for EXAMINE and rules; ATTACK/FOLLOW already put people first.)
- Player-facing text uses curly quotes and apostrophes (“ ” ’) and American spelling. Code comments may use anything.
- Commit after every task, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read, print or commit `.env` files. Never publish, tag or merge without the owner’s approval.

## Review Focus

1. A misspelled word on a command that then misses (GIVE something you don’t carry to “nieghbor”): no reply, `typoMocked` unchanged. Test in Task 5.
2. A misspelled word in Infocom style or on an intent-server (`byId`) turn: a plain miss, so Zork parity and the LLM retry are unaffected. Tests in Tasks 2 and 5.
3. A short typo (“shrt”, four letters) or a phrase whose other word names nothing (“brasss lamp”): no match, not a stretch to something else. Tests in Task 2.
4. “Both” for a verb that can’t do ALL (GIVE): the question stays open and a later plain answer still works. Test in Task 8.
5. `typoMocked` across UNDO/save: it’s plain state, so a snapshot round-trip keeps it, and a state without it behaves as empty. Test in Task 5.

---

### Task 1: Ranked matching (ranks 1–5)

**Files:**
- Modify: `src/engine/fuzzy.ts` (add `RANK`, `Ranked`, `rankCandidates`; rewrite `fuzzyCandidates` and `fuzzyMatch` on top of it)
- Test: `tests/engine/fuzzy.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  export const RANK: { exact: 1; nameWord: 2; idWordOrNamePart: 3; idPart: 4; wordStart: 5; typo: 6 };
  export interface Ranked { rank: number; ids: string[]; typed?: string } // rank 0 = no match
  export function rankCandidates(input: string, candidates: Array<{ id: string; name: string; aliases?: string[] }>, opts?: { byId?: boolean; selfWords?: boolean; typos?: boolean; coarse?: boolean }): Ranked;
  export function fuzzyCandidates(input, candidates, opts?: { byId?: boolean; selfWords?: boolean; typos?: boolean }): string[]; // = rankCandidates(...).ids
  export function fuzzyMatch(input, candidates): string | null; // = rankCandidates(...).ids[0] ?? null
  ```

- [ ] **Step 1: Write the failing tests** (append to `tests/engine/fuzzy.test.ts`; add `rankCandidates, RANK` to its import from `../../src/engine/fuzzy`)

```ts
describe('ranks', () => {
  const c = [
    { id: 'neighbor', name: 'Neighbor' },
    { id: 'neighbors_mug', name: 'Neighbor’s coffee mug', aliases: ['mug'] },
    { id: 'neighbor_banner', name: 'banner' },
    { id: 'mailbox', name: 'tin box' },
  ];
  const others = c.slice(1);
  it('an exact name beats an item that only contains it', () => {
    expect(rankCandidates('neighbor', c)).toEqual({ rank: RANK.exact, ids: ['neighbor'] });
  });
  it('a whole word of a name is rank 2', () => {
    expect(rankCandidates('coffee', c)).toEqual({ rank: RANK.nameWord, ids: ['neighbors_mug'] });
  });
  it('a word of an ID and a part of a name tie at rank 3', () => {
    expect(rankCandidates('neighbor', others)).toEqual({ rank: RANK.idWordOrNamePart, ids: ['neighbors_mug', 'neighbor_banner'] });
  });
  it('a part of an ID is rank 4', () => {
    expect(rankCandidates('mail', c)).toEqual({ rank: RANK.idPart, ids: ['mailbox'] });
  });
  it('word starts are rank 5', () => {
    expect(rankCandidates('coff mug', c)).toEqual({ rank: RANK.wordStart, ids: ['neighbors_mug'] });
  });
  it('nothing is rank 0', () => {
    expect(rankCandidates('trombone', c)).toEqual({ rank: 0, ids: [] });
  });
  it('fuzzyCandidates returns the best rank’s IDs', () => {
    expect(fuzzyCandidates('neighbor', c)).toEqual(['neighbor']);
    expect(fuzzyCandidates('neighbor', others)).toEqual(['neighbors_mug', 'neighbor_banner']);
  });
  it('coarse folds ranks 2–4 into one tie (the 2.1 substring tier)', () => {
    expect(rankCandidates('banner', [{ id: 'flag', name: 'flag banner' }, { id: 'banner_pole', name: 'pole' }], { coarse: true }).ids).toEqual(['flag', 'banner_pole']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/engine/tests/engine/fuzzy.test.ts`
Expected: FAIL, `rankCandidates is not a function` (or an import error).

- [ ] **Step 3: Implement.** In `src/engine/fuzzy.ts`, move `type Candidate` above its first use, then add after `byWholeNumber` and replace the bodies of `fuzzyMatch` and `fuzzyCandidates` (keep their doc comments, updated to say they follow `rankCandidates`):

```ts
/** How strongly a candidate matches, strongest first. 0 is no match. */
export const RANK = { exact: 1, nameWord: 2, idWordOrNamePart: 3, idPart: 4, wordStart: 5, typo: 6 } as const;

/** The best rank any candidate reached, the candidates tied at it, and (for a typo) the word as the player typed it. */
export interface Ranked {
  rank: number;
  ids: string[];
  typed?: string;
}

const NONE: Ranked = { rank: 0, ids: [] };

/** Does `hay` contain `run` as consecutive whole words? */
const containsRun = (hay: string[], run: string[]): boolean =>
  run.length > 0 && hay.some((_, i) => run.every((t, j) => hay[i + j] === t));

/**
 * Ranks `candidates` against what the player typed (see RANK): exact name, alias or ID; a whole word of a
 * name or alias; a whole word of the ID or part of a name; part of the ID; word starts (every typed word of
 * three or more letters matching); with `typos`, a close misspelling. `coarse` folds ranks 2–4 into one
 * tier, as 2.1 matched. ME, digits and (with `byId`) exact IDs keep their precedence ahead of the ranks.
 */
export function rankCandidates(
  input: string,
  candidates: Candidate[],
  opts: { byId?: boolean; selfWords?: boolean; typos?: boolean; coarse?: boolean } = {},
): Ranked {
  const needle = normalize(input);
  if (!needle) return NONE;
  const self = selfMatches(needle, candidates, opts.byId, opts.selfWords);
  if (self) return self.length > 0 ? { rank: RANK.exact, ids: self } : NONE;
  if (DIGITS.test(needle)) {
    const ids = byWholeNumber(needle, candidates);
    return ids.length > 0 ? { rank: RANK.exact, ids } : NONE;
  }
  const exactId = candidates.filter((c) => normalize(c.id) === needle);
  if (exactId.length > 0 && (opts.byId || needle.includes('_'))) return { rank: RANK.exact, ids: [exactId[0].id] };
  const words = (c: Candidate) => [c.name, ...(c.aliases ?? [])].map(normalize);
  const run = tokens(needle);
  const nameWord = (c: Candidate) => words(c).some((w) => containsRun(tokens(w), run));
  const idWordOrNamePart = (c: Candidate) => containsRun(tokens(c.id), run) || words(c).some((w) => w.includes(needle));
  const idPart = (c: Candidate) => normalize(c.id).includes(needle);
  const tiers: Array<[number, (c: Candidate) => boolean]> = [
    [RANK.exact, (c) => normalize(c.id) === needle || words(c).includes(needle)],
    ...(opts.coarse
      ? [[RANK.nameWord, (c: Candidate) => nameWord(c) || idWordOrNamePart(c) || idPart(c)] as [number, (c: Candidate) => boolean]]
      : ([
          [RANK.nameWord, nameWord],
          [RANK.idWordOrNamePart, idWordOrNamePart],
          [RANK.idPart, idPart],
        ] as Array<[number, (c: Candidate) => boolean]>)),
  ];
  for (const [rank, test] of tiers) {
    const ids = candidates.filter(test).map((c) => c.id);
    if (ids.length > 0) return { rank, ids };
  }
  if (needle.length <= 2) return NONE;
  const needleTokens = tokens(needle);
  let best = 0;
  let ids: string[] = [];
  for (const c of candidates) {
    const hay = [...tokens(c.id), ...words(c).flatMap(tokens)];
    if (!coversAll(needleTokens, hay)) continue;
    const score = tokenPrefixScore(needleTokens, hay);
    if (score > best) [best, ids] = [score, [c.id]];
    else if (score === best && score > 0) ids.push(c.id);
  }
  if (ids.length > 0) return { rank: RANK.wordStart, ids };
  return NONE;
}

export function fuzzyMatch(input: string, candidates: Array<{ id: string; name: string; aliases?: string[] }>): string | null {
  if (!input) return null;
  return rankCandidates(input, candidates).ids[0] ?? null;
}

export function fuzzyCandidates(
  input: string,
  candidates: Array<{ id: string; name: string; aliases?: string[] }>,
  opts: { byId?: boolean; selfWords?: boolean; typos?: boolean } = {},
): string[] {
  return rankCandidates(input, candidates, opts).ids;
}
```

- [ ] **Step 4: Run the fuzzy tests, then the whole engine suite**

Run: `npx vitest run packages/engine/tests/engine/fuzzy.test.ts && npm run test -w @brass-lantern/engine`
Expected: PASS. If a Zork test (`zork1-diff`, `zork1-full`, or a Zork II/III slice) now fails because a which-question the original asks is answered by the finer ranks, make Infocom style coarse: in `src/engine/model.ts` pass `coarse: world.style === 'infocom'` in every `rankCandidates`/`fuzzyCandidates` call that has `world` (Task 3 adds the remaining ones). Re-run until green.

- [ ] **Step 5: Lint, type-check, commit**

```bash
npm run lint && npm run type-check
git add packages/engine/src/engine/fuzzy.ts packages/engine/tests/engine/fuzzy.test.ts
git commit -m "Engine: rank fuzzy matches (exact, name word, ID word or name part, ID part, word start)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The typo rank

**Files:**
- Modify: `src/engine/fuzzy.ts`
- Test: `tests/engine/fuzzy.test.ts` (append)

**Interfaces:**
- Consumes: `rankCandidates`, `RANK` (Task 1).
- Produces: `rankCandidates(..., { typos: true })` returns `{ rank: RANK.typo, ids, typed }` where `typed` is the first misspelled word as the player typed it; `export function editDistance(a: string, b: string): number`; `export function typoSimilarity(typed: string, word: string): number`; `export const TYPO_SIMILARITY = 0.8`; `export const TYPO_MIN_LENGTH = 5`.

- [ ] **Step 1: Write the failing tests** (add `editDistance, typoSimilarity` to the import)

```ts
describe('typos', () => {
  const lumbergh = [{ id: 'lumbergh', name: 'Bill Lumbergh' }];
  it('measures edits, swaps included', () => {
    expect(editDistance('lunbergh', 'lumbergh')).toBe(1);
    expect(editDistance('nieghbor', 'neighbor')).toBe(1);
    expect(editDistance('ab', 'ba')).toBe(1);
    expect(typoSimilarity('lunberg', 'lumbergh')).toBeCloseTo(6 / 7);
  });
  it('a close misspelling of 5+ letters is rank 6, with the word as typed', () => {
    expect(rankCandidates('Lunbergh', lumbergh, { typos: true })).toEqual({ rank: RANK.typo, ids: ['lumbergh'], typed: 'Lunbergh' });
    expect(rankCandidates('lunberg', lumbergh, { typos: true }).ids).toEqual(['lumbergh']);
    expect(rankCandidates('bnner', [{ id: 'banner', name: 'banner' }], { typos: true }).ids).toEqual(['banner']);
  });
  it('only when asked', () => {
    expect(rankCandidates('lunbergh', lumbergh)).toEqual({ rank: 0, ids: [] });
    expect(rankCandidates('lunbergh', lumbergh, { typos: true, byId: true })).toEqual({ rank: 0, ids: [] });
  });
  it('leaves short words and far-off words alone', () => {
    expect(rankCandidates('shrt', [{ id: 'shirt', name: 'shirt' }], { typos: true }).rank).toBe(0);
    expect(rankCandidates('banar', [{ id: 'banner', name: 'banner' }], { typos: true }).rank).toBe(0);
  });
  it('every word must still match: a misspelling can’t carry a word that names nothing', () => {
    const keys = [{ id: 'rusty_key', name: 'rusty key' }, { id: 'brass_key', name: 'brass key' }];
    expect(rankCandidates('rustty key', keys, { typos: true })).toMatchObject({ rank: RANK.typo, ids: ['rusty_key'] });
    expect(rankCandidates('brasss lamp', keys, { typos: true }).rank).toBe(0);
  });
  it('equally close misspellings tie', () => {
    expect(rankCandidates('xatter', [{ id: 'hatter', name: 'hatter' }, { id: 'batter', name: 'batter' }], { typos: true }).ids).toEqual(['hatter', 'batter']);
  });
  it('an earlier rank always wins over a typo', () => {
    expect(rankCandidates('lumberg', lumbergh, { typos: true }).rank).toBe(RANK.wordStart);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/engine/tests/engine/fuzzy.test.ts`
Expected: FAIL, `editDistance is not a function`.

- [ ] **Step 3: Implement.** Add above `rankCandidates`:

```ts
/** A close misspelling: this alike or more (1 − edits ÷ the longer length). */
export const TYPO_SIMILARITY = 0.8;
/** Shorter typed words never count as misspellings: “bat” must not become “cat”. */
export const TYPO_MIN_LENGTH = 5;

/** Optimal string alignment distance: substitutions, insertions, deletions and adjacent swaps. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** How alike a typed word is to a word, or to that word's start cut to the typed length (“lunberg” → “lumberg”): 0 to 1. */
export function typoSimilarity(typed: string, word: string): number {
  const sim = (a: string, b: string) => 1 - editDistance(a, b) / Math.max(a.length, b.length);
  return Math.max(sim(typed, word), word.length > typed.length ? sim(typed, word.slice(0, typed.length)) : 0);
}

/** Rank 6: each typed word of 3+ letters matches a candidate word exactly, by its start, or (5+ letters) as a close misspelling. */
function typoRank(input: string, needleTokens: string[], candidates: Candidate[], words: (c: Candidate) => string[]): Ranked {
  const checked = needleTokens.filter((t) => t.length >= 3 && !FUNCTION_WORDS.has(t));
  let best = 0;
  let ids: string[] = [];
  let typo: string | undefined;
  for (const c of candidates) {
    const hay = [...tokens(c.id), ...words(c).flatMap(tokens)];
    let score = 0;
    let first: string | undefined;
    let fits = true;
    for (const t of checked) {
      if (tokenPrefixScore([t], hay) > 0) continue;
      const sim = t.length < TYPO_MIN_LENGTH ? 0 : Math.max(0, ...hay.map((h) => typoSimilarity(t, h)));
      if (sim < TYPO_SIMILARITY) {
        fits = false;
        break;
      }
      score += sim;
      first ??= t;
    }
    if (!fits || !first) continue;
    if (score > best) [best, ids, typo] = [score, [c.id], first];
    else if (score === best) ids.push(c.id);
  }
  if (ids.length === 0 || !typo) return NONE;
  const typed = input.trim().split(/\s+/).find((w) => normalize(w) === typo) ?? typo;
  return { rank: RANK.typo, ids, typed };
}
```

and replace the final `return NONE;` of `rankCandidates` with:

```ts
  if (!opts.typos || opts.byId) return NONE;
  return typoRank(input, needleTokens, candidates, words);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/engine/tests/engine/fuzzy.test.ts && npm run test -w @brass-lantern/engine`
Expected: PASS (nothing passes `typos` yet, so behavior elsewhere is unchanged).

- [ ] **Step 5: Lint, type-check, commit**

```bash
npm run lint && npm run type-check
git add packages/engine/src/engine/fuzzy.ts packages/engine/tests/engine/fuzzy.test.ts
git commit -m "Engine: a typo rank for close misspellings (80%, 5+ letters)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Objects and people ranked together

**Files:**
- Modify: `src/engine/model.ts` (typos on in `pickItem`/`matchNpc`, typo notes, new `pickThing`)
- Modify: `src/engine/verbs/objects.ts` (`handleExamine`), `src/engine/verbs/attack.ts` (`handleAttack`), `src/engine/verbs/follow.ts`, `src/engine/rules.ts` (`withRules`)
- Create: `tests/engine/names.test.ts`

**Interfaces:**
- Consumes: `rankCandidates`, `RANK` (Tasks 1–2).
- Produces:
  ```ts
  export type Thing = { item: string; npc?: undefined } | { npc: string; item?: undefined };
  export function pickThing(word: string, itemIds: string[], world: World, state: GameState, opts?: { slot?: 'target' | 'indirect'; prefer?: 'items' | 'people' }): Thing | null;
  export function takeTypos(state: GameState): Array<{ id: string; typed: string }>; // this turn's typo resolutions, cleared on read
  ```
  `pickItem` and `matchNpc` keep their signatures; with typos on they record `{ id, typed }` for a typo resolution.

- [ ] **Step 1: Write the failing tests** in a new `tests/engine/names.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/engine/engine';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';
import type { World } from '../../src/types/world';

/** The yard, plus things named after the neighbor (as Office Space names things after Lumbergh). */
export const world: World = {
  ...fixtureWorld,
  rooms: { ...fixtureWorld.rooms, yard: { ...fixtureWorld.rooms.yard, items: [...fixtureWorld.rooms.yard.items, 'neighbors_mug', 'neighbor_banner'] } },
  items: {
    ...fixtureWorld.items,
    neighbors_mug: { name: 'Neighbor’s coffee mug', aliases: ['mug'], article: '', description: 'A chipped mug.', portable: true, tags: [] },
    neighbor_banner: { name: 'banner', description: 'A faded banner.', portable: false, tags: [] },
  },
};

describe('objects and people, ranked together', () => {
  it('EXAMINE finds the person over things that only contain the name', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['neighbors_mug'] });
    expect(execute({ action: 'examine', target: 'neighbor' }, { world, state: s }).lines).toEqual(['Your neighbor, leaning on the fence.']);
  });
  it('GIVE … TO finds the person', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['wallet'] });
    const r = execute({ action: 'give', target: 'wallet', indirect: 'neighbor' }, { world, state: s });
    expect(r.ask).toBeUndefined();
    expect(r.understood).not.toBe(false);
  });
  it('a stronger object match still wins', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'coffee mug' }, { world, state: s }).lines).toEqual(['A chipped mug.']);
  });
  it('a misspelled person is found', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'nieghbor' }, { world, state: s }).lines).toContain('Your neighbor, leaning on the fence.');
  });
  it('no typos in Infocom style', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'nieghbor' }, { world: w, state: s }).understood).toBe(false);
  });
  it('no typos on an intent-server turn', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'nieghbor', byId: true }, { world, state: s }).understood).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/engine/tests/engine/names.test.ts`
Expected: FAIL; the first test gets “Which do you mean: …”, the typo test gets a miss.

- [ ] **Step 3: Implement in `src/engine/model.ts`.** Import `rankCandidates, RANK` from `./fuzzy.ts` (keep the existing imports). Add after `takeActed`:

```ts
/** Typos are guessed in brass style only (Zork never guesses), and never for the intent server's IDs. */
function typosOn(world: World, state?: GameState): boolean {
  return world.style !== 'infocom' && !(state && byIdTurns.has(state));
}

const typosThisTurn = new WeakMap<GameState, Array<{ id: string; typed: string }>>();

function noteTypo(state: GameState, id: string, typed: string): void {
  const list = typosThisTurn.get(state) ?? [];
  if (!list.some((t) => t.id === id)) list.push({ id, typed });
  typosThisTurn.set(state, list);
}

/** What this turn resolved by typo (as typed), read once. */
export function takeTypos(state: GameState): Array<{ id: string; typed: string }> {
  const list = typosThisTurn.get(state) ?? [];
  typosThisTurn.delete(state);
  return list;
}
```

`byIdTurns` is declared later in the file; move its declaration (`const byIdTurns = new WeakSet<GameState>();`) up next to `actedThisTurn` so `typosOn` can use it. Replace `matchNpc`:

```ts
export function matchNpc(target: string, world: World, state: GameState): string | null {
  const present = npcsSeen(world, state, state.currentRoom);
  // Names and aliases, through the one fuzzy matcher.
  const ranked = rankCandidates(target, npcCandidates(present, world), { byId: byIdTurns.has(state), typos: typosOn(world, state) });
  const id = ranked.ids[0] ?? null;
  if (id) {
    noteActed(state, 'npc', id);
    if (ranked.rank === RANK.typo && ranked.typed) noteTypo(state, id, ranked.typed);
  }
  return id;
}
```

In `pickItem`, replace the `let found = …` line with:

```ts
  const ranked = rankCandidates(target, candidates, { byId: state ? byIdTurns.has(state) : false, typos: typosOn(world, state) });
  let found = [...new Set(ranked.ids)];
```

and the `if (found.length === 1)` block with:

```ts
  if (found.length === 1) {
    if (state) {
      noteActed(state, slot, found[0]);
      if (ranked.rank === RANK.typo && ranked.typed) noteTypo(state, found[0], ranked.typed);
    }
    return found[0];
  }
```

Add after `pickSecond`:

```ts
/** A thing or a person, whichever the word names more strongly. */
export type Thing = { item: string; npc?: undefined } | { npc: string; item?: undefined };

/**
 * Resolves a word against objects (`itemIds`) and the people here together: the stronger rank wins;
 * on a tie, `prefer` decides (objects by default). Several equally good objects still ask (AskSignal).
 */
export function pickThing(
  word: string,
  itemIds: string[],
  world: World,
  state: GameState,
  opts: { slot?: 'target' | 'indirect'; prefer?: 'items' | 'people' } = {},
): Thing | null {
  const fuzzyOpts = { byId: byIdTurns.has(state), typos: typosOn(world, state) };
  const items = rankCandidates(word, itemCandidates(itemIds, world), fuzzyOpts).rank;
  const people = rankCandidates(word, npcCandidates(npcsSeen(world, state, state.currentRoom), world), fuzzyOpts).rank;
  const peopleWin = people > 0 && (items === 0 || people < items || (people === items && opts.prefer === 'people'));
  if (peopleWin) {
    const npc = matchNpc(word, world, state);
    if (npc) return { npc };
  }
  const item = items > 0 ? pickItem(word, itemIds, world, opts.slot ?? 'target', state) : null;
  return item ? { item } : null;
}
```

- [ ] **Step 4: Use it.** In `src/engine/verbs/objects.ts` `handleExamine`, replace the first two lines after `needObject()` and the NPC lookup:

```ts
  const thing = pickThing(target, visibleItems(world, state), world, state);
  const matchedItem = thing?.item ?? null;
  if (matchedItem) {
```

…keep the item branch unchanged, then replace `const matchedNpc = matchNpc(target, world, state);` with `const matchedNpc = thing?.npc ?? null;`. Add `pickThing` to the import from `../model.ts` (drop `matchNpc` there if unused).

In `src/engine/verbs/attack.ts` `handleAttack`, replace from `const npc = matchNpc(action.target, world, state);` through the closing `}` of `if (!npc) { … }`:

```ts
  const found = pickThing(action.target, visibleItems(world, state), world, state, { prefer: 'people' });
  if (!found) return miss(`You don’t see a “${action.target}” here.`);
  const npc = found.npc;
  if (!npc) {
    // Its own attack rule answers first; otherwise Zork's refusal.
    return withRules('attack', action, world, state, () => ok([combatText(world, 'notPerson', { defender: world.items[found.item].name })]));
  }
```

In `src/engine/verbs/follow.ts`:

```ts
export function handleFollow(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) return ok(['What do you want to follow?']);
  const found = pickThing(action.target, visibleItems(world, state), world, state, { prefer: 'people' });
  if (found?.npc) return ok([`You’d rather ${npcthe(world, found.npc)} came to you. Try ${world.npcs[found.npc].name.toUpperCase()}, FOLLOW ME.`]);
  if (found?.item) return ok(['You can’t follow that.']);
  return miss(`You see no “${action.target}” here to follow.`);
}
```

(import `pickThing` and `visibleItems` from `../model.ts`; drop `matchNpc`, `pickItem` if unused.)

In `src/engine/rules.ts` `withRules`, replace the four lines from `const target = typed(action.target) …` through `const indirectNpc = …`:

```ts
  // GIVE and SHOW hand something to someone: a person named there beats a thing named the same.
  const preferPeople = verb === 'give' || verb === 'show';
  const targetThing = typed(action.target) || me(action.target) || !action.target ? null : pickThing(action.target, targetScope(verb, world, state), world, state, { slot: 'target' });
  const target = typed(action.target) ? 'number' : me(action.target) ? PLAYER : (targetThing?.item ?? null);
  const indirectThing =
    typed(action.indirect) || me(action.indirect) || !action.indirect
      ? null
      : pickThing(action.indirect, visibleItems(world, state), world, state, { slot: 'indirect', prefer: preferPeople ? 'people' : 'items' });
  const indirect = typed(action.indirect) ? 'number' : me(action.indirect) ? PLAYER : (indirectThing?.item ?? null);
  // Words that aren't items may name characters, whose rules count too.
  const targetNpc = targetThing?.npc ?? null;
  const indirectNpc = indirectThing?.npc ?? null;
```

(import `pickThing`; drop `pickSecond`, `pickItem`, `matchNpc` from the import if now unused. `me()` already covers what `pickSecond` checked.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/engine/tests/engine/names.test.ts && npm run test -w @brass-lantern/engine`
Expected: PASS. If a Zork test fails, apply the Task 1 Step 4 fallback (`coarse` for Infocom style) to the `rankCandidates` calls in `pickItem`, `matchNpc` and `pickThing`, by adding `coarse: world.style === 'infocom'` to their options.

- [ ] **Step 6: Lint, type-check, commit**

```bash
npm run lint && npm run type-check
git add packages/engine/src/engine packages/engine/tests/engine/names.test.ts
git commit -m "Engine: resolve objects and people together by rank; typos in brass style

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Articles in which-lists

**Files:**
- Modify: `src/engine/ask.ts`
- Test: `tests/engine/ask.test.ts` (append)

**Interfaces:**
- Produces: `export function theName(world: World, id: string): string` (“the brass key”; the bare name for `article: ''`; a character via `npcthe`); `export function listThe(world: World, ids: string[]): string` (now exported).

- [ ] **Step 1: Write the failing test** (append; import `listThe, theName` from `../../src/engine/ask`)

```ts
describe('which-lists use each name’s article', () => {
  const w = {
    ...world,
    items: { ...world.items, mug: { name: 'Neighbor’s coffee mug', article: '', description: 'A mug.', portable: true, tags: [] } },
  };
  it('no “the” before a name with an empty article, and characters use theirs', () => {
    expect(theName(w, 'mug')).toBe('Neighbor’s coffee mug');
    expect(theName(w, 'key')).toBe('the brass key');
    expect(theName(w, 'guard')).toBe('the guard');
    expect(listThe(w, ['mug', 'key'])).toBe('Neighbor’s coffee mug or the brass key');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/engine/tests/engine/ask.test.ts`
Expected: FAIL, `theName is not a function`.

- [ ] **Step 3: Implement** in `src/engine/ask.ts` (import `npcthe` from `./describe.ts`):

```ts
/** “the brass key”; a name whose article is '' stands alone; a character takes its own article. */
export function theName(world: World, id: string): string {
  const item = world.items[id];
  if (!item && world.npcs[id]) return npcthe(world, id);
  return item?.article === '' ? item.name : `the ${item?.name ?? id}`;
}

export function listThe(world: World, ids: string[]): string {
  const names = ids.map((id) => theName(world, id));
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, or ${names.at(-1)}`;
}
```

(replacing the old private `listThe`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/engine/tests/engine/ask.test.ts && npm run test -w @brass-lantern/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run type-check
git add packages/engine/src/engine/ask.ts packages/engine/tests/engine/ask.test.ts
git commit -m "Engine: which-lists honor an empty article and name characters properly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Typo replies

**Files:**
- Modify: `src/types/world.ts` (`World.typoReplies`), `src/types/game.ts` (`GameState.typoMocked`)
- Create: `src/engine/typos.ts`
- Modify: `src/engine/engine.ts` (`executeTurn`), `src/engine/audit.ts`, `tests/fixtures/world.ts`
- Test: `tests/engine/names.test.ts` (append), `tests/worlds/audit.test.ts` or the existing audit test file (append; find it with `grep -ln auditWorld packages/engine/tests -r`)

**Interfaces:**
- Consumes: `takeTypos` (Task 3), `theName` (Task 4).
- Produces: `World.typoReplies?: string[]`; `GameState.typoMocked?: string[]`; `export function typoReply(result: EngineResult, typos: Array<{ id: string; typed: string }>, world: World, state: GameState): EngineResult`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/engine/names.test.ts` (add imports: `createGame` from `../../src/engine/game`, `snapshotState, restoreState` from `../../src/engine/model`):

```ts
describe('typo replies', () => {
  const w: World = { ...world, typoReplies: ['“{typed}”? You mean {name}.', 'Close enough: {name}.'] };
  it('reply once per thing, in rotation, ahead of the command’s lines', () => {
    const s = stateWith(w, { room: 'yard' });
    const first = execute({ action: 'examine', target: 'nieghbor' }, { world: w, state: s });
    expect(first.lines).toEqual(['“nieghbor”? You mean the Neighbor.', 'Your neighbor, leaning on the fence.']);
    expect(s.typoMocked).toEqual(['neighbor']);
    expect(execute({ action: 'examine', target: 'nieghbor' }, { world: w, state: s }).lines).toEqual(['Your neighbor, leaning on the fence.']);
    s.currentRoom = 'shed';
    expect(execute({ action: 'examine', target: 'gaurd' }, { world: w, state: s }).lines[0]).toBe('Close enough: the guard.');
  });
  it('silent without typoReplies', () => {
    const quiet: World = { ...world, typoReplies: undefined };
    const s = stateWith(quiet, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'nieghbor' }, { world: quiet, state: s }).lines).toEqual(['Your neighbor, leaning on the fence.']);
    expect(s.typoMocked).toBeUndefined();
  });
  it('a command that misses records nothing', () => {
    const s = stateWith(w, { room: 'yard' });
    const r = execute({ action: 'give', target: 'wallet', indirect: 'nieghbor' }, { world: w, state: s });
    expect(r.understood).toBe(false);
    expect(s.typoMocked).toBeUndefined();
  });
  it('typoMocked survives a snapshot round-trip (UNDO, saves)', () => {
    const s = stateWith(w, { room: 'yard' });
    const snap = snapshotState(s);
    execute({ action: 'examine', target: 'nieghbor' }, { world: w, state: s });
    const after = snapshotState(s);
    restoreState(s, snap);
    expect(s.typoMocked).toBeUndefined();
    restoreState(s, after);
    expect(s.typoMocked).toEqual(['neighbor']);
  });
  it('works through createGame', () => {
    const game = createGame(w, { seed: 1 });
    game.state.currentRoom = 'yard';
    expect(game.send('x nieghbor').lines[0]).toBe('“nieghbor”? You mean the Neighbor.');
  });
});
```

Append to the audit test file:

```ts
it('flags an empty typoReplies and unknown placeholders', () => {
  expect(auditWorld({ ...fixtureWorld, typoReplies: [] })).toContain('typoReplies is empty: leave it out for silent corrections');
  expect(auditWorld({ ...fixtureWorld, typoReplies: ['{typed} → {nam}'] })).toContain('typoReplies[0]: unknown placeholder “{nam}”');
});
```

(import `fixtureWorld` and `auditWorld` there if the file doesn’t already.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/engine/tests/engine/names.test.ts`
Expected: FAIL; no reply line, and a type error on `typoReplies`.

- [ ] **Step 3: Implement the types.** In `src/types/world.ts`, inside `interface World` (next to other optional reply fields such as `confused`):

```ts
  /**
   * Said when a name the player misspelled is matched anyway (brass style), the first time each thing is
   * reached that way: one line ahead of the command's own, taken in turn. `{typed}` is the word as typed,
   * `{name}` the thing's name with its article. Leave it out and corrections are silent.
   */
  typoReplies?: string[];
```

In `src/types/game.ts`, inside `interface GameState`:

```ts
  /** Things already teased for a misspelling (`World.typoReplies`), in order. */
  typoMocked?: string[];
```

Create `src/engine/typos.ts`:

```ts
import type { GameState } from '../types/game.ts';
import type { World } from '../types/world.ts';
import { theName } from './ask.ts';
import type { EngineResult } from './result.ts';

/**
 * The world's line for a misspelling it matched anyway: the first thing this turn reached by typo that
 * hasn't been teased yet gets the next of `world.typoReplies`, ahead of the command's own lines.
 * Call only for a turn the engine acted on (not a miss or a question).
 */
export function typoReply(result: EngineResult, typos: Array<{ id: string; typed: string }>, world: World, state: GameState): EngineResult {
  const replies = world.typoReplies;
  if (!replies || replies.length === 0) return result;
  const mocked = state.typoMocked ?? [];
  const fresh = typos.find((t) => !mocked.includes(t.id));
  if (!fresh) return result;
  const line = replies[mocked.length % replies.length].replaceAll('{typed}', fresh.typed).replaceAll('{name}', theName(world, fresh.id));
  state.typoMocked = [...mocked, fresh.id];
  return { ...result, lines: [line, ...result.lines], mutated: true };
}
```

- [ ] **Step 4: Wire it in `src/engine/engine.ts` `executeTurn`.** Import `takeTypos` from `./model.ts` and `typoReply` from `./typos.ts`. Next to the existing `takeActed(state);` before dispatch, add `takeTypos(state);`. After the darkness block (the `if (result.understood === false && action.target && …) { … }`), add:

```ts
  // A misspelled name the engine matched anyway: the world may tease the player, once per thing.
  const typos = takeTypos(state);
  if (result.understood !== false && !result.ask && typos.length > 0) result = typoReply(result, typos, world, state);
```

- [ ] **Step 5: Audit.** In `src/engine/audit.ts` `auditWorld`, before it returns `problems`:

```ts
  if (world.typoReplies !== undefined) {
    if (world.typoReplies.length === 0) problems.push('typoReplies is empty: leave it out for silent corrections');
    world.typoReplies.forEach((line, i) => {
      for (const m of line.matchAll(/\{([^}]*)\}/g)) if (m[1] !== 'typed' && m[1] !== 'name') problems.push(`typoReplies[${i}]: unknown placeholder “{${m[1]}}”`);
    });
  }
```

- [ ] **Step 6: Fixture.** In `tests/fixtures/world.ts`, add at the top level of the world object (after `verbs`): `typoReplies: ['“{typed}”? You mean {name}.'],`.

- [ ] **Step 7: Run tests**

Run: `npm run test -w @brass-lantern/engine`
Expected: PASS. If an existing fixture test now gets a reply line it didn’t expect, the test typed a misspelling of something in scope: confirm that, and update the expectation to include the reply.

- [ ] **Step 8: Commit**

```bash
npm run lint && npm run type-check
git add packages/engine/src packages/engine/tests
git commit -m "Engine: World.typoReplies, said once per thing matched by a misspelling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: GIVE PERSON THING

**Files:**
- Modify: `src/engine/verbs/people.ts` (add `splitGiveRecipient`), `src/engine/engine.ts` (`give` case)
- Test: `tests/engine/names.test.ts` (append)

**Interfaces:**
- Consumes: `rankCandidates` (Tasks 1–2).
- Produces: `export function splitGiveRecipient(action: ParsedAction, world: World, state: GameState): ParsedAction`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('GIVE PERSON THING', () => {
  const play = (line: string) => {
    const game = createGame(world, { seed: 1 });
    game.state.currentRoom = 'yard';
    Object.assign(game.state.locations, { wallet: 'player' });
    return game.send(line);
  };
  it('reads the person first', () => {
    expect(play('give neighbor wallet').understood).not.toBe(false);
    expect(play('give neighbor the wallet').lines.join(' ')).not.toContain('aren’t carrying');
  });
  it('with a misspelled person', () => {
    expect(play('give nieghbor wallet').lines.join(' ')).not.toContain('aren’t carrying');
  });
  it('leaves GIVE THING alone', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['wallet'] });
    expect(execute({ action: 'give', target: 'wallet' }, { world, state: s }).understood).not.toBe(false);
  });
  it('no split fits: today’s reply', () => {
    expect(play('give neighbor trombone').lines.join(' ')).toContain('aren’t carrying');
  });
});
```

(`PLAYER` is `'player'`; the fixture’s `give_wallet` event runs on success.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/engine/tests/engine/names.test.ts`
Expected: FAIL; “You aren’t carrying a “neighbor wallet”.”

- [ ] **Step 3: Implement** in `src/engine/verbs/people.ts` (import `rankCandidates` from `../fuzzy.ts`; `inventoryOf`, `npcsSeen` from `../model.ts`; `ParsedAction` type):

```ts
/**
 * GIVE LUMBERGH THE REPORT: when what follows GIVE isn't something carried, but its first words name
 * someone here and the rest (less a leading THE) something carried, it's GIVE the rest TO them.
 */
export function splitGiveRecipient(action: ParsedAction, world: World, state: GameState): ParsedAction {
  if (!action.target || action.indirect || action.byId) return action;
  const typos = world.style !== 'infocom';
  const carried = inventoryOf(world, state).map((id) => ({ id, name: world.items[id]?.name ?? id, aliases: world.items[id]?.aliases }));
  if (rankCandidates(action.target, carried, { typos }).rank > 0) return action;
  const people = npcsSeen(world, state, state.currentRoom).map((id) => ({ id, name: world.npcs[id]?.name ?? id, aliases: world.npcs[id]?.aliases }));
  const words = action.target.trim().split(/\s+/);
  for (let n = words.length - 1; n >= 1; n--) {
    const person = words.slice(0, n).join(' ');
    const rest = words.slice(n).join(' ').replace(/^the\s+/i, '');
    if (rest && rankCandidates(person, people, { typos }).rank > 0 && rankCandidates(rest, carried, { typos }).rank > 0) return { ...action, target: rest, indirect: person };
  }
  return action;
}
```

In `src/engine/engine.ts`, replace the `give` case:

```ts
    case 'give': {
      const give = splitGiveRecipient(action, world, state);
      return withRules('give', give, world, state, () => handleGive(give.target, give.indirect, world, state));
    }
```

(import `splitGiveRecipient` alongside `handleGive`.)

- [ ] **Step 4: Run tests, commit**

Run: `npm run test -w @brass-lantern/engine` → PASS.

```bash
npm run lint && npm run type-check
git add packages/engine/src packages/engine/tests
git commit -m "Engine: GIVE PERSON THING

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: WEAR takes first

**Files:**
- Modify: `src/engine/engine.ts` (`wear` case, new `takeFirst` helper beside `dispatch`)
- Test: `tests/engine/names.test.ts` (append)

**Interfaces:**
- Consumes: `withRules`, `handleTake`, `handleWear`, `pickItem`, `inventoryOf`, `visibleItems`, `isCarried`, `snapshotState`, `restoreState` (existing).

- [ ] **Step 1: Write the failing tests**

```ts
describe('WEAR takes first', () => {
  it('takes it from the floor, then wears it', () => {
    const s = stateWith(world, { room: 'living' });
    const r = execute({ action: 'wear', target: 'shirt' }, { world, state: s });
    expect(r.lines[0]).toBe('(first taking the loud shirt)');
    expect(r.lines).not.toContain('Taken: loud shirt.');
    expect(s.locations.shirt).toBe('player');
    expect(s.firedEvents).toContain('wear_shirt');
  });
  it('a refused take changes nothing', () => {
    const w: World = { ...world, items: { ...world.items, shirt: { ...world.items.shirt, instead: { take: [{ say: ['Not yours to take.'] }] } } } };
    const s = stateWith(w, { room: 'living' });
    const before = structuredClone(s);
    expect(execute({ action: 'wear', target: 'shirt' }, { world: w, state: s }).lines).toEqual(['Not yours to take.']);
    expect(s.locations).toEqual(before.locations);
  });
  it('carried: as before', () => {
    const s = stateWith(world, { room: 'living', carrying: ['shirt'] });
    expect(execute({ action: 'wear', target: 'shirt' }, { world, state: s }).lines[0]).not.toBe('(first taking the loud shirt)');
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run packages/engine/tests/engine/names.test.ts`; expected FAIL “You aren’t carrying a “shirt”.”

- [ ] **Step 3: Implement** in `src/engine/engine.ts`. Add beside `dispatch`:

```ts
/**
 * WEAR of a thing in sight but not held: TAKE it first, rules and all (Infocom's implicit take).
 * Null when it's held, not here, or can't be carried; otherwise the take's result and whether it's now held.
 */
function takeFirst(action: ParsedAction, world: World, state: GameState): { held: boolean; result: EngineResult; id: string } | null {
  if (!action.target) return null;
  const carried = inventoryOf(world, state);
  if (pickItem(action.target, carried, world, 'target', state)) return null;
  const id = pickItem(action.target, visibleItems(world, state).filter((i) => !carried.includes(i)), world, 'target', state);
  if (!id || !world.items[id]?.portable) return null;
  const result = withRules('take', { action: 'take', target: action.target }, world, state, () => handleTake(action.target, world, state));
  return { held: isCarried(state, id), result, id };
}
```

Replace the `wear` case:

```ts
    case 'wear': {
      const saved = snapshotState(state);
      const taken = takeFirst(action, world, state);
      if (taken && !taken.held) return taken.result;
      const worn = withRules('wear', action, world, state, () => handleWear(action.target, world, state));
      if (!taken) return worn;
      if (worn.understood === false) {
        restoreState(state, saved);
        return worn;
      }
      const takeLines = taken.result.lines.filter((l) => !/^Taken[.:]/.test(l));
      return { ...worn, lines: [`(first taking the ${world.items[taken.id].name})`, ...takeLines, ...worn.lines], mutated: true };
    }
```

(add any missing imports: `isCarried`, `snapshotState`, `restoreState`, `handleTake`, `handleWear` — most are already imported in `engine.ts`; check its import lines.)

- [ ] **Step 4: Run tests, commit**

Run: `npm run test -w @brass-lantern/engine` → PASS.

```bash
npm run lint && npm run type-check
git add packages/engine/src packages/engine/tests
git commit -m "Engine: WEAR takes the thing first when it's in sight

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: “Both” answers a which-question

**Files:**
- Modify: `src/types/game.ts` (`ParsedAction.only`), `src/engine/verbs/all.ts` (`handleAll`), `src/engine/conversation.ts` (`interpret`)
- Test: `tests/engine/names.test.ts` (append)

**Interfaces:**
- Consumes: `listThe` (Task 4).
- Produces: `ParsedAction.only?: string[]` (ALL restricted to these IDs, in this order; set only by an answer).

- [ ] **Step 1: Write the failing tests**

```ts
describe('answering “both”', () => {
  it('TAKE: takes each', () => {
    const game = createGame(world, { seed: 1 });
    game.state.currentRoom = 'living';
    expect(game.send('take key').lines[0]).toMatch(/^Which do you mean/);
    const lines = game.send('both').lines.join('\n');
    expect(lines).toContain('brass key');
    expect(lines).toContain('rusty key');
    expect(game.state.locations.key).toBe('player');
    expect(game.state.locations.rusty_key).toBe('player');
  });
  it('GIVE: one at a time, and the question stays open', () => {
    const game = createGame(world, { seed: 1 });
    game.state.currentRoom = 'yard';
    Object.assign(game.state.locations, { key: 'player', rusty_key: 'player' });
    expect(game.send('give key to neighbor').lines[0]).toMatch(/^Which do you mean/);
    expect(game.send('both').lines).toEqual(['One at a time: the brass key or the rusty key?']);
    expect(game.send('rusty').lines.join(' ')).not.toContain('One at a time');
  });
});
```

- [ ] **Step 2: Run to verify they fail** — expected FAIL (“both” is parsed as a fresh command).

- [ ] **Step 3: Implement.** In `src/types/game.ts` `ParsedAction`:

```ts
  /** ALL restricted to these IDs, in this order: the answer BOTH to a which-question. */
  only?: string[];
```

In `src/engine/verbs/all.ts` `handleAll`, after `let ids = covered(verb, action, world, state);`:

```ts
  // BOTH, answering “which do you mean”: just the things asked about, in the order asked.
  if (action.only) ids = action.only.filter((id) => ids.includes(id));
```

In `src/engine/conversation.ts` (import `listThe` from `./ask.ts`), add above `interpret`:

```ts
const BOTH = /^(?:both|all|each)(?: of them)?$/i;
/** Verbs whose ALL can take the answer BOTH. */
const BOTH_VERBS = new Set(['take', 'drop', 'put']);
```

and inside `if (pending.kind === 'which') {`, first:

```ts
    if (BOTH.test(answer)) {
      if (pending.slot === 'target' && BOTH_VERBS.has(pending.action.action)) {
        return { run: { ...pending.action, target: 'all', only: pending.candidates }, viaAnswer: true };
      }
      conv.pending = pending;
      return { reply: [`One at a time: ${listThe(world, pending.candidates)}?`] };
    }
```

- [ ] **Step 4: Run tests, commit**

Run: `npm run test -w @brass-lantern/engine` → PASS. Also run the Vue store tests, which drive `interpret`: `npm run test -w @brass-lantern/vue` → PASS.

```bash
npm run lint && npm run type-check
git add packages/engine/src packages/engine/tests
git commit -m "Engine: BOTH answers a which-question (each, for TAKE/DROP/PUT)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs, versions, changelog, full checks

**Files:**
- Modify: `docs/reference/world-schema.md`, `docs/reference/commands.md`, the page that describes name matching (find it: `grep -rln -i "fuzzy\|token-prefix\|substring" docs --include=*.md | grep -v superpowers`), `CHANGELOG.md`, `docs/superpowers/backlog.md` (strike anything this closes), `packages/engine/src/version.ts`, `packages/*/package.json`, root `package-lock.json`

- [ ] **Step 1: World schema.** In `docs/reference/world-schema.md`, in the top-level `World` fields table/list, add `typoReplies` (match the page’s format):

> `typoReplies` (`string[]`, optional): lines said when a misspelled name is matched anyway (brass style only), once per thing, taken in turn. `{typed}` is the word as typed, `{name}` the thing’s name with its article. Leave it out and corrections are silent. Example: `“{typed}”? You mean {name}.`

and under game state (if the page lists `GameState` fields): `typoMocked` (`string[]`, optional): what has been teased for a misspelling.

- [ ] **Step 2: Name matching.** On the matching page found above, replace the tier list with:

> Names match strongest first: the exact name, an alias or the ID; a whole word of a name or alias; a whole word of the ID, or part of a name; part of the ID; the starts of words (every typed word of three or more letters must match); and, in brass style, a close misspelling (a typed word of five or more letters at least 80% alike, comparing the start of a longer word too, so “lunberg” finds Lumbergh). Objects and people are compared together, so EXAMINE LUMBERGH finds Lumbergh rather than his mug; on a tie EXAMINE prefers objects, and ATTACK, FOLLOW and the person in GIVE/SHOW … TO prefer people. Equally good matches ask “Which do you mean?”. Infocom style never guesses misspellings.

- [ ] **Step 3: Commands.** In `docs/reference/commands.md`: under GIVE, add “`GIVE <someone> <item>` works too (`GIVE LUMBERGH THE REPORT`).”; under WEAR, “A thing in sight but not held is taken first: (first taking the shirt).”; near the which-question/answers text, “Answer BOTH (or ALL, EACH) to act on each, for TAKE, DROP and PUT.”

- [ ] **Step 4: Versions.** Find every 2.1.1: `grep -rn '"2\.1\.1"\|2\.1\.1' packages/*/package.json packages/engine/src/version.ts`. Set them to 2.2.0:

```bash
npm pkg set version=2.2.0 -w @brass-lantern/engine -w @brass-lantern/vue -w @brass-lantern/server
sed -i '' "s/2\.1\.1/2.2.0/" packages/engine/src/version.ts
npm pkg set 'dependencies.@brass-lantern/engine=^2.2.0' -w @brass-lantern/vue
npm install --package-lock-only
git diff --stat
```

(Check `packages/vue/package.json` names the engine under `dependencies` or `peerDependencies` and set the one it uses. If `server` depends on the engine, bump that range too.)

- [ ] **Step 5: CHANGELOG.** Add at the top, in the file’s format:

```markdown
## 2.2.0 (2026-10-12)

- **Names match the way players type them.** Matches are ranked (exact; a whole word of a name; a word of the ID or part of a name; part of the ID; word starts), and objects and people are compared together, so EXAMINE LUMBERGH finds Lumbergh, not his mug or his drawer.
- **Close misspellings match** in brass style (5+ letters, 80% alike), and a world can tease the player once per thing with the new `typoReplies`. Infocom style never guesses.
- **GIVE <someone> <item>** parses. The person in GIVE/SHOW … TO wins a tie with a thing.
- **WEAR takes first** when the thing is in sight but not held.
- **BOTH** answers “Which do you mean?”: each, for TAKE, DROP and PUT; otherwise “One at a time: …?”.
- Which-questions honor an empty `article` (“Lumbergh’s coffee mug”, not “the Lumbergh’s coffee mug”).
```

- [ ] **Step 6: Full checks**

```bash
npm run lint && npm run type-check && npm run test:coverage
npm run build:packages && npm run build && npm run smoke
```

Expected: all green, coverage ≥ 80/80/80, branches ≥ 75.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "2.2.0: docs, versions, changelog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Office Space probe, review, PR

**Files:** none in brass-lantern (a scratch copy of Office Space only).

- [ ] **Step 1: Pack and install into a scratch Office Space**

```bash
cd ~/current_work/brass-lantern
rm -rf /tmp/bl-pack && mkdir /tmp/bl-pack
npm pack -w @brass-lantern/engine -w @brass-lantern/vue --pack-destination /tmp/bl-pack
rm -rf /tmp/os-probe && git -C ~/current_work/infocom-office-space worktree add /tmp/os-probe main
cd /tmp/os-probe && npm ci && npm install /tmp/bl-pack/brass-lantern-engine-2.2.0.tgz /tmp/bl-pack/brass-lantern-vue-2.2.0.tgz --no-save
```

- [ ] **Step 2: Probe the 2.1.4 lines.** Create `/tmp/os-probe/tests/zz-probe.test.ts`:

```ts
import { gameWith, play } from './worlds/office-space/play';

const inOffice = () => gameWith((s) => {
  s.currentRoom = 'lumbergh_office';
  s.locations.tps_reports_covered = 'player';
  s.locations.lumberghs_mug = 'player';
  s.npcs = { ...s.npcs, lumbergh: { ...s.npcs?.lumbergh, room: 'lumbergh_office' } };
});

test('2.1.4 lines', () => {
  expect(inOffice().send('examine lumbergh').lines[0]).toContain('Bill Lumbergh');
  for (const line of ['give report to lumbergh', 'give lumberg tps report', 'give lunbergh report']) {
    expect(inOffice().send(line).lines.join(' ')).toContain('Lumbergh takes the TPS reports');
  }
  const flat = gameWith((s) => { s.currentRoom = 'apartment_post'; s.flags.hypnotized = true; s.flags.phone_unplugged = true; });
  expect(flat.send('put on hawaiian shirt').lines[0]).toBe('(first taking the Hawaiian shirt)');
  const bar = gameWith((s) => { s.currentRoom = 'chotchkies'; s.flags.hypnotized = true; });
  bar.send('take flair');
  expect(bar.send('both').lines.join(' ')).toContain('Taken');
});
```

Run: `cd /tmp/os-probe && npx vitest run tests/zz-probe.test.ts && npx vitest run`
Expected: the probe passes, and Office Space’s own suite (gameplay, perfect run) passes on 2.2.0. Any failure: fix in brass-lantern (new failing test first), re-pack, re-run. Then remove the worktree: `git -C ~/current_work/infocom-office-space worktree remove --force /tmp/os-probe`.

- [ ] **Step 3: Whole-branch review.** Dispatch a fresh reviewer (most capable model) over `git diff main...name-matching-2-2-0` with the spec and this plan; fix what it finds (tests first); re-run Task 9 Step 6.

- [ ] **Step 4: PR.** Push and open the PR (body: what changed, the spec link, the probe result, ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Stop: merging, tagging `v2.2.0` and approving the npm publish are the owner’s.

---

### Phase 2 (after 2.2.0 is published): Office Space 2.1.5

In `~/current_work/infocom-office-space`, on a new branch `engine-2-2-0`:

- [ ] **Step 1:** `npm i @brass-lantern/engine@^2.2.0 @brass-lantern/vue@^2.2.0 && (cd server && npm i @brass-lantern/server@^2.2.0)`.
- [ ] **Step 2: Failing tests first** in `tests/worlds/office-space/room-prose.test.ts` (or a new `names.test.ts`): the probe’s cases from Task 10 Step 2, plus a typo reply firing once:

```ts
it('Lumbergh teases a misspelling, once', () => {
  const game = gameWith((s) => { s.currentRoom = 'lumbergh_office'; s.npcs = { ...s.npcs, lumbergh: { ...s.npcs?.lumbergh, room: 'lumbergh_office' } }; });
  expect(game.send('examine lunbergh').lines[0]).toMatch(/Lumbergh/);
  expect(game.state.typoMocked).toEqual(['lumbergh']);
  expect(game.send('examine lunbergh').lines[0]).toMatch(/^Bill Lumbergh\. He is wearing suspenders/);
});
```

- [ ] **Step 3:** In `src/worlds/office-space.ts`: `article: ''` on `lumberghs_mug`; top-level `typoReplies`:

```ts
  typoReplies: [
    '👔 “{typed}?” Yeahhh. I’m gonna go ahead and assume you meant {name}. Mmkay?',
    '👔 “{typed}.” Did you get the memo about spelling? I’ll make sure you get another copy. You meant {name}.',
    '👔 Yeahhh, if you could go ahead and spell {name} right next time, that’d be great.',
  ],
```

- [ ] **Step 4:** `npm run lint && npm run type-check && npm run test:coverage && npm run build`; `(cd server && npm test)`.
- [ ] **Step 5:** Versions 2.1.5 (both `package.json`s + lockfiles), CHANGELOG entry (for players: names and misspellings, GIVE LUMBERGH THE REPORT, WEAR from the floor, BOTH, Lumbergh teases typos). Commit, push, PR. Merge, tag `v2.1.5` and deploy only with the owner’s go-ahead.
