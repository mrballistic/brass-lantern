import type { GameState, ParsedAction } from '../../types/game.ts';
import type { World } from '../../types/world.ts';
import { withArticle } from '../describe.ts';
import { runSteps } from '../effects.ts';
import { isCarried, isOn, matchNpc, moveItem, namesThing, needObject, pickItem, reachableItems, visibleItems } from '../model.ts';
import { miss, ok, zorkDefault, type EngineResult } from '../result.ts';
import { notHeld } from './objects.ts';
import { readsNumber } from '../parser.ts';

/** Is it burning: a flaming thing, switched on if it switches. */
function isFlaming(world: World, state: GameState, id: string): boolean {
  const item = world.items[id];
  return Boolean(item?.flaming) && (!item.switchable || isOn(state, id));
}

/** TURN X WITH Y, TURN X TO N and PLUG X WITH Y with no rule (Zork's V-TURN, V-PLUG): words that name nothing here miss. */
export function handleNoEffect(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const scope = visibleItems(world, state);
  // The command's number, unless something here is named by those digits (then it is that thing).
  const typed = (word?: string) => readsNumber(action, word) && !namesThing(word!, world, state);
  if (!typed(action.target) && !pickItem(action.target, scope, world, 'target', state) && !matchNpc(action.target, world, state)) return miss(`You don’t see a “${action.target}” here.`);
  if (action.indirect && !typed(action.indirect) && !pickItem(action.indirect, scope, world, 'indirect', state)) return miss(`You don’t see a “${action.indirect}” here.`);
  // TURN X TO N: Zork's line in Infocom style, a miss elsewhere (the intent server reads it). TURN X WITH Y
  // and PLUG X WITH Y were understood before 6a and still are, in every style.
  return action.action === 'turn' && typed(action.indirect) ? zorkDefault(world, 'This has no effect.') : ok(['This has no effect.']);
}

/** BURN X WITH Y (and LIGHT X WITH Y): Zork's PRE-BURN and V-BURN. */
export function handleBurn(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const infocom = world.style === 'infocom';
  const id = pickItem(action.target, visibleItems(world, state), world, 'target', state);
  // A character isn't a thing, but in Zork's order it still gets V-BURN's refusal.
  const person = !id && infocom ? matchNpc(action.target, world, state) : null;
  if (!id && !person) return miss(`You don’t see a “${action.target}” here.`);
  if (!action.indirect) needObject('indirect');
  // Zork's syntax wants the flame held: in sight but not held is “You don't have the torch.”
  if (infocom) {
    const refused = notHeld(action.indirect, world, state);
    if (refused) return refused;
  }
  const tool = pickItem(action.indirect, reachableItems(world, state), world, 'indirect', state);
  if (!tool) return miss(`You don’t have a “${action.indirect}”.`);
  // Zork's fixed “a”; elsewhere the right article.
  if (!isFlaming(world, state, tool)) return ok([`With ${infocom ? `a ${world.items[tool].name}` : withArticle(world, tool)}??!?`]);
  if (person) return ok([`You can’t burn a ${world.npcs[person].name}.`]);
  const name = world.items[id!].name;
  if (!world.items[id!].burnable) return ok([`You can’t burn a ${name}.`]);
  const held = isCarried(state, id!);
  moveItem(state, id!, null);
  if (held) return ok(runSteps([{ die: `The ${name} catches fire. Unfortunately, you were holding it at the time.` }], world, state), true);
  return ok([`The ${name} catches fire and is consumed.`], true);
}
