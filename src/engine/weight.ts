import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { childrenOf, inventoryOf, isInside } from './model';
import { prob } from './rng';

// Carrying weight, for worlds that set `carry` (Zork's SIZE and LOAD-ALLOWED).

const DEFAULT_SIZE = 5;

/** An item's size plus the weight of everything inside or on it. */
export function weightOf(world: World, state: GameState, id: string): number {
  const own = world.items[id]?.size ?? DEFAULT_SIZE;
  return own + childrenOf(world, state, id).reduce((sum, k) => sum + weightOf(world, state, k), 0);
}

/** Being worn: its WEAR has happened (the `onWear` event has fired). */
function isWorn(world: World, state: GameState, id: string): boolean {
  const wear = world.items[id]?.onWear;
  return Boolean(wear && state.firedEvents.includes(wear));
}

/** What the player carries weighs; a worn thing counts 1 (Zork's WEIGHT). */
export function carriedWeight(world: World, state: GameState): number {
  return inventoryOf(world, state).reduce((sum, id) => sum + (isWorn(world, state, id) ? 1 : weightOf(world, state, id)), world.carry?.self ?? 0);
}

/** How many things the player holds, for the fumble: worn things don't count (Zork's CCOUNT). */
export function carriedCount(world: World, state: GameState): number {
  return inventoryOf(world, state).filter((id) => !isWorn(world, state, id)).length;
}

/** What the player can carry now: the world's limit, lowered by wounds. */
export function loadLimit(world: World, state: GameState): number {
  return state.player?.load ?? world.carry?.limit ?? Infinity;
}

/** Why the player can't take this, or null. A fumble draws from the seed. */
export function takeRefusal(world: World, state: GameState, id: string): string | null {
  const carry = world.carry;
  if (!carry) return null;
  const infocom = world.style === 'infocom';
  const inHand = inventoryOf(world, state).some((c) => isInside(state, id, c));
  if (!inHand && carriedWeight(world, state) + weightOf(world, state, id) > loadLimit(world, state)) {
    if (!infocom) return carry.tooHeavy ?? '[That’s too heavy to carry with everything else.]';
    if (loadLimit(world, state) < carry.limit) return carry.tooHeavyHurt ?? 'Your load is too heavy, especially in light of your condition.';
    return carry.tooHeavy ?? 'Your load is too heavy.';
  }
  const count = carriedCount(world, state);
  if (carry.fumble && count > carry.fumble.over && prob(state, count * carry.fumble.chance)) {
    return carry.fumbled ?? (infocom ? 'You’re holding too many things already!' : '[You’re carrying too many things.]');
  }
  return null;
}
