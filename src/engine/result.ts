import type { ParsedAction } from '@/types/game';

// What every handler returns.

export interface EngineResult {
  /** Lines to append to the output log. */
  lines: string[];
  /** Set true if the engine state changed (so the store should persist). */
  mutated: boolean;
  /**
   * False when the engine couldn't make sense of the command: an unknown
   * verb, or a target that matches nothing here. Misses never mutate state,
   * so the store can safely ask the LLM for a better reading and run that
   * instead.
   */
  understood?: boolean;
  /** A refused move (Zork's M-FATAL): the turn counts, but Infocom style skips the room's end routine. */
  fatal?: boolean;
  /** Takes no game time (VERBOSE): no turn, no daemons, no fuses. */
  free?: boolean;
  /** A question back to the player; the conversation layer takes the answer. */
  ask?: Ask;
  /** What the command acted on, for pronouns. */
  acted?: { target?: string; indirect?: string; npc?: string };
  /** SCRIPT / UNSCRIPT: the store starts or saves a transcript. */
  script?: 'start' | 'stop';
  /** VERSION: the store prints the app's version, then the world's title and credits. */
  version?: boolean;
}

/** A question: which of several things, or what object a verb needs. */
export type Ask =
  | { kind: 'which'; slot: 'target' | 'indirect'; word: string; candidates: string[]; action: ParsedAction }
  | { kind: 'what'; slot: 'target' | 'indirect'; action: ParsedAction };

export function ok(lines: string[], mutated = false): EngineResult {
  return { lines, mutated };
}

export function miss(line: string): EngineResult {
  return { lines: [line], mutated: false, understood: false };
}
