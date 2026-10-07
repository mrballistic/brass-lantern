import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { interpret, newConversation, remember, resolvePronouns, type Conversation } from './conversation';
import { captureLine, execute, initialState, openingLines } from './engine';
import { fallbackParse, splitCommands } from './parser';
import type { EngineResult } from './result';

/** What one line of input produced. `question` is set when the game is waiting for an answer. */
export interface EngineReply {
  lines: string[];
  gameOver: boolean;
  question?: string;
}

/**
 * One command through the engine, minus the LLM: captures, questions, AGAIN, OOPS and pronouns.
 * The headless counterpart of the game store's per-command step.
 */
export function runTurn(world: World, state: GameState, conv: Conversation, c: string): { lines: string[]; captured: boolean } {
  const run = (action: ParsedAction): EngineResult => {
    const result = execute(action, { world, state });
    if (result.stopLine) conv.stopLine = result.stopLine;
    remember(conv, action, result);
    return result;
  };
  if (!conv.pending) {
    const captured = captureLine(world, state, c);
    if (captured) return { lines: captured.lines, captured: true };
  }
  const step = interpret(c, conv, world, state);
  if ('reply' in step) return { lines: step.reply, captured: false };
  if ('run' in step) return { lines: run(step.run).lines, captured: false };
  const parsed = fallbackParse(step.parse, world.verbs);
  const result = run(parsed ? resolvePronouns(parsed, conv) : { action: 'unknown' });
  conv.lastUnknown = result.understood === false ? step.parse : null;
  return { lines: [...(step.note ?? []), ...result.lines], captured: false };
}

/** A game with no browser and no LLM: feed it lines, read the replies. */
export function createGame(world: World, options: { seed?: number } = {}): {
  state: GameState;
  opening: string[];
  send(line: string): EngineReply;
} {
  const state = initialState(world);
  if (options.seed !== undefined) state.rng = options.seed;
  const opening = [...openingLines(world, state)];
  const conv = newConversation();

  function send(line: string): EngineReply {
    const pieces = splitCommands(line, world.verbs);
    const lines: string[] = [];
    for (const [i, command] of pieces.entries()) {
      // Once the game is over, one command hears that it has ended; the rest of the line is dropped.
      if (state.gameOver && i > 0) break;
      conv.stopLine = undefined;
      const turn = runTurn(world, state, conv, command);
      lines.push(...turn.lines);
      if (turn.captured) break;
      // The turn dropped the rest of the line (Zork's P-CONT): its message only if something was left.
      const stop = conv.stopLine;
      conv.stopLine = undefined;
      if (stop) {
        if (typeof stop === 'string' && i < pieces.length - 1) lines.push(stop);
        break;
      }
      // A question stops the line: the next one answers it.
      if (conv.pending) break;
    }
    const reply: EngineReply = { lines, gameOver: state.gameOver };
    if (conv.pending && lines.length) reply.question = lines[lines.length - 1];
    return reply;
  }

  return { state, opening, send };
}
