const normalize = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/\s+/g, ' ').trim();

const tokens = (s: string): string[] =>
  normalize(s).split(/[\s_]/).filter((t) => t.length > 0);

/**
 * Score token-prefix overlap between an input phrase and a candidate's tokens.
 * A needle token scores 1 if any haystack token equals it, starts with it (>=2 chars),
 * or it starts with a haystack token (>=2 chars). "cubic" → "cubicle" scores ("cube" doesn't); single-char
 * needle tokens are ignored as noise.
 */
function tokenPrefixScore(needleTokens: string[], haystackTokens: string[]): number {
  let score = 0;
  for (const nt of needleTokens) {
    if (nt.length < 2) continue;
    for (const ht of haystackTokens) {
      if (ht === nt || ht.startsWith(nt) || (ht.length >= 2 && nt.startsWith(ht))) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

/** Function words that may be typed but never have to match: no author can alias around them. */
const FUNCTION_WORDS = new Set(['the', 'this', 'that', 'these', 'those', 'his', 'her', 'its', 'their', 'your', 'our', 'some', 'any', 'and']);

/** Every typed word of three or more letters, bar the function words, must match one of the candidate’s tokens. */
function coversAll(needleTokens: string[], haystack: string[]): boolean {
  return needleTokens
    .filter((t) => t.length >= 3 && !FUNCTION_WORDS.has(t))
    .every((t) => tokenPrefixScore([t], haystack) > 0);
}

type Candidate = { id: string; name: string; aliases?: string[] };

const DIGITS = /^\d+$/;

/**
 * Digits name only a thing that has them as a whole word of its ID, name or an alias (“12” is
 * locker 12, never locker 123 or the h2o): a word in Zork's vocabulary, not a fragment of one.
 */
function byWholeNumber(needle: string, candidates: Array<{ id: string; name: string; aliases?: string[] }>): string[] {
  return candidates.filter((c) => [c.id, c.name, ...(c.aliases ?? [])].some((w) => tokens(w).includes(needle))).map((c) => c.id);
}

/** How strongly a candidate matches, strongest first. 0 is no match. */
export const RANK = { exact: 1, nameWord: 2, idWordOrNamePart: 3, idPart: 4, wordStart: 5, typo: 6 } as const;

/** The best rank any candidate reached, the candidates tied at it, and (for a typo) the word as the player typed it. */
export interface Ranked {
  rank: number;
  ids: string[];
  typed?: string;
  /** Rank 6 only: [every typo matched a name or alias word (1/0), summed similarity, summed whole-word similarity]. */
  typoKey?: [number, number, number];
}

const NONE: Ranked = { rank: 0, ids: [] };

/** Does `hay` contain `run` as consecutive whole words? */
const containsRun = (hay: string[], run: string[]): boolean =>
  run.length > 0 && hay.some((_, i) => run.every((t, j) => hay[i + j] === t));

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

/** Floats closer than this compare equal (summed similarities). */
const EPSILON = 1e-9;

/** Compares typo keys element by element: positive when `a` is stronger. */
function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > EPSILON) return a[i] - b[i];
  }
  return 0;
}

/** The best typo match of `t` among `hay`: similarity (prefix cut allowed), then whole-word similarity. */
function bestTypo(t: string, hay: string[]): [number, number] {
  const whole = (h: string) => 1 - editDistance(t, h) / Math.max(t.length, h.length);
  let best: [number, number] = [0, 0];
  for (const h of hay) {
    const pair: [number, number] = [typoSimilarity(t, h), whole(h)];
    if (compareKeys(pair, best) > 0) best = pair;
  }
  return best;
}

/**
 * Rank 6: each typed word of 3+ letters matches a candidate word exactly, by its start, or (5+ letters) as a close
 * misspelling. As ranks 2–4 put names before IDs and whole words before parts, the strongest key wins:
 * misspelled name or alias words over ID words, then the summed similarity, then the summed whole-word similarity.
 */
