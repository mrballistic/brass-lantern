import type { GameState, ParsedAction } from '../../types/game';
import type { World, WorldVerb } from '../../types/world';
import { heldItems, matchNpc, namesPlayer, needObject, pickItem, PLAYER, reachableItems } from '../model';
import { setCommand } from '../scripts';
import { stopLine } from '../effects';
import { miss, ok, type EngineResult } from '../result';
import { applyRule, findRule } from '../rules';
import { handleGo } from './movement';
import { withArticle } from '../describe';
import { nextRandom } from '../rng';

/** Typed words (SAY, INCANT, ANSWER): never a miss for naming nothing, and the rest of the line is dropped. */
function handleTextVerb(action: ParsedAction, verb: WorldVerb, world: World, state: GameState): EngineResult {
  const room = state.currentRoom;
  const reach = reachableItems(world, state);
  setCommand(state, { verb: action.action, text: action.text });
  stopLine(state);
  let rule = findRule(world, state, 'instead', action.action, { target: null, indirect: null, room }, reach);
  for (const id of reach) {
    if (rule) break;
    rule = findRule(world, state, 'instead', action.action, { target: id, indirect: null, room }, reach);
  }
  if (rule) return applyRule(rule, world, state);
  const reply = Array.isArray(verb.reply) ? verb.reply[Math.floor(nextRandom(state) * verb.reply.length)] : verb.reply;
  return ok([reply ?? 'Nothing happens.']);
}

/** A verb the world declared. Null if the world has no such verb. */
export function handleWorldVerb(action: ParsedAction, world: World, state: GameState): EngineResult | null {
  const verb = world.verbs?.[action.action];
  if (!verb) return null;
  if (verb.go) return handleGo(action.target ?? action.action, world, state);
  if (verb.target === 'text') return handleTextVerb(action, verb, world, state);
  const reach = reachableItems(world, state);
  const scope = verb.held ? heldItems(world, state) : reach;
  // ME names the player, for the world's rules (target:player, with: player).
  const me = (word?: string) => word !== undefined && namesPlayer(word, world, state);
  const target = me(action.target) ? PLAYER : action.target ? pickItem(action.target, scope, world, 'target', state) : null;
  // A word that isn't a thing here may be a person here (CONSULT MADAME).
  const person = action.target && !target ? matchNpc(action.target, world, state) : null;
  if (action.target && !target && !person) return miss(`You don’t see a “${action.target}” here.`);
  if (verb.target === 'required' && !target && !person) needObject();
  const indirect = me(action.indirect) ? PLAYER : action.indirect ? pickItem(action.indirect, reach, world, 'indirect', state) : null;
  if (action.indirect && !indirect) return miss(`You don’t see a “${action.indirect}” here.`);
  const room = state.currentRoom;
  const npcs = person ? [person] : [];
  setCommand(state, { verb: action.action, target: target ?? person ?? undefined, indirect: indirect ?? undefined });
  const ruleReach = target === PLAYER || indirect === PLAYER ? [...reach, PLAYER] : reach;
  let rule = findRule(world, state, 'instead', action.action, { target, indirect, room, npcs }, ruleReach);
  // A verb with no target looks for a rule on anything in reach (SNOOZE finds the alarm clock).
  if (!rule && !target && !person) {
    for (const id of reach) {
      rule = findRule(world, state, 'instead', action.action, { target: id, indirect: null, room }, reach);
      if (rule) break;
    }
  }
  if (rule) return applyRule(rule, world, state);
  // ME with no rule for it: the word typed names nothing here, as it always did.
  if (target === PLAYER) return miss(`You don’t see a “${action.target}” here.`);
  if (indirect === PLAYER) return miss(`You don’t see a “${action.indirect}” here.`);
  // `{a target}` names the object with its article, `{target}` without (Zork's V-SMELL: “It smells like a bat.”).
  const named = target ? world.items[target].name : person ? world.npcs[person].name : 'it';
  // A list is a random pick (Zork's PICK-ONE for HACK-HACK and V-SKIP), from the seeded generator;
  // aimed at a person it's a miss, which must leave the seed as it was.
  const seed = state.rng;
  const chosen = Array.isArray(verb.reply) ? verb.reply[Math.floor(nextRandom(state) * verb.reply.length)] : verb.reply;
  const reply = (chosen ?? 'Nothing happens.').replace('{a target}', target ? withArticle(world, target) : named).replace('{target}', named);
  // Aimed at a person who has no rule for it: a miss, so the intent server gets a turn.
  if (person) {
    state.rng = seed;
    return miss(reply);
  }
  return ok([reply]);
}
