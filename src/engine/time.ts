import type { GameState } from '@/types/game';
import { cureTick, fightTurn } from './combat';
import type { World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { runConditional, runEventKey, scheduledThisTurn, turnHalted } from './effects';

/**
 * After every turn the engine acted on: fuses count down and fire, then
 * daemons run, then ambient lines. Never after a miss, so a miss still
 * changes nothing. `existing` holds the fuses pending before this turn, so a
 * fuse set during the turn starts counting next turn.
 */
const fired = new WeakSet<GameState>();

/** Did a timer go off in the last afterTurn (a cancelled one doesn't count)? Clears the mark. */
export function fuseFired(state: GameState): boolean {
  const did = fired.has(state);
  fired.delete(state);
  return did;
}

export function afterTurn(world: World, state: GameState, existing: Set<string>): string[] {
  // Zork's CLOCKER runs the newest interrupts first: healing (queued in
  // fights), then the timers and daemons, and the fight (queued first) last.
  const out: string[] = [];
  cureTick(world, state);
  for (const [key, left] of Object.entries(state.fuses ?? {})) {
    if (!existing.has(key) || scheduledThisTurn(state, key) || state.fuses?.[key] === undefined) continue;
    if (left <= 1) {
      delete state.fuses![key];
      fired.add(state);
      out.push(...runEventKey(key, world, state));
    } else {
      state.fuses![key] = left - 1;
    }
    if (state.gameOver || turnHalted(state)) return out;
  }
  out.push(...runConditional(world.daemons ?? [], world, state));
  if (state.gameOver || turnHalted(state)) return out;
  out.push(...fightTurn(world, state));
  if (state.gameOver || turnHalted(state)) return out;
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
