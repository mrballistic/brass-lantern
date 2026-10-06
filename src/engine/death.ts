import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { inventoryOf, moveItem } from './model';
import { nextRandom } from './rng';
import { runEventKey } from './effects';

type GoTo = (room: string, world: World, state: GameState) => string[];

/**
 * The `die` effect. Prints the cause and the world's death message, takes the
 * penalty, then either ends the game (out of lives, or no `death` block) or
 * resurrects: carried things go home or scatter, timers stop, and the player
 * wakes at `respawn`.
 */
export function die(cause: string, world: World, state: GameState, goTo: GoTo): string[] {
  const d = world.death;
  if (!d) {
    state.gameOver = true;
    return [cause];
  }
  const holds = (condition: string) => evaluateCondition(condition, state, world);
  const instead = d.instead?.find((x) => holds(x.if));
  if (instead) {
    state.gameOver = true;
    return [...instead.lines];
  }
  // Death takes you out of any vehicle; it stays where you died.
  state.aboard = undefined;
  const lines = [cause, ...(d.message ?? []).flatMap((m) => (typeof m === 'string' ? [m] : holds(m.if) ? [m.text] : []))];
  // Decided at the moment of death, before anything moves.
  const variant = d.variants?.find((v) => holds(v.if));
  const respawn = variant?.respawn ?? d.respawn;
  const then = variant?.then ?? d.then;
  const vars = (state.vars ??= {});
  if (d.penalty) vars.score = (vars.score ?? 0) + d.penalty;
  const deaths = vars.deaths ?? 0;
  if (deaths >= (d.lives ?? 0)) {
    state.gameOver = true;
    return [...lines, ...(d.final ?? [])];
  }
  vars.deaths = deaths + 1;
  // A fresh start: no wounds, and nobody still fighting.
  state.player = undefined;
  for (const s of Object.values(state.npcs ?? {})) {
    s.fighting = false;
    s.staggered = false;
  }

  const scatter = (d.scatter ?? []).filter((r) => world.rooms[r]);
  for (const id of inventoryOf(world, state)) {
    const home = world.items[id]?.home;
    if (home && world.rooms[home]) moveItem(state, id, home);
    else if (scatter.length > 0) moveItem(state, id, scatter[Math.floor(nextRandom(state) * scatter.length)]);
    else moveItem(state, id, state.currentRoom);
  }
  state.fuses = {};
  lines.push(...(variant?.resurrection ?? d.resurrection ?? []));
  if (variant?.before) lines.push(...runEventKey(variant.before, world, state));
  if (respawn && world.rooms[respawn]) lines.push(...goTo(respawn, world, state));
  if (then) lines.push(...runEventKey(then, world, state));
  return lines;
}
