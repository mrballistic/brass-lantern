import type { ParsedAction } from '@/types/game';
import { isSelfWord } from './fuzzy';
import type { World, WorldVerb } from '@/types/world';

const DIRECTIONS: Record<string, string> = {
  n: 'north', north: 'north',
  s: 'south', south: 'south',
  e: 'east', east: 'east',
  w: 'west', west: 'west',
  up: 'up', down: 'down', u: 'up', d: 'down',
  ne: 'northeast', northeast: 'northeast',
  nw: 'northwest', northwest: 'northwest',
  se: 'southeast', southeast: 'southeast',
  sw: 'southwest', southwest: 'southwest',
  out: 'out', outside: 'outside', exit: 'out',
  in: 'in', inside: 'inside',
  back: 'back',
};

const RE = {
  movement: /^(?:go|walk|head|run|exit)\s+(?:to\s+(?:the\s+)?|toward\s+|over\s+to\s+(?:the\s+)?|out\s+to\s+(?:the\s+)?)?(.+)$/i,
  enter: /^(?:enter|go\s+into|into)\s+(?:the\s+)?(.+)$/i,
  board: /^(?:board|get\s+(?:in|into|on)|climb\s+(?:in|into|on)|sit\s+in)\s+(?:the\s+)?(.+)$/i,
  // Bare EXIT stays a direction (out), as it always was.
  disembark: /^(?:disembark|get\s+out(?:\s+of)?|get\s+off|stand(?:\s+up)?)(?:\s+(?:the\s+)?(.+))?$/i,
  // MOVE is GO only with a destination word; plain “move X” is left for worlds (MOVE RUG).
  moveTo: /^move\s+(?:to|toward|towards|over\s+to)\s+(?:the\s+)?(.+)$/i,
  climb: /^climb(?:\s+(up|down))?(?:\s+(?:the\s+)?(.+))?$/i,
  take: /^(?:take|get|grab|pick\s+up)\s+(?:the\s+)?(.+)$/i,
  drop: /^(?:drop|put\s+down|leave)\s+(?:the\s+)?(.+)$/i,
  examine: /^(?:examine|inspect|look\s+at|x)\s+(?:the\s+)?(.+)$/i,
  read: /^read\s+(?:the\s+)?(.+)$/i,
  // Zork's prepositions: PUT UNDER/BEHIND, THROW OFF/OVER, READ THROUGH, PUSH X dir / TO Y.
  putUnder: /^(?:put|place|slide|push|stick)\s+(?:the\s+)?(.+?)\s+(?:under|underneath|beneath|below)\s+(?:the\s+)?(.+)$/i,
  putBehind: /^(?:put|place|slide|push|stick)\s+(?:the\s+)?(.+?)\s+behind\s+(?:the\s+)?(.+)$/i,
  throwOff: /^(?:throw|toss|hurl)\s+(?:the\s+)?(.+?)\s+off\s+(?:of\s+)?(?:the\s+)?(.+)$/i,
  throwOver: /^(?:throw|toss|hurl)\s+(?:the\s+)?(.+?)\s+over\s+(?:of\s+)?(?:the\s+)?(.+)$/i,
  readWith: /^read\s+(?:the\s+)?(.+?)\s+(?:through|with|using)\s+(?:the\s+)?(.+)$/i,
  pushDir: /^(?:push|move|shove)\s+(?:the\s+)?(.+?)\s+(north|south|east|west|northeast|northwest|southeast|southwest|up|down|n|s|e|w|ne|nw|se|sw|u|d)$/i,
  pushTo: /^(?:push|move|shove)\s+(?:the\s+)?(.+?)\s+to\s+(?:the\s+)?(.+)$/i,
  turnOn: /^(?:turn|switch)\s+on\s+(?:the\s+)?(.+)$/i,
  turnOnAfter: /^(?:turn|switch)\s+(?:the\s+)?(.+?)\s+on$/i,
  light: /^light\s+(?:the\s+)?(.+)$/i,
  burn: /^(?:burn(?:\s+down)?|ignite|incinerate|light)\s+(?:the\s+)?(.+?)\s+with\s+(?:the\s+|a\s+)?(.+)$/i,
  burnAlone: /^(?:burn(?:\s+down)?|ignite|incinerate)\s+(?:the\s+)?(.+)$/i,
  turnOnWith: /^(?:turn|switch)\s+on\s+(?:the\s+)?(.+?)\s+with\s+(?:the\s+|a\s+)?(.+)$/i,
  // TURN X TO N, SET X TO N (and FOR): a dial. SET X ON Y stays PUT.
  turnTo: /^(?:turn|set)\s+(?:the\s+)?(.+?)\s+(?:to|for)\s+(?:the\s+)?(.+)$/i,
  turnWith: /^turn\s+(?:the\s+)?(.+?)\s+with\s+(?:the\s+|a\s+)?(.+)$/i,
  plugWith: /^plug\s+(?:the\s+)?(.+?)\s+with\s+(?:the\s+|a\s+)?(.+)$/i,
  turnOff: /^(?:(?:turn|switch)\s+off|extinguish|douse|blow\s+out|put\s+out)\s+(?:the\s+)?(.+)$/i,
  turnOffAfter: /^(?:turn|switch)\s+(?:the\s+)?(.+?)\s+off$/i,
  use: /^(?:use|operate|push|pull|press)\s+(?:the\s+)?(.+?)(?:\s+(?:on|in|into|with)\s+(?:the\s+)?(.+))?$/i,
  open: /^open\s+(?:the\s+)?(.+)$/i,
  close: /^(?:close|shut)\s+(?:the\s+)?(.+)$/i,
  lock: /^lock\s+(?:the\s+)?(.+?)(?:\s+with\s+(?:the\s+)?(.+))?$/i,
  unlock: /^unlock\s+(?:the\s+)?(.+?)(?:\s+with\s+(?:the\s+)?(.+))?$/i,
  putIn: /^(?:put|insert|place|slide|stick|feed|plug)\s+(?:the\s+|a\s+)?(.+?)\s+(?:in|into|inside)\s+(?:the\s+|my\s+)?(.+)$/i,
  putOn: /^(?:put|place|set)\s+(?:the\s+|a\s+)?(.+?)\s+(?:on|onto)\s+(?:the\s+)?(.+)$/i,
  takeAll: /^(?:take|get|grab|pick\s+up)\s+(?:all|everything)(?:\s+(?:but|except)\s+(.+))?$/i,
  dropAll: /^(?:drop|put\s+down)\s+(?:all|everything)(?:\s+(?:but|except)\s+(.+))?$/i,
  putAll: /^(?:put|place)\s+(?:all|everything)(?:\s+(?:but|except)\s+(.+?))?\s+(in|into|inside|on|onto)\s+(?:the\s+)?(.+)$/i,
  takeFrom: /^(?:take|get|remove)\s+(?:the\s+)?(.+?)\s+(?:from|out\s+of|off)\s+(?:the\s+)?(.+)$/i,
  search: /^(?:search|look\s+in|look\s+inside)\s+(?:the\s+)?(.+)$/i,
  // "attach X to Y", "insert disk": USE. Runs after wear/drop/putIn/putOn so those win.
  insert: /^(?:insert|put|slide|stick|feed|plug|attach)\s+(?:the\s+|a\s+)?(.+?)(?:\s+(?:in|into|on|onto|to)\s+(?:the\s+|my\s+)?(.+))?$/i,
  give: /^(?:give|hand|offer|return)\s+(?:the\s+)?(.+?)(?:\s+(?:back\s+)?to\s+(?:the\s+)?(.+?))?(?:\s+back)?$/i,
  wear: /^(?:wear|put\s+on)\s+(?:the\s+)?(.+)$/i,
  talk: /^(?:talk|speak|chat)\s+(?:to|with)\s+(?:the\s+)?(.+)$/i,
  askAbout: /^(?:ask|question|tell)\s+(?:the\s+)?(.+?)\s+about\s+(.+)$/i,
  // The person can't run past an ABOUT: “ask bob about going to the store” is ASK.
  orderTo: /^(?:tell|order|ask)\s+(?:the\s+)?((?:(?!\s+about\s).)+?)\s+to\s+(.+)$/i,
  tellAlone: /^tell\s+(?:the\s+)?(.+)$/i,
  ask: /^(?:ask|question)\s+(?:the\s+)?(.+)$/i,
  smash: /^(?:smash|destroy|break|wreck|whack|beat)\s+(?:up\s+)?(?:the\s+)?(.+?)(?:\s+with\s+(?:the\s+)?(.+))?$/i,
  attack: /^(?:kill|hit|attack|fight|stab|murder|slay)\s+(?:the\s+)?(.+?)(?:\s+with\s+(?:the\s+|a\s+|my\s+)?(.+))?$/i,
  // THROW X IN Y: Zork's syntax makes it PUT.
  throwIn: /^(?:throw|toss|hurl)\s+(?:the\s+)?(.+?)\s+(?:in|into)\s+(?:the\s+)?(.+)$/i,
  throw: /^(?:throw|toss|hurl)\s+(?:the\s+)?(.+?)(?:\s+(?:at|to)\s+(?:the\s+)?(.+))?$/i,
  sit: /^(?:sit(?:\s+down)?|relax)$/i,
  wait: /^(?:wait|z)$/i,
};

