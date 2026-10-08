import type { ParsedAction } from '../types/game.ts';
import type { World, WorldVerb } from '../types/world.ts';

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

/**
 * The longest line the parser reads, counted after whitespace is collapsed (so padding can't push a command over
 * it). Longer input is rejected, not cut short: `splitCommands` returns no commands, `fallbackParse` and
 * `strictParse` return null, `interpret` replies TOO_LONG_REPLY, and `createGame().send` and the Vue store answer
 * with that reply before anything runs, so nothing changes. It bounds the work any one line can cost.
 */
export const MAX_INPUT_LENGTH = 1000;

/** What a line over MAX_INPUT_LENGTH hears. */
export const TOO_LONG_REPLY = '[That’s too long for me to follow. Nothing happened.]';

/**
 * A line as the parser reads it: trimmed, every run of whitespace one space, or null if it's over
 * MAX_INPUT_LENGTH. Every pattern below is written for this form (a single literal space between words), so no
 * two neighbouring parts of a pattern can both match a run of spaces.
 */
export function cleanInput(raw: string): string | null {
  const input = raw.trim().replace(/\s+/g, ' ');
  return input.length > MAX_INPUT_LENGTH ? null : input;
}

const RE = {
  movement: /^(?:go|walk|head|run|exit) (?:to (?:the )?|toward |over to (?:the )?|out to (?:the )?)?(.+)$/i,
  enter: /^(?:enter|go into|into) (?:the )?(.+)$/i,
  board: /^(?:board|get (?:in|into|on)|climb (?:in|into|on)|sit in) (?:the )?(.+)$/i,
  // Bare EXIT stays a direction (out), as it always was.
  disembark: /^(?:disembark|get out(?: of)?|get off|stand(?: up)?)(?: (?:the )?(.+))?$/i,
  // MOVE is GO only with a destination word; plain “move X” is left for worlds (MOVE RUG).
  moveTo: /^move (?:to|toward|towards|over to) (?:the )?(.+)$/i,
  climb: /^climb(?: (up|down))?(?: (?:the )?(.+))?$/i,
  take: /^(?:take|get|grab|pick up) (?:the )?(.+)$/i,
  drop: /^(?:drop|put down|leave) (?:the )?(.+)$/i,
  follow: /^follow (?:the )?(.+)$/i,
  examine: /^(?:examine|inspect|look at|x) (?:the )?(.+)$/i,
  read: /^read (?:the )?(.+)$/i,
  // Zork's prepositions: PUT UNDER/BEHIND, THROW OFF/OVER, READ THROUGH, PUSH X dir / TO Y.
  putUnder: /^(?:put|place|slide|push|stick) (?:the )?(.+?) (?:under|underneath|beneath|below) (?:the )?(.+)$/i,
  putBehind: /^(?:put|place|slide|push|stick) (?:the )?(.+?) behind (?:the )?(.+)$/i,
  throwOff: /^(?:throw|toss|hurl) (?:the )?(.+?) off (?:of )?(?:the )?(.+)$/i,
  throwOver: /^(?:throw|toss|hurl) (?:the )?(.+?) over (?:of )?(?:the )?(.+)$/i,
  readWith: /^read (?:the )?(.+?) (?:through|with|using) (?:the )?(.+)$/i,
  pushDir: /^(?:push|move|shove) (?:the )?(.+?) (north|south|east|west|northeast|northwest|southeast|southwest|up|down|n|s|e|w|ne|nw|se|sw|u|d)$/i,
  pushTo: /^(?:push|move|shove) (?:the )?(.+?) to (?:the )?(.+)$/i,
  turnOn: /^(?:turn|switch) on (?:the )?(.+)$/i,
  turnOnAfter: /^(?:turn|switch) (?:the )?(.+?) on$/i,
  light: /^light (?:the )?(.+)$/i,
  burn: /^(?:burn(?: down)?|ignite|incinerate|light) (?:the )?(.+?) with (?:the |a )?(.+)$/i,
  burnAlone: /^(?:burn(?: down)?|ignite|incinerate) (?:the )?(.+)$/i,
  turnOnWith: /^(?:turn|switch) on (?:the )?(.+?) with (?:the |a )?(.+)$/i,
  // TURN X TO N, SET X TO N (and FOR): a dial. SET X ON Y stays PUT.
  turnTo: /^(?:turn|set) (?:the )?(.+?) (?:to|for) (?:the )?(.+)$/i,
  turnWith: /^turn (?:the )?(.+?) with (?:the |a )?(.+)$/i,
  plugWith: /^plug (?:the )?(.+?) with (?:the |a )?(.+)$/i,
  turnOff: /^(?:(?:turn|switch) off|extinguish|douse|blow out|put out) (?:the )?(.+)$/i,
  turnOffAfter: /^(?:turn|switch) (?:the )?(.+?) off$/i,
  use: /^(?:use|operate|push|pull|press) (?:the )?(.+?)(?: (?:on|in|into|with) (?:the )?(.+))?$/i,
  open: /^open (?:the )?(.+)$/i,
  close: /^(?:close|shut) (?:the )?(.+)$/i,
  lock: /^lock (?:the )?(.+?)(?: with (?:the )?(.+))?$/i,
  unlock: /^unlock (?:the )?(.+?)(?: with (?:the )?(.+))?$/i,
  putIn: /^(?:put|insert|place|slide|stick|feed|plug) (?:the |a )?(.+?) (?:in|into|inside) (?:the |my )?(.+)$/i,
  putOn: /^(?:put|place|set) (?:the |a )?(.+?) (?:on|onto) (?:the )?(.+)$/i,
  takeAll: /^(?:take|get|grab|pick up) (?:all|everything)(?: (?:but|except) (.+))?$/i,
  dropAll: /^(?:drop|put down) (?:all|everything)(?: (?:but|except) (.+))?$/i,
  putAll: /^(?:put|place) (?:all|everything)(?: (?:but|except) (.+?))? (in|into|inside|on|onto) (?:the )?(.+)$/i,
  takeFrom: /^(?:take|get|remove) (?:the )?(.+?) (?:from|out of|off) (?:the )?(.+)$/i,
  search: /^(?:search|look in|look inside) (?:the )?(.+)$/i,
  // "attach X to Y", "insert disk": USE. Runs after wear/drop/putIn/putOn so those win.
  insert: /^(?:insert|put|slide|stick|feed|plug|attach) (?:the |a )?(.+?)(?: (?:in|into|on|onto|to) (?:the |my )?(.+))?$/i,
  give: /^(?:give|hand|offer|return) (?:the )?(.+?)(?: (?:back )?to (?:the )?(.+?))?(?: back)?$/i,
  wear: /^(?:wear|put on) (?:the )?(.+)$/i,
  talk: /^(?:talk|speak|chat) (?:to|with) (?:the )?(.+)$/i,
  askAbout: /^(?:ask|question|tell) (?:the )?(.+?) about (.+)$/i,
  // The person can't run past an ABOUT: “ask bob about going to the store” is ASK.
  orderTo: /^(?:tell|order|ask) (?:the )?((?:(?! about ).)+?) to (.+)$/i,
  tellAlone: /^tell (?:the )?(.+)$/i,
  ask: /^(?:ask|question) (?:the )?(.+)$/i,
  smash: /^(?:smash|destroy|break|wreck|whack|beat) (?:up )?(?:the )?(.+?)(?: with (?:the )?(.+))?$/i,
  attack: /^(?:kill|hit|attack|fight|stab|murder|slay) (?:the )?(.+?)(?: with (?:the |a |my )?(.+))?$/i,
  // THROW X IN Y: Zork's syntax makes it PUT.
  throwIn: /^(?:throw|toss|hurl) (?:the )?(.+?) (?:in|into) (?:the )?(.+)$/i,
  throw: /^(?:throw|toss|hurl) (?:the )?(.+?)(?: (?:at|to) (?:the )?(.+))?$/i,
  sit: /^(?:sit(?: down)?|relax)$/i,
  wait: /^(?:wait|z)$/i,
};

