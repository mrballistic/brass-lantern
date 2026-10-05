import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { needObject, pickItem, reachableItems } from '../model';
import { miss, ok, type EngineResult } from '../result';
import { applyRule, findRule } from '../rules';
import { handleGo } from './movement';


/** A verb the world declared. Null if the world has no such verb. */
export function handleWorldVerb(action: ParsedAction, world: World, state: GameState): EngineResult | null {
  const verb = world.verbs?.[action.action];
  if (!verb) return null;
  if (verb.go) return handleGo(action.target ?? action.action, world, state);
  const reach = reachableItems(world, state);
  const target = action.target ? pickItem(action.target, reach, world, 'target', state) : null;
  if (action.target && !target) return miss(`You don’t see a “${action.target}” here.`);
  if (verb.target === 'required' && !target) needObject();
  const indirect = action.indirect ? pickItem(action.indirect, reach, world, 'indirect', state) : null;
  if (action.indirect && !indirect) return miss(`You don’t see a “${action.indirect}” here.`);
  const room = state.currentRoom;
  let rule = findRule(world, state, 'instead', action.action, { target, indirect, room }, reach);
  // A verb with no target looks for a rule on anything in reach (SNOOZE finds the alarm clock).
  if (!rule && !target) {
    for (const id of reach) {
      rule = findRule(world, state, 'instead', action.action, { target: id, indirect: null, room }, reach);
      if (rule) break;
    }
  }
  if (rule) return applyRule(rule, world, state);
  return ok([verb.reply ?? 'Nothing happens.']);
}