/** Verbs that need an object, typed alone. */
const BARE_VERBS: Record<string, string> = {
  take: 'take', get: 'take', grab: 'take', drop: 'drop', examine: 'examine', x: 'examine', inspect: 'examine',
  read: 'read', open: 'open', close: 'close', shut: 'close', lock: 'lock', unlock: 'unlock', put: 'put',
  give: 'give', wear: 'wear', use: 'use', search: 'search', smash: 'smash', break: 'smash', attack: 'attack',
  kill: 'attack', fight: 'attack', stab: 'attack', throw: 'throw',
};

const SINGLE_WORD: Record<string, ParsedAction> = {
  look: { action: 'look' },
  l: { action: 'look' },
  talk: { action: 'talk' },
  diagnose: { action: 'diagnose' },
  inventory: { action: 'inventory' },
  inv: { action: 'inventory' },
  i: { action: 'inventory' },
  help: { action: 'help' },
  '?': { action: 'help' },
  hint: { action: 'hint' },
  hints: { action: 'hint' },
  clue: { action: 'hint' },
  score: { action: 'score' },
  verbose: { action: 'verbose' },
  brief: { action: 'brief' },
  superbrief: { action: 'superbrief' },
  restart: { action: 'restart' },
  quit: { action: 'quit' },
  save: { action: 'save' },
  load: { action: 'load' },
  script: { action: 'script' },
  unscript: { action: 'unscript' },
  version: { action: 'version' },
};

