import type { ParsedAction } from '@/types/game';
import type { World, WorldVerb } from '@/types/world';

const DIRECTIONS: Record<string, string> = {
  n: 'north', north: 'north',
  s: 'south', south: 'south',
  e: 'east', east: 'east',
  w: 'west', west: 'west',
  up: 'up', down: 'down',
  out: 'out', outside: 'outside', exit: 'out',
  in: 'in', inside: 'inside',
  back: 'back',
};

const RE = {
  movement: /^(?:go|move|walk|head|run|exit)\s+(?:to\s+(?:the\s+)?|toward\s+|over\s+to\s+(?:the\s+)?|out\s+to\s+(?:the\s+)?)?(.+)$/i,
  enter: /^(?:enter|into)\s+(?:the\s+)?(.+)$/i,
  take: /^(?:take|get|grab|pick\s+up)\s+(?:the\s+)?(.+)$/i,
  drop: /^(?:drop|put\s+down|leave)\s+(?:the\s+)?(.+)$/i,
  examine: /^(?:examine|inspect|look\s+at|x|read)\s+(?:the\s+)?(.+)$/i,
  use: /^(?:use|operate|open|push|pull|press)\s+(?:the\s+)?(.+?)(?:\s+(?:on|in|into|with)\s+(?:the\s+)?(.+))?$/i,
  // "put the disk in the drive". Runs after wear/drop so "put on"/"put down" win.
  insert: /^(?:insert|put|slide|stick|feed|plug|attach)\s+(?:the\s+|a\s+)?(.+?)(?:\s+(?:in|into|on|onto|to)\s+(?:the\s+|my\s+)?(.+))?$/i,
  give: /^(?:give|hand|offer|return)\s+(?:the\s+)?(.+?)(?:\s+(?:back\s+)?to\s+(?:the\s+)?(.+?))?(?:\s+back)?$/i,
  wear: /^(?:wear|put\s+on)\s+(?:the\s+)?(.+)$/i,
  talk: /^(?:talk|speak|chat)\s+(?:to|with)\s+(?:the\s+)?(.+)$/i,
  ask: /^(?:ask|question)\s+(?:the\s+)?(.+?)(?:\s+about\s+.+)?$/i,
  smash: /^(?:smash|destroy|break|kill|hit|attack|wreck|whack|beat)\s+(?:up\s+)?(?:the\s+)?(.+?)(?:\s+with\s+(?:the\s+)?(.+))?$/i,
  sit: /^(?:sit(?:\s+down)?|relax)$/i,
  wait: /^(?:wait|z)$/i,
};

const SINGLE_WORD: Record<string, ParsedAction> = {
  look: { action: 'look' },
  l: { action: 'look' },
  inventory: { action: 'inventory' },
  inv: { action: 'inventory' },
  i: { action: 'inventory' },
  help: { action: 'help' },
  '?': { action: 'help' },
  hint: { action: 'hint' },
  hints: { action: 'hint' },
  clue: { action: 'hint' },
  score: { action: 'score' },
  restart: { action: 'restart' },
  quit: { action: 'quit' },
  save: { action: 'save' },
  load: { action: 'load' },
};

// Each entry maps a verb-pattern regex to the canonical action. The first capture
// group is the target; an optional second group is the indirect object. Order
// matters — earlier entries win on ambiguous input.
const VERB_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [RE.movement, 'go'],
  [RE.enter, 'go'],
  [RE.take, 'take'],
  [RE.drop, 'drop'],
  [RE.examine, 'examine'],
  [RE.use, 'use'],
  [RE.wear, 'wear'],
  [RE.insert, 'use'],
  [RE.give, 'give'],
  [RE.talk, 'talk'],
  [RE.ask, 'talk'],
  [RE.smash, 'smash'],
];

/**
 * Every word or phrase a built-in verb starts with. A world verb can't take
 * one of these (the built-in wins); verbClashes reports any that try.
 */
export const BUILT_IN_WORDS: ReadonlySet<string> = new Set([
  'go', 'move', 'walk', 'head', 'run', 'exit', 'enter', 'into', 'take', 'get', 'grab', 'pick up',
  'drop', 'put down', 'leave', 'examine', 'inspect', 'look at', 'x', 'read', 'use', 'operate', 'open',
  'push', 'pull', 'press', 'insert', 'put', 'slide', 'stick', 'feed', 'plug', 'attach', 'give', 'hand',
  'offer', 'return', 'wear', 'put on', 'talk', 'speak', 'chat', 'ask', 'question', 'smash', 'destroy',
  'break', 'kill', 'hit', 'attack', 'wreck', 'whack', 'beat', 'sit', 'sit down', 'relax', 'wait', 'z',
  ...Object.keys(SINGLE_WORD),
  ...Object.keys(DIRECTIONS),
]);

/** World verb words that a built-in verb already owns. */
export function verbClashes(verbs: World['verbs']): string[] {
  return Object.values(verbs ?? {}).flatMap((v) => v.words.filter((w) => BUILT_IN_WORDS.has(w.toLowerCase())));
}

const escapeWord = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

type WorldPattern = { re: RegExp; id: string; verb: WorldVerb; phrase: boolean };

const patternCache = new WeakMap<object, WorldPattern[]>();

