import type { GameState } from '../types/game.ts';
import type { World } from '../types/world.ts';
import { theName } from './ask.ts';
import type { EngineResult } from './result.ts';

/**
 * The world's line for a misspelling it matched anyway: the first thing this turn reached by typo that
 * hasn't been teased yet gets the next of `world.typoReplies`, ahead of the command's own lines.
 * Call only for a turn the engine acted on (not a miss or a question).
 */
export function typoReply(result: EngineResult, typos: Array<{ id: string; typed: string }>, world: World, state: GameState): EngineResult {
  const replies = world.typoReplies;
  if (!replies || replies.length === 0) return result;
  const mocked = state.typoMocked ?? [];
  const fresh = typos.find((t) => !mocked.includes(t.id));
  if (!fresh) return result;
  const line = replies[mocked.length % replies.length].replaceAll('{typed}', fresh.typed).replaceAll('{name}', theName(world, fresh.id));
  state.typoMocked = [...mocked, fresh.id];
  return { ...result, lines: [line, ...result.lines], mutated: true };
}
