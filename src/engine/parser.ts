import type { ParsedAction } from '@/types/game';

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
  drive: /^(?:drive\s+to|drive|take\s+the\s+car(?:\s+to)?)\s+(.+)$/i,
  driveBare: /^(?:drive|leave)$/i,
  take: /^(?:take|get|grab|pick\s+up)\s+(?:the\s+)?(.+)$/i,
  drop: /^(?:drop|put\s+down|leave)\s+(?:the\s+)?(.+)$/i,
  examine: /^(?:examine|inspect|look\s+at|x|read)\s+(?:the\s+)?(.+)$/i,
  use: /^(?:use|operate|open|push|pull|press|gut|clean|drink|unplug|disconnect|answer|pick\s+up\s+the\s+phone)\s+(?:the\s+)?(.+?)(?:\s+(?:on|in|into|with)\s+(?:the\s+)?(.+))?$/i,
  // "put the disk in the drive". Runs after wear/drop so "put on"/"put down" win.
  insert: /^(?:insert|put|slide|stick|feed|plug|attach|staple|clip)\s+(?:the\s+|a\s+)?(.+?)(?:\s+(?:in|into|on|onto|to)\s+(?:the\s+|my\s+)?(.+))?$/i,
  sleep: /^(?:sleep|nap|rest|go\s+to\s+(?:bed|sleep)|lie\s+down|take\s+a\s+nap)(?:\s+.*)?$/i,
  give: /^(?:give|hand|offer|return)\s+(?:the\s+)?(.+?)(?:\s+(?:back\s+)?to\s+(?:the\s+)?(.+?))?(?:\s+back)?$/i,
  wear: /^(?:wear|put\s+on)\s+(?:the\s+)?(.+)$/i,
  talk: /^(?:talk|speak|chat)\s+(?:to|with)\s+(?:the\s+)?(.+)$/i,
  ask: /^(?:ask|question)\s+(?:the\s+)?(.+?)(?:\s+about\s+.+)?$/i,
  smash: /^(?:smash|destroy|break|kill|hit|attack|wreck|whack|beat)\s+(?:up\s+)?(?:the\s+)?(.+?)(?:\s+with\s+(?:the\s+)?(.+))?$/i,
  install: /^(?:install|run|load)\s+(?:the\s+)?(.+)$/i,
  sit: /^(?:sit(?:\s+down)?|relax)$/i,
  wait: /^(?:wait|z)$/i,
  snooze: /^(?:snooze|hit\s+(?:the\s+)?snooze(?:\s+button)?|press\s+snooze)(?:\s+(?:the\s+)?(.+))?$/i,
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
  install: { action: 'install' },
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
  [RE.drive, 'go'],
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
  [RE.install, 'install'],
];

/**
 * Fast, zero-latency parser for canonical commands.
 * Returns null when input doesn't match — caller should fall through to the LLM parser.
 */
export function fallbackParse(rawInput: string): ParsedAction | null {
  return parse(rawInput, true);
}

/** Like fallbackParse, but without the bare-word-means-go guess. */
function strictParse(rawInput: string): ParsedAction | null {
  return parse(rawInput, false);
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
export function splitCommands(rawInput: string): string[] {
  const input = rawInput.trim().replace(/[.!]+$/, '');
  if (!input) return [];
  return input.split(CLAUSE_BREAK).filter(Boolean).flatMap(splitClause);
}

function splitClause(clause: string): string[] {
  const pieces = clause.split(LIST_BREAK).filter(Boolean);
  if (pieces.length === 1) return [clause];
  const out: string[] = [];
  let listVerb: string | null = null;
  for (const piece of pieces) {
    const parsed = strictParse(piece);
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

function parse(rawInput: string, allowBareWord: boolean): ParsedAction | null {
  const input = rawInput.trim().toLowerCase();
  if (!input) return null;

  if (input in SINGLE_WORD) return SINGLE_WORD[input];
  if (input in DIRECTIONS) return { action: 'go', target: DIRECTIONS[input] };
  if (RE.driveBare.test(input)) return { action: 'go', target: 'drive' };
  // snooze runs before the verb-pattern loop because "hit" is a smash synonym;
  // "hit snooze" would otherwise be parsed as smash("snooze"). Target is
  // optional — the handler doesn't need it, but accepting it stops "snooze
  // alarm clock" from falling all the way through to the LLM.
  {
    const m = input.match(RE.snooze);
    if (m) return { action: 'snooze', target: m[1]?.trim() };
  }

  // Sleeping is using whatever bed is here; the world decides what that does.
  // Checked before the verb patterns so "go to bed" and "take a nap" aren't
  // read as movement or taking.
  if (RE.sleep.test(input)) return { action: 'use', target: 'bed' };

  for (const [re, action] of VERB_PATTERNS) {
    const m = input.match(re);
    if (!m) continue;
    const parsed: ParsedAction = { action, target: m[1].trim() };
    if (m[2]) parsed.indirect = m[2].trim();
    return parsed;
  }

  if (RE.sit.test(input)) return { action: 'sit' };
  if (RE.wait.test(input)) return { action: 'wait' };

  // Bare single-word fallback: treat as a movement target ("lobby", "cubicles", "forward").
  // The engine's fuzzy exit matcher will validate against current room exits.
  if (allowBareWord && /^[a-z][a-z_]*$/i.test(input)) {
    return { action: 'go', target: input };
  }

  return null;
}
