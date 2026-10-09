import type { GameState, ParsedAction } from '../../types/game.ts';
import type { World } from '../../types/world.ts';
import { npcthe } from '../describe.ts';
import { matchNpc, pickItem, visibleItems } from '../model.ts';
import { miss, ok, type EngineResult } from '../result.ts';

/** FOLLOW: with no rule of the world's, a character points at the order form and a thing can't be followed. */
export function handleFollow(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) return ok(['What do you want to follow?']);
  const npc = matchNpc(action.target, world, state);
  if (npc) return ok([`You’d rather ${npcthe(world, npc)} came to you. Try ${world.npcs[npc].name.toUpperCase()}, FOLLOW ME.`]);
  if (pickItem(action.target, visibleItems(world, state), world, 'target', state)) return ok(['You can’t follow that.']);
  return miss(`You see no “${action.target}” here to follow.`);
}
