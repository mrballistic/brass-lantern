import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { runEventKey, runSteps, turnHalted } from './effects';

/**
 * After every turn the engine acted on: fuses count down and fire, then
 * daemons run, then ambient lines. Never after a miss, so a miss still
 * changes nothing. `existing` holds the fuses pending before this turn, so a
 * fuse set during the turn starts counting next turn.
 */
export function afterTurn(world: World, state: GameState, existing: Set<string>): string[] {
  const out: string[] = [];
  for (const [key, left] of Object.entries(state.fuses ?? {})) {
    if (!existing.has(key) || state.fuses?.[key] === undefined) continue;
    if (left <= 1) {
      delete state.fuses![key];
      out.push(...runEventKey(key, world, state));
    } else {
      state.fuses![key] = left - 1;
    }
    if (state.gameOver || turnHalted(state)) return out;
  }
  for (const d of world.daemons ?? []) {
    if (!evaluateCondition(d.if, state, world)) continue;
    out.push(...(typeof d.then === 'string' ? runEventKey(d.then, world, state) : runSteps(d.then, world, state)));
    if (state.gameOver || turnHalted(state)) return out;
  }
  out.push(...ambientLines(world, state));
  return out;
}

/** Every `every` turns while `if` holds, the next line in rotation (a ringing phone). */
function ambientLines(world: World, state: GameState): string[] {
  const turns = state.turns ?? 0;
  const out: string[] = [];
  for (const a of world.ambient ?? []) {
    if (a.every <= 0 || a.lines.length === 0) continue;
    if (turns % a.every !== 0 || !evaluateCondition(a.if, state, world)) continue;
    out.push(a.lines[(turns / a.every - 1) % a.lines.length]);
  }
  return out;
}
