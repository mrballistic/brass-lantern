import type { GameState, ParsedAction } from '../../types/game.ts';
import type { World } from '../../types/world.ts';
import { npcthe } from '../describe.ts';
import { pickThing, visibleItems } from '../model.ts';
import { miss, ok, type EngineResult } from '../result.ts';

/** FOLLOW: with no rule of the world's, a character points at the order form and a thing can't be followed. */
export function handleFollow(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) return ok(['What do you want to follow?']);
  const found = pickThing(action.target, visibleItems(world, state), world, state, { prefer: 'people' });
  if (found?.npc) return ok([`You’d rather ${npcthe(world, found.npc)} came to you. Try ${world.npcs[found.npc].name.toUpperCase()}, FOLLOW ME.`]);
  if (found?.item) return ok(['You can’t follow that.']);
  return miss(`You see no “${action.target}” here to follow.`);
}
