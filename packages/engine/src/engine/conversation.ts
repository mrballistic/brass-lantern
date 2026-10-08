import type { GameState, ParsedAction } from '../types/game.ts';
import type { World } from '../types/world.ts';
import { fuzzyCandidates } from './fuzzy.ts';
import { BUILT_IN_WORDS, strictParse } from './parser.ts';
import type { Ask, EngineResult } from './result.ts';

/**
 * Everything that lives between commands: a question waiting for its answer,
 * what “it” and “her” mean, the last command (AGAIN), the last line nobody
 * understood (OOPS), and the undo history. A plain object the store holds;
 * none of it is saved.
 */
export interface Conversation {
  pending: Ask | null;
  /** SAVE or RESTORE asked for a name; the next line answers it. */
  prompt: 'save' | 'restore' | null;
  /** The last thing acted on (it, them, that). */
  it: string | null;
  /** The last person acted on (him, her). */
  him: string | null;
  /** The last command the engine acted on, for AGAIN. */
  lastAction: ParsedAction | null;
  /** Whether the last turn asked a question (AGAIN can't repeat a fragment). */
  lastAsked: boolean;
  /** The last input nobody understood, for OOPS. */
  lastUnknown: string | null;
  /** Snapshots before each changing turn, for UNDO. */
  history: Array<{ state: GameState; outputLength: number }>;
  /** The last turn dropped the rest of its line (Zork's P-CONT), with a message to say if commands were left. */
  stopLine?: true | string;
}

export function newConversation(): Conversation {
  return { pending: null, prompt: null, it: null, him: null, lastAction: null, lastAsked: false, lastUnknown: null, history: [] };
}

/** What to do with a line of input. */
export type Step =
  /** Run this action directly (an answer, AGAIN): never via the intent server. */
  | { run: ParsedAction; viaAnswer?: boolean }
  /** Print this; nothing runs. */
  | { reply: string[] }
  /** Treat as a fresh command: regex parser, engine, intent server. `note` prints first. */
  | { parse: string; note?: string[] };

function fill(action: ParsedAction, slot: Ask['slot'], value: string, byId: boolean): ParsedAction {
  const filled = { ...action, [slot]: value };
  return byId ? { ...filled, byId: true } : filled;
}

/** Turns a line into a step, answering a pending question if it is an answer. */
export function interpret(input: string, conv: Conversation, world: World, _state: GameState): Step {
  const word = input.trim().toLowerCase();
  if (word === 'again' || word === 'g') {
    conv.pending = null;
    if (conv.lastAsked) return { reply: ['It’s difficult to repeat fragments.'] };
    if (!conv.lastAction) return { reply: ['Beg pardon?'] };
    return { run: conv.lastAction, viaAnswer: true };
  }
  const oops = word.match(/^oops\s+(.+)$/);
  if (oops) {
    conv.pending = null;
    if (!conv.lastUnknown) return { reply: ['There was no word to replace!'] };
    const [replacement, ...extra] = oops[1].split(/\s+/);
    const corrected = replaceUnknownWord(conv.lastUnknown, replacement, world);
    conv.lastUnknown = null;
    if (!corrected) return { reply: ['There was no word to replace!'] };
    return { parse: corrected, note: extra.length > 0 ? ['Warning: only the first word after OOPS is used.'] : undefined };
  }
  const pending = conv.pending;
  conv.pending = null;
  if (!pending) return { parse: input };
  // Anything that is a command in its own right drops the question (as in Zork).
  if (strictParse(input, world.verbs)) return { parse: input };
  if (pending.kind === 'which') {
    const candidates = pending.candidates.map((id) => ({ id, name: world.items[id]?.name ?? id, aliases: world.items[id]?.aliases }));
    const found = fuzzyCandidates(input, candidates);
    if (found.length === 1) return { run: fill(pending.action, pending.slot, found[0], true), viaAnswer: true };
    // Still several: the handler asks again with the narrower set.
    if (found.length > 1) return { run: fill(pending.action, pending.slot, input, false), viaAnswer: true };
    return { parse: input };
  }
  return { run: fill(pending.action, pending.slot, input, false), viaAnswer: true };
}

const FILLER = new Set(['the', 'a', 'an', 'to', 'with', 'in', 'on', 'at', 'my', 'into', 'onto', 'from', 'and', 'then', 'it', 'them']);

/** Every word the world or the parser knows. */
function knownWords(world: World): Set<string> {
  const words = new Set<string>(FILLER);
  const add = (text: string) => text.toLowerCase().split(/[\s_]+/).forEach((w) => w && words.add(w));
  for (const w of BUILT_IN_WORDS) add(w);
  for (const [id, v] of Object.entries(world.verbs ?? {})) [id, ...v.words].forEach(add);
  for (const [id, item] of Object.entries(world.items)) [id, item.name, ...(item.aliases ?? [])].forEach(add);
  for (const [id, npc] of Object.entries(world.npcs)) [id, npc.name].forEach(add);
  for (const [id, room] of Object.entries(world.rooms)) [id, room.name, ...Object.keys(room.exits)].forEach(add);
  return words;
}

/** The line with its first unknown word replaced, or null if every word is known. */
function replaceUnknownWord(line: string, replacement: string, world: World): string | null {
  const known = knownWords(world);
  const words = line.trim().split(/\s+/);
  const i = words.findIndex((w) => !known.has(w.toLowerCase().replace(/[^a-z0-9_]/g, '')));
  if (i < 0) return null;
  words[i] = replacement;
  return words.join(' ');
}

const IT = /^(?:it|them|that|this|those)$/i;
const HIM = /^(?:him|her)$/i;

function pronoun(word: string | undefined, conv: Conversation): string | undefined {
  if (!word) return word;
  if (IT.test(word.trim()) && conv.it) return conv.it;
  if (HIM.test(word.trim()) && conv.him) return conv.him;
  return word;
}

/** “give it to her” → the last thing and the last person acted on. */
export function resolvePronouns(action: ParsedAction, conv: Conversation): ParsedAction {
  const target = pronoun(action.target, conv);
  const indirect = pronoun(action.indirect, conv);
  const changed = target !== action.target || indirect !== action.indirect;
  const out: ParsedAction = { ...action };
  if (target !== undefined) out.target = target;
  if (indirect !== undefined) out.indirect = indirect;
  // Resolved pronouns are IDs.
  return changed ? { ...out, byId: true } : out;
}

/** After the engine ran an action: keep its question, and what “it” and “her” now mean. */
export function remember(conv: Conversation, action: ParsedAction, result: EngineResult): void {
  conv.pending = result.ask ?? null;
  conv.lastAsked = Boolean(result.ask);
  if (result.understood === false) return;
  const acted = result.acted ?? {};
  const thing = acted.target ?? acted.indirect;
  if (thing) conv.it = thing;
  if (acted.npc) conv.him = acted.npc;
  if (!result.ask) conv.lastAction = action;
}
