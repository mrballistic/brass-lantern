import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { combatText, heroBlow } from '../combat';
import { inventoryOf, isCarried, matchNpc, moveItem, needObject, pickItem, visibleItems } from '../model';
import { miss, ok, type EngineResult } from '../result';
import { withRules } from '../rules';

/**
 * ATTACK, KILL, FIGHT, STAB. At a character it's combat; at anything else,
 * a world without combat treats it as SMASH (Office Space's printer), and a
 * world with combat answers as Zork does.
 */
export function handleAttack(action: ParsedAction, world: World, state: GameState, smash: () => EngineResult): EngineResult {
  if (!action.target) needObject();
  const npc = matchNpc(action.target, world, state);
  if (!npc) {
    if (!world.combat) return smash();
    const thing = pickItem(action.target, visibleItems(world, state), world, 'target', state);
    if (!thing) return miss(`You don’t see a “${action.target}” here.`);
    return ok([combatText(world, 'notPerson', { defender: world.items[thing].name })]);
  }
  return withRules('attack', action, world, state, () => attackNpc(npc, action.indirect, world, state));
}

function attackNpc(npc: string, indirect: string | undefined, world: World, state: GameState): EngineResult {
  const defender = world.npcs[npc].name;
  if (!indirect) return ok([combatText(world, 'bareHands', { defender })]);
  const weapon = pickItem(indirect, visibleItems(world, state), world, 'indirect', state);
  if (!weapon) return miss(`You don’t see a “${indirect}” here.`);
  const fields = { defender, weapon: world.items[weapon].name };
  if (!isCarried(state, weapon)) return ok([combatText(world, 'notHolding', fields)]);
  if (!world.items[weapon].weapon) return ok([combatText(world, 'notWeapon', fields)]);
  if (!world.npcs[npc].combat) return ok([combatText(world, 'notCombatant', { defender })]);
  return ok(heroBlow(world, state, npc, weapon), true);
}

/** THROW X [AT Y]: a rule on Y or X decides; otherwise it lands on the floor. */
export function handleThrow(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const id = pickItem(action.target, inventoryOf(world, state), world, 'target', state);
  if (!id) return miss(`You aren’t carrying a “${action.target}”.`);
  return withRules('throw', action, world, state, () => {
    moveItem(state, id, state.currentRoom);
    (state.itemState[id] ??= {}).moved = true;
    return ok(['Thrown.'], true);
  });
}