/** Patterns for the world's own verbs, longest first so "hit the snooze button" beats "hit". */
function worldPatterns(verbs: World['verbs']): WorldPattern[] {
  if (!verbs) return [];
  const cached = patternCache.get(verbs);
  if (cached) return cached;
  const out: WorldPattern[] = [];
  for (const [id, verb] of Object.entries(verbs)) {
    for (const word of verb.words) {
      if (BUILT_IN_WORDS.has(word.toLowerCase())) continue;
      const preps = (verb.indirect ?? []).map(escapeWord).join('|');
      const obj =
        verb.target === 'none' ? '' : `(?:\\s+(?:the\\s+)?(.+?))${verb.target === 'required' ? '' : '?'}`;
      const ind = preps && verb.target !== 'none' ? `(?:\\s+(?:${preps})\\s+(?:the\\s+)?(.+))?` : '';
      out.push({ re: new RegExp(`^${escapeWord(word)}${obj}${ind}$`, 'i'), id, verb, phrase: /\s/.test(word.trim()) });
    }
  }
  out.sort((a, b) => b.re.source.length - a.re.source.length);
  patternCache.set(verbs, out);
  return out;
}

function matchWorld(input: string, patterns: WorldPattern[]): ParsedAction | null {
  for (const { re, id } of patterns) {
    const m = input.match(re);
    if (!m) continue;
    const parsed: ParsedAction = { action: id };
    if (m[1]) parsed.target = m[1].trim();
    if (m[2]) parsed.indirect = m[2].trim();
    return parsed;
  }
  return null;
}

/**
 * Fast, zero-latency parser for canonical commands.
 * Returns null when input doesn't match — caller should fall through to the LLM parser.
 */
export function fallbackParse(rawInput: string, verbs?: World['verbs']): ParsedAction | null {
  return parse(rawInput, true, verbs);
}

/** Like fallbackParse, but without the bare-word-means-go guess. */
function strictParse(rawInput: string, verbs?: World['verbs']): ParsedAction | null {
  return parse(rawInput, false, verbs);
}

// Verbs whose object lists expand: "take key and wallet" → take key, take wallet.
const LIST_VERBS: Record<string, string> = {
  take: 'take',
  drop: 'drop',
  examine: 'examine',
  wear: 'wear',
  talk: 'talk to',
};

// A full stop ends a clause, except after an abbreviation ("talk to dr. smith").
const CLAUSE_BREAK = /\s*(?:;|(?<!\b(?:dr|mr|mrs|ms|st))\.\s+|,?\s+(?:and\s+)?then\s+)\s*/i;
const LIST_BREAK = /\s*(?:,\s*(?:and\s+)?|\s+and\s+)\s*/i;

/**
 * Split one line of input into separate commands, classic text-adventure style:
 *   "get key and wallet"            → ["get key", "take wallet"]
 *   "take wallet and go outside"    → ["take wallet", "go outside"]
 *   "west then take the wallet"     → ["west", "take the wallet"]
 *
 * Clauses ("then", ";", a full stop) always split. Within a clause, "and" and
 * commas only split when every piece is a command the regex parser
 * recognizes, or an object list after a list verb. Otherwise the clause stays
 * whole ("could you grab my keys and wallet") for the LLM to read in one go.
 */
export function splitCommands(rawInput: string, verbs?: World['verbs']): string[] {
  const input = rawInput.trim().replace(/[.!]+$/, '');
  if (!input) return [];
  return input
    .split(CLAUSE_BREAK)
    .filter(Boolean)
    .flatMap((clause) => splitClause(clause, verbs));
}

function splitClause(clause: string, verbs?: World['verbs']): string[] {
  const pieces = clause.split(LIST_BREAK).filter(Boolean);
  if (pieces.length === 1) return [clause];
  const out: string[] = [];
  let listVerb: string | null = null;
  for (const piece of pieces) {
    const parsed = strictParse(piece, verbs);
    if (parsed) {
      out.push(piece);
      listVerb = LIST_VERBS[parsed.action] ?? null;
    } else if (listVerb) {
      out.push(`${listVerb} ${piece}`);
    } else {
      return [clause];
    }
  }
  return out;
}

function parse(rawInput: string, allowBareWord: boolean, verbs?: World['verbs']): ParsedAction | null {
  const input = rawInput.trim().toLowerCase();
  if (!input) return null;

  if (input in SINGLE_WORD) return SINGLE_WORD[input];
  if (input in DIRECTIONS) return { action: 'go', target: DIRECTIONS[input] };

  // A world's multi-word phrases go first, so "hit the snooze button" isn't
  // read as SMASH, or "go to bed" as GO. Single words go after the built-ins.
  const patterns = worldPatterns(verbs);
  const phrase = matchWorld(input, patterns.filter((p) => p.phrase));
  if (phrase) return phrase;

  for (const [re, action] of VERB_PATTERNS) {
    const m = input.match(re);
    if (!m) continue;
    const parsed: ParsedAction = { action, target: m[1].trim() };
    if (m[2]) parsed.indirect = m[2].trim();
    return parsed;
  }

  if (RE.sit.test(input)) return { action: 'sit' };
  if (RE.wait.test(input)) return { action: 'wait' };

  const word = matchWorld(input, patterns.filter((p) => !p.phrase));
  if (word) return word;

  // Bare single-word fallback: treat as a movement target ("lobby", "cubicles", "forward").
  // The engine's fuzzy exit matcher will validate against current room exits.
  if (allowBareWord && /^[a-z][a-z_]*$/i.test(input)) {
    return { action: 'go', target: input };
  }

  return null;
}
