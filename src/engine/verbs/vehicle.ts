import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { isWater, needObject, pickItem, visibleItems } from '../model';
import { miss, ok, type EngineResult } from '../result';

// Vehicles (Zork's VEHBIT): getting into one and out again.

/** BOARD: Zork's PRE-BOARD and V-BOARD. */
export function handleBoard(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const id = pickItem(action.target, visibleItems(world, state), world, 'target', state);
  if (!id) return miss(`You don’t see a “${action.target}” here.`);
  const item = world.items[id];
  if (!item.vehicle) return ok([`You have a theory on how to board a ${item.name}, perhaps?`]);
  if (state.aboard === id) return ok([`You are already in the ${item.name}!`]);
  if (state.locations[id] !== state.currentRoom) return ok([`The ${item.name} must be on the ground to be boarded.`]);
  state.aboard = id;
  return ok([`You are now in the ${item.name}.`], true);
}

/** DISEMBARK: Zork's V-DISEMBARK. */
export function handleDisembark(action: ParsedAction, world: World, state: GameState): EngineResult {
  const id = state.aboard;
  const named = action.target ? pickItem(action.target, visibleItems(world, state), world, 'target', state) : id;
  if (!id || named !== id) return ok(['You’re not in that!']);
  if (isWater(world, state)) return ok(['You realize that getting out here would be fatal.']);
  state.aboard = undefined;
  return ok(['You are on your own feet again.'], true);
}
