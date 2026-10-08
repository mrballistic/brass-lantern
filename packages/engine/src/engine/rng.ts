import type { GameState } from '../types/game.ts';
import type { World } from '../types/world.ts';

/** Zork's <RANDOM n>: 1 to n. */
export function roll(state: GameState, n: number): number {
  return 1 + Math.floor(nextRandom(state) * n);
}

/** Zork's <PROB n>: true when n > <RANDOM 100>. */
export function prob(state: GameState, n: number): boolean {
  return n > roll(state, 100);
}

/**
 * A small seeded generator (mulberry32). The seed lives in the game state, so a
 * save, a retry or a test replays the same draws. Only effects draw from it.
 */
export function nextRandom(state: GameState): number {
  let t = ((state.rng ?? 1) + 0x6d2b79f5) >>> 0;
  state.rng = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The seed for a new game: the world's, or the clock's. */
export function seedFor(world: World): number {
  return (world.seed ?? Date.now()) >>> 0;
}