// Each entry maps a verb-pattern regex to the canonical action. The first capture
// group is the target; an optional second group is the indirect object. Order
// matters — earlier entries win on ambiguous input.
const VERB_PATTERNS: ReadonlyArray<readonly [RegExp, string, ParsedAction['prep']?]> = [
  [RE.putUnder, 'put', 'under'],
  [RE.putBehind, 'put', 'behind'],
  [RE.throwOff, 'throw', 'off'],
  [RE.throwOver, 'throw', 'over'],
  [RE.readWith, 'read', 'through'],
  [RE.board, 'board'],
  [RE.disembark, 'disembark'],
  [RE.enter, 'enter'],
  [RE.moveTo, 'go'],
  [RE.movement, 'go'],
  [RE.pushDir, 'push'],
  [RE.pushTo, 'push'],
  [RE.takeFrom, 'take'],
  [RE.take, 'take'],
  [RE.drop, 'drop'],
  [RE.search, 'search'],
  [RE.examine, 'examine'],
  [RE.read, 'read'],
  [RE.burn, 'burn'],
  [RE.burnAlone, 'burn'],
  [RE.turnOnWith, 'turn_on'],
  [RE.turnWith, 'turn'],
  [RE.plugWith, 'plug'],
  [RE.turnOn, 'turn_on'],
  [RE.turnOnAfter, 'turn_on'],
  [RE.light, 'turn_on'],
  [RE.turnOff, 'turn_off'],
  [RE.turnOffAfter, 'turn_off'],
  [RE.turnTo, 'turn'],
  [RE.open, 'open'],
  [RE.close, 'close'],
  [RE.lock, 'lock'],
  [RE.unlock, 'unlock'],
  [RE.use, 'use'],
  [RE.wear, 'wear'],
  [RE.putIn, 'put', 'in'],
  [RE.putOn, 'put', 'on'],
  [RE.insert, 'use'],
  [RE.throwIn, 'throw', 'in'],
  [RE.throw, 'throw'],
  [RE.give, 'give'],
  // An order first: “tell bob to ask about x” is an order, not ASK.
  [RE.orderTo, 'order'],
  [RE.askAbout, 'ask'],
  [RE.tellAlone, 'order'],
  [RE.talk, 'talk'],
  [RE.ask, 'talk'],
  [RE.smash, 'smash'],
  [RE.attack, 'attack'],
];

