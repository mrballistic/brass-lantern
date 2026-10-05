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
      if (ht === nt || (nt.length >= 2 && ht.startsWith(nt)) || (ht.length >= 2 && nt.startsWith(ht))) {
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

/** Direction words that should only match exits by EXACT label (no substring/fuzzy). */
const STRICT_DIRECTIONS = new Set([
  'north', 'south', 'east', 'west', 'up', 'down',
  'in', 'out', 'inside', 'outside', 'back',
]);

/** Specialized matcher for exit labels. Direction synonyms collapse onto the canonical key. */
export function fuzzyMatchExit(
  input: string,
  exits: Record<string, string>,
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
