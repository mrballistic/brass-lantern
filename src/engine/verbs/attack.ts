import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { combatText, heroBlow } from '../combat';
import { inventoryOf, isCarried, matchNpc, moveItem, needObject, pickItem, visibleItems } from '../model';
import { miss, ok, type EngineResult } from '../result';
import { withRules } from '../rules';
import { setCommand } from '../scripts';

/**
 * ATTACK, KILL, FIGHT, STAB. At a character it's combat; at anything else,
 * a world without combat treats it as SMASH (Office Space's printer), and a
 * world with combat answers as Zork does.
 */
export function handleAttack(action: ParsedAction, world: World, state: GameState, smash: () => EngineResult): EngineResult {
  if (!action.target) needObject();
  // A world without combat keeps ATTACK as SMASH, people included (Office Space).
  if (!world.combat) return smash();
  const npc = matchNpc(action.target, world, state);
  if (!npc) {
    const thing = pickItem(action.target, visibleItems(world, state), world, 'target', state);
    if (!thing) return miss(`You don’t see a “${action.target}” here.`);
    // Its own attack rule answers first; otherwise Zork's refusal.
    return withRules('attack', action, world, state, () => ok([combatText(world, 'notPerson', { defender: world.items[thing].name })]));
  }
  return withRules('attack', action, world, state, () => attackNpc(npc, action.indirect, world, state));
}

function attackNpc(npc: string, indirect: string | undefined, world: World, state: GameState): EngineResult {
  const defender = world.npcs[npc].name;
  const infocom = world.style === 'infocom';
  if (!world.npcs[npc].combat) return ok([combatText(world, 'notCombatant', { defender })]);
  if (!indirect) {
    if (!infocom) return ok([combatText(world, 'bareHands', { defender })]);
    // Zork's parser: the one weapon you hold, “(with the sword)”, or ask which.
    const held = inventoryOf(world, state).filter((id) => world.items[id]?.weapon);
    if (held.length !== 1) needObject('indirect');
    // Zork's GWIM sets PRSI: the guessed weapon is the command's, for the defender's fears too.
    setCommand(state, { verb: 'attack', target: npc, indirect: held[0] });
    const result = attackNpc(npc, held[0], world, state);
    return { ...result, lines: [`(with the ${world.items[held[0]].name})`, ...result.lines] };
  }
  if (/^(?:my\s+|bare\s+)?hands?$/i.test(indirect)) return ok([combatText(world, 'bareHands', { defender })]);
  const weapon = pickItem(indirect, visibleItems(world, state), world, 'indirect', state);
  if (!weapon) return miss(`You don’t see a “${indirect}” here.`);
  const fields = { defender, weapon: world.items[weapon].name };
  if (!isCarried(state, weapon)) {
    // Zork's parser refuses before the verb runs, so no time passes.
    if (infocom) return { ...ok([`You don’t have the ${fields.weapon}.`]), free: true };
    return ok([combatText(world, 'notHolding', fields)]);
  }
  if (!world.items[weapon].weapon) return ok([combatText(world, 'notWeapon', fields)]);
  return ok(heroBlow(world, state, npc, weapon), true);
}

/** THROW X [AT Y]: a rule on Y or X decides; otherwise it lands on the floor. */
export function handleThrow(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const id = pickItem(action.target, inventoryOf(world, state), world, 'target', state);
  if (!id) return miss(`You aren’t carrying a “${action.target}”.`);
  return withRules('throw', action, world, state, () => {
    // At a person with no rule for it: a miss, so the intent server can read it another way.
    if (action.indirect && matchNpc(action.indirect, world, state)) return miss(`The ${world.items[id].name} isn’t something you can throw at them.`);
    moveItem(state, id, state.currentRoom);
    (state.itemState[id] ??= {}).moved = true;
    return ok(['Thrown.'], true);
  });
}
