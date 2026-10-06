import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { runSteps } from '../effects';
import { isCarried, isOn, matchNpc, moveItem, needObject, pickItem, reachableItems, visibleItems } from '../model';
import { miss, ok, type EngineResult } from '../result';

/** Is it burning: a flaming thing, switched on if it switches. */
function isFlaming(world: World, state: GameState, id: string): boolean {
  const item = world.items[id];
  return Boolean(item?.flaming) && (!item.switchable || isOn(state, id));
}

/** TURN X WITH Y and PLUG X WITH Y with no rule (Zork's V-TURN, V-PLUG): words that name nothing here miss. */
export function handleNoEffect(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const scope = visibleItems(world, state);
  if (!pickItem(action.target, scope, world, 'target', state) && !matchNpc(action.target, world, state)) return miss(`You don’t see a “${action.target}” here.`);
  if (action.indirect && !pickItem(action.indirect, scope, world, 'indirect', state)) return miss(`You don’t see a “${action.indirect}” here.`);
  return ok(['This has no effect.']);
}

/** BURN X WITH Y (and LIGHT X WITH Y): Zork's PRE-BURN and V-BURN. */
export function handleBurn(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const id = pickItem(action.target, visibleItems(world, state), world, 'target', state);
  if (!id) return miss(`You don’t see a “${action.target}” here.`);
  if (!action.indirect) needObject('indirect');
  const tool = pickItem(action.indirect, reachableItems(world, state), world, 'indirect', state);
  if (!tool) return miss(`You don’t have a “${action.indirect}”.`);
  const name = world.items[id].name;
  if (!isFlaming(world, state, tool)) return ok([`With a ${world.items[tool].name}??!?`]);
  if (!world.items[id].burnable) return ok([`You can’t burn a ${name}.`]);
  const held = isCarried(state, id);
  moveItem(state, id, null);
  if (held) return ok(runSteps([{ die: `The ${name} catches fire. Unfortunately, you were holding it at the time.` }], world, state), true);
  return ok([`The ${name} catches fire and is consumed.`], true);
}