/** Verbs that need an object, typed alone. */
const BARE_VERBS: Record<string, string> = {
  take: 'take', get: 'take', grab: 'take', drop: 'drop', examine: 'examine', x: 'examine', inspect: 'examine',
  read: 'read', open: 'open', close: 'close', shut: 'close', lock: 'lock', unlock: 'unlock', put: 'put',
  give: 'give', wear: 'wear', use: 'use', search: 'search', smash: 'smash', break: 'smash', attack: 'attack',
  kill: 'attack', fight: 'attack', stab: 'attack', throw: 'throw', follow: 'follow',
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
  [RE.follow, 'follow'],
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
  'break', 'kill', 'hit', 'attack', 'fight', 'stab', 'murder', 'slay', 'throw', 'toss', 'hurl', 'wreck', 'whack', 'beat', 'sit', 'sit down', 'relax', 'wait', 'z', 'follow',
  ...Object.keys(SINGLE_WORD),
  ...Object.keys(DIRECTIONS),
]);

/** World verb words that a built-in verb already owns (an `afterBuiltIns` verb may share them). */
export function verbClashes(verbs: World['verbs']): string[] {
  return Object.values(verbs ?? {}).flatMap((v) => (v.afterBuiltIns ? [] : v.words.filter((w) => BUILT_IN_WORDS.has(w.toLowerCase()))));
}

