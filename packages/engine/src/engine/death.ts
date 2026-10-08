import type { GameState } from '../types/game.ts';
import type { World } from '../types/world.ts';
import { evaluateCondition } from './conditions.ts';
import { inventoryOf, isWater, moveItem } from './model.ts';
import { nextRandom } from './rng.ts';
import { runEventKey } from './effects.ts';

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
  // Zork's RANDOMIZE-OBJECTS: each treasure walks on from the last room tried to an unlit land room, at even odds.
  const roomIds = Object.keys(world.rooms);
  const unlit = (r: string) => Boolean(world.rooms[r].dark) && !isWater(world, state, r);
  // R stays where the last treasure landed, and is tested again first (two can share a room).
  let at = 0;
  const darkRoom = (): string | null => {
    if (!roomIds.some(unlit)) return null;
    for (;;) {
      if (unlit(roomIds[at]) && nextRandom(state) < 0.5) return roomIds[at];
      at = (at + 1) % roomIds.length;
    }
  };
  for (const id of inventoryOf(world, state)) {
    const home = world.items[id]?.home;
    const treasure = (world.items[id]?.treasure ?? 0) > 0;
    const to = typeof d.treasures === 'object' && treasure && !(home && world.rooms[home]) ? d.treasures.to : null;
    const dark = d.treasures === 'dark' && (world.items[id]?.treasure ?? 0) > 0 && !(home && world.rooms[home]) ? darkRoom() : null;
    if (home && world.rooms[home]) moveItem(state, id, home);
    else if (to && (world.rooms[to] || world.items[to] || world.npcs[to])) moveItem(state, id, to);
    else if (dark) moveItem(state, id, dark);
    else if (scatter.length > 0) moveItem(state, id, scatter[Math.floor(nextRandom(state) * scatter.length)]);
    else moveItem(state, id, state.currentRoom);
  }
  state.fuses = Object.fromEntries(Object.entries(state.fuses ?? {}).filter(([k]) => d.keepTimers?.includes(k)));
  lines.push(...(variant?.resurrection ?? d.resurrection ?? []));
  if (variant?.before) lines.push(...runEventKey(variant.before, world, state));
  if (respawn && world.rooms[respawn]) lines.push(...goTo(respawn, world, state));
  if (then) lines.push(...runEventKey(then, world, state));
  return lines;
}
