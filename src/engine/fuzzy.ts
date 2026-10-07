const normalize = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/\s+/g, ' ').trim();

const tokens = (s: string): string[] =>
  normalize(s).split(/[\s_]/).filter((t) => t.length > 0);

/**
 * Score token-prefix overlap between an input phrase and a candidate's tokens.
 * A needle token scores 1 if any haystack token equals it, starts with it (>=2 chars),
 * or it starts with a haystack token (>=2 chars). "cube" → "cubicle" scores; single-char
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

/**
 * Match an input string against a set of candidate IDs, using:
 *  1) exact ID match (after normalize)
 *  2) exact display-name match
 *  3) substring match
 *  4) token-prefix overlap (handles "cube farm" → "cubicle_farm", "swingline" → "red Swingline stapler")
 *
 * Returns the matched ID, or null if nothing plausibly matches.
 */
export function fuzzyMatch(
  input: string,
  candidates: Array<{ id: string; name: string }>,
): string | null {
  if (!input) return null;
  const needle = normalize(input);
  if (!needle) return null;
  const self = selfMatches(needle, candidates);
  if (self) return self[0] ?? null;

  for (const c of candidates) {
    if (normalize(c.id) === needle) return c.id;
  }
  for (const c of candidates) {
    if (normalize(c.name) === needle) return c.id;
  }
  for (const c of candidates) {
    if (normalize(c.id).includes(needle) || normalize(c.name).includes(needle)) {
      return c.id;
    }
  }
  if (needle.length > 2) {
    const needleTokens = tokens(needle);
    let best: { id: string; score: number } | null = null;
    for (const c of candidates) {
      const haystackTokens = [...tokens(c.id), ...tokens(c.name)];
      const score = tokenPrefixScore(needleTokens, haystackTokens);
      if (score > 0 && (!best || score > best.score)) {
        best = { id: c.id, score };
      }
    }
    if (best) return best.id;
  }
  return null;
}

/**
 * Every candidate that ties for the best match, so the engine can ask which
 * one was meant. Tiers, first that matches wins:
 *  1) exact name or alias (and exact ID, which counts as one more name)
 *  2) substring of the ID, name or an alias
 *  3) the best token-prefix score
 * With `byId` (the intent server answers in IDs) an exact ID wins alone.
 */
export function fuzzyCandidates(
  input: string,
  candidates: Array<{ id: string; name: string; aliases?: string[] }>,
  opts: { byId?: boolean } = {},
): string[] {
  const needle = normalize(input);
  if (!needle) return [];
  const self = selfMatches(needle, candidates, opts.byId);
  if (self) return self;
  const exactId = candidates.filter((c) => normalize(c.id) === needle);
  if (exactId.length > 0 && (opts.byId || needle.includes('_'))) return [exactId[0].id];
  const words = (c: { id: string; name: string; aliases?: string[] }) => [c.name, ...(c.aliases ?? [])].map(normalize);
  const exact = candidates.filter((c) => normalize(c.id) === needle || words(c).includes(needle));
  if (exact.length > 0) return exact.map((c) => c.id);
  const sub = candidates.filter((c) => normalize(c.id).includes(needle) || words(c).some((w) => w.includes(needle)));
  if (sub.length > 0) return sub.map((c) => c.id);
  if (needle.length <= 2) return [];
  const needleTokens = tokens(needle);
  let best = 0;
  let ids: string[] = [];
  for (const c of candidates) {
    const score = tokenPrefixScore(needleTokens, [...tokens(c.id), ...words(c).flatMap(tokens)]);
    if (score > best) [best, ids] = [score, [c.id]];
    else if (score === best && score > 0) ids.push(c.id);
  }
  return ids;
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
  const expanded = synonyms[needle] ?? [needle];
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
  // Token-prefix fallback: "cube farm" → "cubicle_farm", "break" → "break_room".
  // Pick the highest-scoring non-direction label.
  if (needle.length >= 2) {
    const needleTokens = tokens(needle);
    let best: { label: string; score: number } | null = null;
    for (const label of Object.keys(exits)) {
      const n = normalize(label);
      if (STRICT_DIRECTIONS.has(n)) continue;
      const score = tokenPrefixScore(needleTokens, tokens(n));
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

type Candidate = { id: string; name: string; aliases?: string[] };

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
function selfMatches(needle: string, candidates: Candidate[], byId?: boolean): string[] | null {
  if (byId && RESERVED.has(needle)) return [];
  if (!isSelfWord(needle)) return null;
  return ALWAYS_SELF.test(needle) ? [] : candidates.filter((c) => namedExactly(needle, c)).map((c) => c.id);
}
