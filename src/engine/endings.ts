import type { GameState } from '@/types/game';
import type { EventStep, World } from '@/types/world';
import { runSteps } from './effects';
import { scoreLines } from './verbs/meta';

/** Plays out an ending: its lines, the score if asked, the footer; then the game is over. */
export function finishEnding(lines: string[], score: boolean, footer: EventStep[], world: World, state: GameState): string[] {
  const out = [...lines];
  if (score) out.push(...scoreLines(world, state));
  out.push(...runSteps(footer, world, state));
  state.gameOver = true;
  return out;
}

/** The `end` effect: a named ending from `world.endings`. */
export function runEnding(id: string, world: World, state: GameState): string[] {
  const ending = world.endings?.[id];
  if (!ending) {
    state.gameOver = true;
    return [];
  }
  return finishEnding(runSteps(ending.lines, world, state), Boolean(ending.score), ending.footer ?? [], world, state);
}
