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
  if (!item.vehicle) {
    const theory = `You have a theory on how to board a ${item.name}, perhaps?`;
    // Outside Infocom style a miss, so “get in bed” can go to the intent server.
    return world.style === 'infocom' ? ok([theory]) : miss(theory);
  }
  if (state.aboard === id) return ok([`You are already in the ${item.name}!`]);
  if (state.locations[id] !== state.currentRoom) return ok([`The ${item.name} must be on the ground to be boarded.`]);
  // PRE-BOARD: one vehicle at a time.
  if (state.aboard) return ok([`You are already in the ${world.items[state.aboard]?.name ?? state.aboard}!`]);
  state.aboard = id;
  return ok([`You are now in the ${item.name}.`], true);
}

/** DISEMBARK: Zork's V-DISEMBARK. */
export function handleDisembark(action: ParsedAction, world: World, state: GameState): EngineResult {
  const id = state.aboard;
  // With no object, Infocom's parser picks the one vehicle in sight and says so: “(magic boat)”.
  const vehicles = visibleItems(world, state).filter((v) => world.items[v]?.vehicle);
  const guessed = !action.target && !action.via && world.style === 'infocom' ? (id ?? (vehicles.length === 1 ? vehicles[0] : undefined)) : undefined;
  const note = guessed ? [`(${world.items[guessed].name})`] : [];
  // The vehicle you're in is always in reach, dark or not.
  const scope = id && !visibleItems(world, state).includes(id) ? [...visibleItems(world, state), id] : visibleItems(world, state);
  const named = action.target ? pickItem(action.target, scope, world, 'target', state) : id;
  // V-STAND on foot.
  if (!id && action.via === 'stand' && world.style === 'infocom') return ok(['You are already standing, I think.']);
  // Infocom answers as Zork does; elsewhere it's a miss, so “get out of bed” can go to the intent server.
  if (!id || named !== id) return world.style === 'infocom' ? ok([...note, 'You’re not in that!']) : miss('You’re not in that!');
  if (isWater(world, state)) return ok([...note, 'You realize that getting out here would be fatal.']);
  state.aboard = undefined;
  return ok([...note, 'You are on your own feet again.'], true);
}