function typoRank(input: string, needleTokens: string[], candidates: Candidate[], words: (c: Candidate) => string[]): Ranked {
  const checked = needleTokens.filter((t) => t.length >= 3 && !FUNCTION_WORDS.has(t));
  let best: [number, number, number] | undefined;
  let ids: string[] = [];
  let typo: string | undefined;
  for (const c of candidates) {
    const nameHay = words(c).flatMap(tokens);
    const idHay = tokens(c.id);
    const hay = [...idHay, ...nameHay];
    let fromName = 1;
    let score = 0;
    let whole = 0;
    let first: string | undefined;
    let fits = true;
    for (const t of checked) {
      if (tokenPrefixScore([t], hay) > 0) continue;
      if (t.length < TYPO_MIN_LENGTH) {
        fits = false;
        break;
      }
      const byName = bestTypo(t, nameHay);
      const byId = bestTypo(t, idHay);
      const pick = byName[0] >= TYPO_SIMILARITY ? byName : byId;
      if (pick[0] < TYPO_SIMILARITY) {
        fits = false;
        break;
      }
      if (pick !== byName) fromName = 0;
      score += pick[0];
      whole += pick[1];
      first ??= t;
    }
    if (!fits || !first) continue;
    const key: [number, number, number] = [fromName, score, whole];
    const order = best ? compareKeys(key, best) : 1;
    if (order > 0) [best, ids, typo] = [key, [c.id], first];
    else if (order === 0) ids.push(c.id);
  }
  if (ids.length === 0 || !typo || !best) return NONE;
  const typed = input.trim().split(/\s+/).find((w) => normalize(w) === typo) ?? typo;
  return { rank: RANK.typo, ids, typed, typoKey: best };
}

/** Orders two results: negative when `a` is the stronger match. No match is weakest; a lower rank is stronger; typos by their key. */
export function compareRanked(a: Ranked, b: Ranked): number {
  if (a.rank !== b.rank) {
    if (a.rank === 0) return 1;
    if (b.rank === 0) return -1;
    return a.rank - b.rank;
  }
  if (a.rank === RANK.typo && a.typoKey && b.typoKey) return compareKeys(b.typoKey, a.typoKey);
  return 0;
}

/**
 * Ranks `candidates` against what the player typed (see RANK): exact name, alias or ID; a whole word of a
 * name or alias; a whole word of the ID or part of a name; part of the ID; word starts (every typed word of
 * three or more letters matching); with `typos`, a close misspelling (the caller decides when: the
 * engine's typosOn turns them off for the intent server's IDs). `coarse` folds ranks 2–4 into one
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
  if (!opts.typos) return NONE;
  return typoRank(input, needleTokens, candidates, words);
}

/**
 * Match an input string against a set of candidates by the best rank (see `rankCandidates`).
 * Returns the first matched ID, or null if nothing plausibly matches.
 */
export function fuzzyMatch(input: string, candidates: Array<{ id: string; name: string; aliases?: string[] }>): string | null {
  if (!input) return null;
  return rankCandidates(input, candidates).ids[0] ?? null;
}

/**
 * Every candidate that ties for the best rank, so the engine can ask which one was meant (see
 * `rankCandidates`). With `byId` (the intent server answers in IDs) an exact ID wins alone. With
 * `selfWords` (ASK X ABOUT ME) ME, MYSELF, SELF and YOURSELF match only a candidate named exactly that.
 */
export function fuzzyCandidates(
  input: string,
  candidates: Array<{ id: string; name: string; aliases?: string[] }>,
  opts: { byId?: boolean; selfWords?: boolean; typos?: boolean } = {},
): string[] {
  return rankCandidates(input, candidates, opts).ids;
}

/** Direction words that should only match exits by EXACT label (no substring/fuzzy). */
const STRICT_DIRECTIONS = new Set([
  'north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest',
  'in', 'out', 'inside', 'outside', 'back',
]);