/**
 * Every word or phrase a built-in verb starts with. A world verb can't take
 * one of these (the built-in wins); verbClashes reports any that try.
 */
export const BUILT_IN_WORDS: ReadonlySet<string> = new Set([
  'go', 'move to', 'walk', 'head', 'run', 'exit', 'enter', 'into', 'take', 'get', 'grab', 'pick up',
  'drop', 'put down', 'leave', 'examine', 'inspect', 'look at', 'x', 'read', 'use', 'operate', 'open',
  'push', 'pull', 'press', 'insert', 'put', 'slide', 'stick', 'feed', 'plug', 'attach', 'give', 'hand',
  'offer', 'return', 'wear', 'put on', 'close', 'shut', 'lock', 'unlock', 'place', 'set', 'remove',
  'search', 'look in', 'look inside', 'climb', 'go into', 'turn', 'switch', 'light', 'extinguish', 'douse', 'blow out', 'put out', 'board', 'disembark', 'get in', 'get out', 'get off', 'stand', 'burn', 'burn down', 'ignite', 'incinerate', 'talk', 'speak', 'chat', 'ask', 'question', 'tell', 'order', 'smash', 'destroy',
  'break', 'kill', 'hit', 'attack', 'fight', 'stab', 'murder', 'slay', 'throw', 'toss', 'hurl', 'wreck', 'whack', 'beat', 'sit', 'sit down', 'relax', 'wait', 'z',
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
        verb.target === 'text' ? '(?:\\s+(.*))?' : verb.target === 'none' ? '' : `(?:\\s+(?:the\\s+)?(.+?))${verb.target === 'required' ? '' : '?'}`;
      const ind = preps && verb.target !== 'none' && verb.target !== 'text' ? `(?:\\s+(?:${preps})\\s+(?:the\\s+)?(.+))?` : '';
      out.push({ re: new RegExp(`^${escapeWord(word)}${obj}${ind}$`, 'i'), id, verb, phrase: /\s/.test(word.trim()) });
    }
  }
  out.sort((a, b) => b.re.source.length - a.re.source.length);
  patternCache.set(verbs, out);
  return out;
}

/** Typed words: the first quoted phrase if the text opens with a quote, else the whole rest; whitespace collapsed. */
function typedText(raw: string): string {
  const text = raw.trim();
  const quoted = text.match(/^(?:"([^"]*)"|“([^”]*)”|'([^']*)')/);
  return (quoted ? (quoted[1] ?? quoted[2] ?? quoted[3]) : text).replace(/\s+/g, ' ').trim();
}

