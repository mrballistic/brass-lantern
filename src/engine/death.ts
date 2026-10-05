import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { inventoryOf, moveItem } from './model';
import { nextRandom } from './rng';

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
  const lines = [cause, ...(d.message ?? [])];
  const vars = (state.vars ??= {});
  if (d.penalty) vars.score = (vars.score ?? 0) + d.penalty;
  const deaths = vars.deaths ?? 0;
  if (deaths >= (d.lives ?? 0)) {
    state.gameOver = true;
    return [...lines, ...(d.final ?? [])];
  }
  vars.deaths = deaths + 1;

  const scatter = (d.scatter ?? []).filter((r) => world.rooms[r]);
  for (const id of inventoryOf(world, state)) {
    const home = world.items[id]?.home;
    if (home && world.rooms[home]) moveItem(state, id, home);
    else if (scatter.length > 0) moveItem(state, id, scatter[Math.floor(nextRandom(state) * scatter.length)]);
    else moveItem(state, id, state.currentRoom);
  }
  state.fuses = {};
  lines.push(...(d.resurrection ?? []));
  if (d.respawn && world.rooms[d.respawn]) lines.push(...goTo(d.respawn, world, state));
  return lines;
}