/** Specialized matcher for exit labels. Direction synonyms collapse onto the canonical key. */
export function fuzzyMatchExit(
  input: string,
  exits: Record<string, unknown>,
): string | null {
  if (!input) return null;
  const needle = normalize(input);
  const synonyms: Record<string, string[]> = {
    n: ['north'],
    s: ['south'],
    e: ['east'],
    w: ['west'],
    up: ['up'],
    down: ['down'],
    u: ['up'],
    d: ['down'],
    ne: ['northeast'],
    nw: ['northwest'],
    se: ['southeast'],
    sw: ['southwest'],
  };
  const expanded = Object.hasOwn(synonyms, needle) ? synonyms[needle] : [needle];
  for (const label of Object.keys(exits)) {
    const n = normalize(label);
    if (expanded.includes(n) || n === needle) return label;
  }
  // Direction words must be exact — never let "south" substring-match "outside" or "out".
  if (STRICT_DIRECTIONS.has(needle)) return null;
  for (const label of Object.keys(exits)) {
    const n = normalize(label);
    if (STRICT_DIRECTIONS.has(n)) continue; // also don't backwards-match labels that are pure directions
    if (n.includes(needle) || needle.includes(n)) return label;
  }
  // Token-prefix fallback: "cubic farm" → "cubicle_farm", "break" → "break_room".
  // Every typed word of three or more letters must match a token of the label.
  // Pick the highest-scoring non-direction label.
  if (needle.length >= 2) {
    const needleTokens = tokens(needle);
    let best: { label: string; score: number } | null = null;
    for (const label of Object.keys(exits)) {
      const n = normalize(label);
      if (STRICT_DIRECTIONS.has(n)) continue;
      const hay = tokens(n);
      if (!coversAll(needleTokens, hay)) continue;
      const score = tokenPrefixScore(needleTokens, hay);
      if (score > 0 && (!best || score > best.score)) {
        best = { label, score };
      }
    }
    if (best) return best.label;
  }
  return null;
}

/** ME, MYSELF, SELF, YOURSELF: words that may name the player as an object (whose reserved ID is 'player'). */
export const isSelfWord = (word: string): boolean => /^(?:me|myself|self|yourself)$/i.test(word.trim());

/** ME and MYSELF always name the player; SELF and YOURSELF only when nothing at hand is called that. */
const ALWAYS_SELF = /^(?:me|myself)$/;

/** ME or MYSELF: the speaker, always (in an order, YOURSELF is the character ordered). */
export const isMeWord = (word: string): boolean => ALWAYS_SELF.test(normalize(word));

/** IDs the engine reserves: the player, and a number typed where an object goes. */
const RESERVED = new Set(['player', 'number']);

/** A candidate named or aliased exactly `needle` (or with that ID). */
const namedExactly = (needle: string, c: Candidate): boolean =>
  normalize(c.id) === needle || [c.name, ...(c.aliases ?? [])].some((w) => normalize(w) === needle);

/**
 * Does `word` name the player? ME and MYSELF always; SELF and YOURSELF unless one of
 * `candidates` (what's in scope) is named or aliased that; and with `byId` (the intent
 * server answers in IDs) the reserved ID 'player'.
 */
export function namesSelf(word: string, candidates: Candidate[], opts: { byId?: boolean } = {}): boolean {
  const needle = normalize(word);
  if (opts.byId && needle === 'player') return true;
  if (!isSelfWord(needle)) return false;
  return ALWAYS_SELF.test(needle) || !candidates.some((c) => namedExactly(needle, c));
}

/**
 * Words that never fuzzy-match: ME and MYSELF match nothing, SELF and YOURSELF only a thing
 * named exactly that, and the reserved IDs nothing when they come from the intent server.
 * Null when the word matches as any other.
 */
function selfMatches(needle: string, candidates: Candidate[], byId?: boolean, selfWords?: boolean): string[] | null {
  if (byId && RESERVED.has(needle)) return [];
  if (!isSelfWord(needle)) return null;
  return ALWAYS_SELF.test(needle) && !selfWords ? [] : candidates.filter((c) => namedExactly(needle, c)).map((c) => c.id);
}