/** ME, MYSELF, SELF in an object slot name the player: the reserved ID 'player'. */
function selfIndirect(parsed: ParsedAction): ParsedAction {
  const out = { ...parsed };
  if (out.indirect && isSelfWord(out.indirect)) out.indirect = 'player';
  if (out.target && isSelfWord(out.target)) out.target = 'player';
  return out;
}

function matchWorld(input: string, patterns: WorldPattern[]): ParsedAction | null {
  for (const { re, id, verb } of patterns) {
    const m = input.match(re);
    if (!m) continue;
    const parsed: ParsedAction = { action: id };
    if (verb.target === 'text') {
      const text = typedText(m[1] ?? '');
      if (text) parsed.text = text;
      return parsed;
    }
    if (m[1]) parsed.target = m[1].trim();
    if (m[2]) parsed.indirect = m[2].trim();
    return selfIndirect(parsed);
  }
  return null;
}

/**
 * Zork's NUMBER?: digits make a number up to 1000, and H:MM is minutes (an hour
 * under 8 is taken as the afternoon; over 23 is not a time). Anything else is a word.
 */
export function parseNumber(word: string): number | null {
  let sum = 0;
  let hours: number | null = null;
  for (const ch of word) {
    if (ch === ':') {
      hours = sum;
      sum = 0;
    } else if (sum > 10000 || ch < '0' || ch > '9') {
      return null;
    } else {
      sum = sum * 10 + (ch.charCodeAt(0) - 48);
    }
  }
  if (word === '' || sum > 1000) return null;
  if (hours !== null) {
    if (hours < 8) hours += 12;
    else if (hours > 23) return null;
    sum += hours * 60;
  }
  return sum;
}

/** An object slot that holds a number (TURN DIAL TO 4) reads the literal 'number', and the value rides along. */
function withNumbers(parsed: ParsedAction): ParsedAction {
  for (const slot of ['target', 'indirect'] as const) {
    const n = parsed[slot] === undefined ? null : parseNumber(parsed[slot]!);
    if (n !== null) return { ...parsed, [slot]: 'number', number: n };
  }
  return parsed;
}

/**
 * Fast, zero-latency parser for canonical commands.
 * Returns null when input doesn't match — caller should fall through to the LLM parser.
 */
export function fallbackParse(rawInput: string, verbs?: World['verbs']): ParsedAction | null {
  return parse(rawInput, true, verbs);
}

/** Like fallbackParse, but without the bare-word-means-go guess. */
export function strictParse(rawInput: string, verbs?: World['verbs']): ParsedAction | null {
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
  // A quoted phrase never splits (its contents are masked, length for length), and a text verb
  // takes everything after it: its words may hold full stops and “then”.
  const masked = input.replace(/"[^"]*"|“[^”]*”/g, (q) => q[0] + '_'.repeat(q.length - 2) + q[q.length - 1]);
  const textWords = Object.values(verbs ?? {})
    .filter((v) => v.target === 'text')
    .flatMap((v) => v.words.filter((w) => !BUILT_IN_WORDS.has(w.toLowerCase())).map(escapeWord));
  const textVerb = textWords.length ? new RegExp(`^(?:${textWords.join('|')})(?:\\s|$)`, 'i') : null;
  const out: string[] = [];
  let start = 0;
  const breaks = [...masked.matchAll(new RegExp(CLAUSE_BREAK.source, 'gi'))].map((m) => [m.index, m.index + m[0].length]);
  for (const [breakAt, next] of [...breaks, [masked.length, masked.length]]) {
    const clause = input.slice(start, breakAt);
    if (textVerb?.test(clause)) {
      out.push(input.slice(start));
      return out;
    }
    if (clause) out.push(...splitClause(clause, verbs));
    start = next;
  }
  return out;
}