// Patterns match cleaned input (cleanInput), so a word's spaces are single literal spaces.
const escapeWord = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, ' ');

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
      if (BUILT_IN_WORDS.has(word.toLowerCase()) && !verb.afterBuiltIns) continue;
      const preps = (verb.indirect ?? []).map(escapeWord).join('|');
      const obj =
        verb.target === 'text' ? '(?: (.*))?' : verb.target === 'none' ? '' : `(?: (?:the )?(.+?))${verb.target === 'required' ? '' : '?'}`;
      const ind = preps && verb.target !== 'none' && verb.target !== 'text' ? `(?: (?:${preps}) (?:the )?(.+))?` : '';
      // An afterBuiltIns verb's phrases wait for the built-ins too.
      out.push({ re: new RegExp(`^${escapeWord(word)}${obj}${ind}$`, 'i'), id, verb, phrase: !verb.afterBuiltIns && /\s/.test(word.trim()) });
    }
  }
  out.sort((a, b) => b.re.source.length - a.re.source.length);
  patternCache.set(verbs, out);
  return out;
}

/**
 * Typed words: the first quoted phrase if the text opens with a double quote, else the whole rest;
 * whitespace collapsed. Single quotes are no quoting: an apostrophe (“don't”) must not cut it short.
 */
function typedText(raw: string): string {
  const text = raw.trim();
  const quoted = text.match(/^(?:"([^"]*)"|“([^”]*)”)/);
  return (quoted ? (quoted[1] ?? quoted[2]) : text).replace(/\s+/g, ' ').trim();
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
    return parsed;
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

/** Does `word` (an object slot) hold the command's number: the typed digits, or the literal 'number' the intent server sends? */
export function readsNumber(action: Pick<ParsedAction, 'number'>, word?: string): boolean {
  return action.number !== undefined && word !== undefined && (word === 'number' || parseNumber(word.trim()) === action.number);
}

/**
 * An object slot that holds a number (TURN DIAL TO 4): the value rides along, and the slot keeps the
 * digits typed, so a verb with no rule for it misses with them (“You don’t see a “5” here.”).
 */
function withNumbers(parsed: ParsedAction): ParsedAction {
  for (const slot of ['target', 'indirect'] as const) {
    const n = parsed[slot] === undefined ? null : parseNumber(parsed[slot]!);
    if (n !== null) return { ...parsed, number: n };
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
// Both read cleaned input (cleanInput): one space between words.
const CLAUSE_BREAK = / ?(?:;|(?<!\b(?:dr|mr|mrs|ms|st))\. |,? (?:and )?then ) ?/i;
const LIST_BREAK = / ?(?:, ?(?:and )?| and ) ?/i;

/** `s` without any full stops or exclamation marks at its end (a loop: a `[.!]+$` regex is quadratic on a long run). */
function stripTrailingStops(s: string): string {
  let end = s.length;
  while (end > 0 && (s[end - 1] === '.' || s[end - 1] === '!')) end--;
  return s.slice(0, end);
}

/**
 * Every quoted phrase ("…" or “…”) with its contents masked, length for length, so nothing inside splits.
 * A scan, not a regex: an unclosed quote is looked for once per kind, so a line of “s stays linear.
 */
function maskQuotes(s: string): string {
  let out = '';
  let i = 0;
  const unclosed = new Set<string>();
  while (i < s.length) {
    const open = s[i];
    const close = open === '"' ? '"' : open === '“' ? '”' : null;
    if (close && !unclosed.has(open)) {
      const end = s.indexOf(close, i + 1);
      if (end >= 0) {
        out += open + '_'.repeat(end - i - 1) + close;
        i = end + 1;
        continue;
      }
      unclosed.add(open);
    }
    out += open;
    i++;
  }
  return out;
}

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
  const clean = cleanInput(rawInput);
  if (clean === null) return [];
  const input = stripTrailingStops(clean);
  if (!input) return [];
  // A quoted phrase never splits (its contents are masked, length for length), and a text verb
  // takes everything after it: its words may hold full stops and “then”.
  const masked = maskQuotes(input);
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

// TAKE/DROP/PUT ALL, read in steps rather than one backtracking pattern: the verb and ALL, then an optional
// BUT/EXCEPT list, then (PUT) the place. Input is cleaned (one space between words).
const ALL_HEAD = /^(take|get|grab|pick up|drop|put down|put|place) (?:all|everything)(?= |$)/;
const ALL_VERB: Record<string, 'take' | 'drop' | 'put'> = {
  take: 'take', get: 'take', grab: 'take', 'pick up': 'take', drop: 'drop', 'put down': 'drop', put: 'put', place: 'put',
};
const BUT = /^(?:but|except) /;
/** The place after PUT ALL [BUT …]: “ in the box” (from `at`, a space). */
const PUT_PLACE = / (in|into|inside|on|onto) (?:the )?(.+)$/y;

/** “take all but the wallet and shirt” → { action: 'take', target: 'all', except: ['wallet', 'shirt'] }. */
function parseAll(input: string): ParsedAction | null {
  const exceptList = (s?: string) =>
    s ? s.split(/ ?(?:,|\band\b) ?/).map((w) => w.replace(/^(?:the|a|an) /, '').trim()).filter(Boolean) : undefined;
  const withExcept = (a: ParsedAction, list?: string[]) => (list?.length ? { ...a, except: list } : a);
  const head = ALL_HEAD.exec(input);
  if (!head) return null;
  const verb = ALL_VERB[head[1]];
  const rest = input.slice(head[0].length); // '' or ' …'
  if (verb !== 'put') {
    if (rest === '') return { action: verb, target: 'all' };
    const but = BUT.exec(rest.slice(1));
    const list = but ? rest.slice(1 + but[0].length) : '';
    return list ? withExcept({ action: verb, target: 'all' }, exceptList(list)) : null;
  }
  const place = (from: string, at: number) => {
    PUT_PLACE.lastIndex = at;
    return PUT_PLACE.exec(from);
  };
  const put = (m: RegExpExecArray, except?: string): ParsedAction => ({
    ...withExcept({ action: 'put', target: 'all' }, exceptList(except)),
    indirect: m[2].trim(),
    prep: /^on/.test(m[1]) ? 'on' : 'in',
  });
  // PUT ALL BUT x y z IN box: the shortest list after which the place follows.
  const but = BUT.exec(rest.slice(1));
  if (but) {
    const list = rest.slice(1 + but[0].length);
    for (let at = list.indexOf(' ', 1); at >= 0; at = list.indexOf(' ', at + 1)) {
      const m = place(list, at);
      if (m) return put(m, list.slice(0, at));
    }
  }
  const m = place(rest, 0);
  return m ? put(m) : null;
}

/** “neighbor, give me the key”: an order, when the part before the comma isn't a command of its own. */
function orderInLine(input: string, verbs?: World['verbs']): ParsedAction | null {
  // Everything before the first comma (less a leading THE), and everything after it.
  const m = /^([^,]+),(.+)$/.exec(input);
  if (!m) return null;
  const the = /^the /i.exec(m[1]);
  const who = the && m[1].length > the[0].length ? m[1].slice(the[0].length) : m[1];
  if (/\b(?:all|everything)\b/i.test(who)) return null;
  const head = who.trim();
  const first = head.split(/\s+/)[0].toLowerCase();
  if (BUILT_IN_WORDS.has(first) || strictParse(head, verbs)) return null;
  if (Object.values(verbs ?? {}).some((v) => v.words.some((w) => w.toLowerCase() === first))) return null;
  return { action: 'order', target: head, indirect: m[2].trim() };
}

function splitClause(clause: string, verbs?: World['verbs']): string[] {
  if (orderInLine(clause, verbs)) return [clause];
  // “take all but the wallet and shirt” is one command.
  const all = /\b(?:all|everything)\b/i.exec(clause);
  if (all && /\b(?:but|except)\b/i.test(clause.slice(all.index + all[0].length))) return [clause];
  const pieces = clause.split(LIST_BREAK).filter(Boolean);
  if (pieces.length === 1) return [clause];
  const out: string[] = [];
  let listVerb: string | null = null;
  for (const piece of pieces) {
    const parsed = strictParse(piece, verbs);
    if (parsed) {
      out.push(piece);
      listVerb = Object.hasOwn(LIST_VERBS, parsed.action) ? LIST_VERBS[parsed.action] : null;
    } else if (listVerb) {
      out.push(`${listVerb} ${piece}`);
    } else {
      return [clause];
    }
  }
  return out;
}

function parse(rawInput: string, allowBareWord: boolean, verbs?: World['verbs']): ParsedAction | null {
  const input = cleanInput(rawInput)?.toLowerCase();
  if (!input) return null;

  if (Object.hasOwn(SINGLE_WORD, input)) return SINGLE_WORD[input];
  // A verb on its own (“take”): the engine asks what for.
  if (Object.hasOwn(BARE_VERBS, input)) return { action: BARE_VERBS[input] };
  if (input === 'exit') return { action: 'go', target: 'out', exit: true };
  // STAND and a bare GET OUT are DISEMBARK by another road (Zork's V-STAND, TAKE OUT): no vehicle guess.
  if (/^stand(?:\s+up)?$/.test(input)) return { action: 'disembark', via: 'stand' };
  if (/^get\s+(?:out|off)$/.test(input)) return { action: 'disembark', via: 'out' };
  if (Object.hasOwn(DIRECTIONS, input)) return { action: 'go', target: DIRECTIONS[input] };
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
    return withNumbers(parsed);
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
