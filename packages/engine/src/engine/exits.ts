import type { GameState } from '../types/game.ts';
import type { Exit, World } from '../types/world.ts';
import { evaluateCondition } from './conditions.ts';
import { isOpen } from './model.ts';

/**
 * Why an exit can't be taken now, in the words the player hears: a denial that holds, a failing `if`, a closed
 * door, in that order. Null when it's passable. The one check the player, characters and `ctx.exits` share.
 */
export function exitRefusal(exit: string | Exit, world: World, state: GameState): string | null {
  if (typeof exit === 'string') return null;
  const refused = exit.denials?.find((d) => evaluateCondition(d.if, state, world));
  if (refused) return refused.text;
  if (exit.if && !evaluateCondition(exit.if, state, world)) return exit.denial ?? 'You can’t go that way.';
  if (exit.door && !isOpen(world, state, exit.door)) return `The ${world.items[exit.door]?.name ?? exit.door} is closed.`;
  return null;
}