/** “take all but the wallet and shirt” → { action: 'take', target: 'all', except: ['wallet', 'shirt'] }. */
function parseAll(input: string): ParsedAction | null {
  const exceptList = (s?: string) =>
    s ? s.split(/\s*(?:,|\band\b)\s*/).map((w) => w.replace(/^(?:the|a|an)\s+/, '').trim()).filter(Boolean) : undefined;
  const withExcept = (a: ParsedAction, list?: string[]) => (list?.length ? { ...a, except: list } : a);
  let m = input.match(RE.takeAll);
  if (m) return withExcept({ action: 'take', target: 'all' }, exceptList(m[1]));
  m = input.match(RE.dropAll);
  if (m) return withExcept({ action: 'drop', target: 'all' }, exceptList(m[1]));
  m = input.match(RE.putAll);
  if (m) {
    const prep = /^on/.test(m[2]) ? 'on' : 'in';
    const base: ParsedAction = { action: 'put', target: 'all' };
    const a = withExcept(base, exceptList(m[1]));
    return { ...a, indirect: m[3].trim(), prep };
  }
  return null;
}

/** “neighbor, give me the key”: an order, when the part before the comma isn't a command of its own. */
function orderInLine(input: string, verbs?: World['verbs']): ParsedAction | null {
  const m = input.match(/^(?:the\s+)?([^,]+?)\s*,\s*(.+)$/i);
  if (!m || /\b(?:all|everything)\b/i.test(m[1])) return null;
  const head = m[1].trim();
  const first = head.split(/\s+/)[0].toLowerCase();
  if (BUILT_IN_WORDS.has(first) || strictParse(head, verbs)) return null;
  if (Object.values(verbs ?? {}).some((v) => v.words.some((w) => w.toLowerCase() === first))) return null;
  return { action: 'order', target: head, indirect: m[2].trim() };
}

function splitClause(clause: string, verbs?: World['verbs']): string[] {
  if (orderInLine(clause, verbs)) return [clause];
  // “take all but the wallet and shirt” is one command.
  if (/\b(?:all|everything)\b.*\b(?:but|except)\b/i.test(clause)) return [clause];
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
  // A verb on its own (“take”): the engine asks what for.
  if (input in BARE_VERBS) return { action: BARE_VERBS[input] };
  if (input === 'exit') return { action: 'go', target: 'out', exit: true };
  // STAND and a bare GET OUT are DISEMBARK by another road (Zork's V-STAND, TAKE OUT): no vehicle guess.
  if (/^stand(?:\s+up)?$/.test(input)) return { action: 'disembark', via: 'stand' };
  if (/^get\s+(?:out|off)$/.test(input)) return { action: 'disembark', via: 'out' };
  if (input in DIRECTIONS) return { action: 'go', target: DIRECTIONS[input] };
  if (input === 'enter') return { action: 'enter' };
  {
    const m = RE.board.test(input) ? null : input.match(RE.climb);
    if (m) {
      if (m[2] && m[1]) return { action: 'climb', target: m[2].trim(), direction: m[1] as 'up' | 'down' };
      return m[2] || m[1] ? { action: 'climb', target: (m[2] ?? m[1]).trim() } : { action: 'climb' };
    }
  }
  {
    const order = orderInLine(input, verbs);
    if (order) return order;
  }

  // A world's multi-word phrases go first, so "hit the snooze button" isn't
  // read as SMASH, or "go to bed" as GO. Single words go after the built-ins.
  const patterns = worldPatterns(verbs);
  const phrase = matchWorld(input, patterns.filter((p) => p.phrase));
  if (phrase) return phrase;

  const all = parseAll(input);
  if (all) return all;

  for (const [re, action, prep] of VERB_PATTERNS) {
    const m = input.match(re);
    if (!m) continue;
    // A pattern with an optional object (DISEMBARK [the boat]) may match without one.
    const parsed: ParsedAction = m[1] ? { action, target: m[1].trim() } : { action };
    if (m[2]) parsed.indirect = m[2].trim();
    if (prep) parsed.prep = prep;
    // PUSH X north: the second capture is a direction, not a second object.
    if (action === 'push' && m[2] && re === RE.pushDir) {
      delete parsed.indirect;
      parsed.direction = DIRECTIONS[m[2].trim()] as ParsedAction['direction'];
    }
    return withNumbers(selfIndirect(parsed));
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
