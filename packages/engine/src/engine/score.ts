import type { GameState } from '../types/game.ts';
import type { ScoreEntry, World } from '../types/world.ts';
import { evaluateCondition } from './conditions.ts';

/** The score SCORE reports: the `scoring` entries that hold, plus `vars.score`. */
export function currentScore(world: World, state: GameState): number {
  const earned = (s: ScoreEntry) => (s.flag ? Boolean(state.flags[s.flag]) : s.if ? evaluateCondition(s.if, state, world) : false);
  return (world.scoring ?? []).reduce((sum, s) => sum + (earned(s) ? s.points : 0), 0) + (state.vars?.score ?? 0);
}
