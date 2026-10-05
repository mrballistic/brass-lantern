import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { fuzzyCandidates } from './fuzzy';
import { strictParse } from './parser';
import type { Ask, EngineResult } from './result';

/**
 * Everything that lives between commands: a question waiting for its answer,
 * what “it” and “her” mean, the last command (AGAIN), the last line nobody
 * understood (OOPS), and the undo history. A plain object the store holds;
 * none of it is saved.
 */
export interface Conversation {
  pending: Ask | null;
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
}

export function newConversation(): Conversation {
  return { pending: null, it: null, him: null, lastAction: null, lastAsked: false, lastUnknown: null, history: [] };
}

/** What to do with a line of input. */
export type Step =
  /** Run this action directly (an answer, AGAIN): never via the intent server. */
  | { run: ParsedAction; viaAnswer?: boolean }
  /** Print this; nothing runs. */
  | { reply: string[] }
  /** Treat as a fresh command: regex parser, engine, intent server. */
  | { parse: string };

function fill(action: ParsedAction, slot: Ask['slot'], value: string, byId: boolean): ParsedAction {
  const filled = { ...action, [slot]: value };
  return byId ? { ...filled, byId: true } : filled;
}

/** Turns a line into a step, answering a pending question if it is an answer. */
export function interpret(input: string, conv: Conversation, world: World, _state: GameState): Step {
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
