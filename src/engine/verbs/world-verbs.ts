import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { heldItems, matchNpc, needObject, pickItem, reachableItems } from '../model';
import { setCommand } from '../scripts';
import { miss, ok, type EngineResult } from '../result';
import { applyRule, findRule } from '../rules';
import { handleGo } from './movement';
import { withArticle } from '../describe';


/** A verb the world declared. Null if the world has no such verb. */
export function handleWorldVerb(action: ParsedAction, world: World, state: GameState): EngineResult | null {
  const verb = world.verbs?.[action.action];
  if (!verb) return null;
  if (verb.go) return handleGo(action.target ?? action.action, world, state);
  const reach = reachableItems(world, state);
  const scope = verb.held ? heldItems(world, state) : reach;
  const target = action.target ? pickItem(action.target, scope, world, 'target', state) : null;
  // A word that isn't a thing here may be a person here (CONSULT MADAME).
  const person = action.target && !target ? matchNpc(action.target, world, state) : null;
  if (action.target && !target && !person) return miss(`You don’t see a “${action.target}” here.`);
  if (verb.target === 'required' && !target && !person) needObject();
  const indirect = action.indirect ? pickItem(action.indirect, reach, world, 'indirect', state) : null;
  if (action.indirect && !indirect) return miss(`You don’t see a “${action.indirect}” here.`);
  const room = state.currentRoom;
  const npcs = person ? [person] : [];
  setCommand(state, { verb: action.action, target: target ?? person ?? undefined, indirect: indirect ?? undefined });
  let rule = findRule(world, state, 'instead', action.action, { target, indirect, room, npcs }, reach);
  // A verb with no target looks for a rule on anything in reach (SNOOZE finds the alarm clock).
  if (!rule && !target && !person) {
    for (const id of reach) {
      rule = findRule(world, state, 'instead', action.action, { target: id, indirect: null, room }, reach);
      if (rule) break;
    }
  }
  if (rule) return applyRule(rule, world, state);
  // `{a target}` names the object with its article, `{target}` without (Zork's V-SMELL: “It smells like a bat.”).
  const named = target ? world.items[target].name : person ? world.npcs[person].name : 'it';
  const reply = (verb.reply ?? 'Nothing happens.').replace('{a target}', target ? withArticle(world, target) : named).replace('{target}', named);
  // Aimed at a person who has no rule for it: a miss, so the intent server gets a turn.
  if (person) return miss(reply);
  return ok([reply]);
}
