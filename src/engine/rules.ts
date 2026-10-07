import type { GameState, ParsedAction } from '@/types/game';
import type { Item, NPC, Room, Rule, World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { isSelfWord } from './fuzzy';
import { heldItems, inventoryOf, matchNpc, pickItem, pickSecond, PLAYER, reachableItems, restoreState, snapshotState, visibleItems } from './model';
import { setCommand } from './scripts';
import { runEventKey, turnHalted } from './effects';
import { miss, ok, type EngineResult } from './result';

/* Events and rules */

/** An owner's rules for a verb, with the older hooks folded in: onUse is instead.use, onTake is after.take. */
function rulesFor(owner: Item | Room | NPC | undefined, phase: 'instead' | 'after', verb: string): Rule[] {
  if (!owner) return [];
  const own = owner[phase]?.[verb] ?? [];
  const item = owner as Item;
  if (phase === 'instead' && verb === 'use' && item.onUse) return [...own, ...item.onUse];
  if (phase === 'after' && verb === 'take' && item.onTake) return [...own, { then: item.onTake }];
  return own;
}

function ruleApplies(rule: Rule, other: string | null | undefined, reach: string[], world: World, state: GameState, role?: 'target' | 'indirect' | 'vehicle', prep?: string): boolean {
  if (rule.as && role && rule.as !== role) return false;
  if (rule.prep && rule.prep !== prep) return false;
  if (rule.with) {
    if (!reach.includes(rule.with)) return false;
    if (other && other !== rule.with) return false;
  }
  return !rule.if || evaluateCondition(rule.if, state, world);
}

export interface RuleIds {
  target?: string | null;
  indirect?: string | null;
  room: string;
  /** Characters the command names, when they aren't items (THROW AXE AT TROLL). */
  npcs?: string[];
  /** The command's preposition (PUT … IN or ON). */
  prep?: string;
  /** In an order, the character carrying it out: phase `orders` reads its `orders` table alone. */
  actor?: string;
}

/**
 * The target item's rules, then the indirect item's, then the room's. The first that applies wins.
 * Phase `orders` asks only the ordered character's `orders` table (ids.actor).
 */
export function findRule(
  world: World,
  state: GameState,
  phase: 'instead' | 'after' | 'orders',
  verb: string,
  ids: RuleIds,
  reach: string[],
): Rule | null {
  if (phase === 'orders') {
    const rules = (ids.actor && world.npcs[ids.actor]?.orders?.[verb]) || [];
    return rules.find((rule) => ruleApplies(rule, ids.indirect ?? ids.target, reach, world, state, undefined, ids.prep)) ?? null;
  }
  type Role = 'target' | 'indirect' | 'vehicle' | undefined;
  const target: [Item | undefined, string | null | undefined, Role] = [ids.target ? world.items[ids.target] : undefined, ids.indirect, 'target'];
  const indirect: [Item | undefined, string | null | undefined, Role] = [ids.indirect ? world.items[ids.indirect] : undefined, ids.target, 'indirect'];
  // Zork's PERFORM asks the second object before the first (PRSI, then PRSO).
  const owners: Array<[Item | Room | NPC | undefined, string | null | undefined, Role]> = [
    ...(world.style === 'infocom' ? [indirect, target] : [target, indirect]),
    ...(ids.npcs ?? []).map((id): [NPC | undefined, string | null | undefined, Role] => [world.npcs[id], ids.target ?? ids.indirect, undefined]),
    // Aboard, the vehicle answers before the room (Zork's M-BEG goes to the vehicle);
  // its rules for itself as an object (`as`) don't answer for other things.
    ...(state.aboard ? [[world.items[state.aboard], ids.indirect ?? ids.target, 'vehicle'] as [Item | undefined, string | null | undefined, Role]] : []),
    [world.rooms[ids.room], ids.indirect ?? ids.target, undefined],
  ];
  for (const [owner, other, role] of owners) {
    for (const rule of rulesFor(owner, phase, verb)) {
      if (ruleApplies(rule, other, reach, world, state, role, ids.prep)) return rule;
    }
  }
  return null;
}

export function applyRule(rule: Rule, world: World, state: GameState): EngineResult {
  const lines: string[] = [];
  if (rule.then) lines.push(...runEventKey(rule.then, world, state));
  if (rule.say && !turnHalted(state)) lines.push(...rule.say);
  return ok(lines, Boolean(rule.then));
}

/** “With my hands”: no thing, but ATTACK understands it. */
export const BARE_HANDS = /^(?:my\s+|bare\s+)?hands?$/i;

/** The items each built-in verb picks its target from. */
function targetScope(verb: string, world: World, state: GameState): string[] {
  if (world.verbs?.[verb]?.held) return heldItems(world, state);
  switch (verb) {
    // A direction isn't a thing: GO's rules never resolve it as an item.
    case 'go':
      return [];
    case 'drop':
    case 'put':
    case 'give':
    case 'wear':
      return inventoryOf(world, state);
    case 'take': {
      const carried = inventoryOf(world, state);
      return visibleItems(world, state).filter((id) => !carried.includes(id));
    }
    case 'turn_on':
    case 'turn_off':
    case 'smash':
      return reachableItems(world, state);
    default:
      return visibleItems(world, state);
  }
}

/**
 * Runs a built-in verb with the world's rules around it: an applicable
 * `instead` rule replaces the default; `after` rules follow a default that
 * succeeded and changed something. Rules only fire when their conditions
 * hold, so a miss still changes nothing.
 */
export function withRules(
  verb: string,
  action: ParsedAction,
  world: World,
  state: GameState,
  run: () => EngineResult,
): EngineResult {
  // ME names the player: a second object that is always at hand.
  const reach = [...reachableItems(world, state), ...(action.number !== undefined ? ['number'] : []), ...([action.target, action.indirect].some((w) => w && isSelfWord(w)) ? [PLAYER] : [])];
  // A number typed where an object goes (TURN DIAL TO 4) is no thing: the literal 'number' stands for it.
  const typed = (word?: string) => action.number !== undefined && word === 'number';
  // Resolve the target the way the verb's handler will, so the rules that fire
  // belong to the item the verb actually acts on.
  const target = typed(action.target) ? 'number' : action.target && isSelfWord(action.target) ? PLAYER : action.target ? pickItem(action.target, targetScope(verb, world, state), world, 'target', state) : null;
  const indirect = typed(action.indirect) ? 'number' : action.indirect ? pickSecond(action.indirect, visibleItems(world, state), world, state) : null;
  // Words that aren't items may name characters, whose rules count too.
  const targetNpc = !target && action.target ? matchNpc(action.target, world, state) : null;
  const indirectNpc = !indirect && action.indirect ? matchNpc(action.indirect, world, state) : null;
  const npcs = [targetNpc, indirectNpc].filter((id): id is string => Boolean(id));
  // A second object that names nothing here (no thing, no character): a miss, before any rule
  // could fire as though no tool had been named (UNLOCK DOOR WITH XYZZY).
  // Bare hands are no thing, but the verbs that take them (ATTACK) understand them.
  if (action.indirect && !indirect && !indirectNpc && !BARE_HANDS.test(action.indirect)) return miss(`You don’t see a “${action.indirect}” here.`);
  const ids = { target, indirect, room: state.currentRoom, npcs, prep: action.prep };
  setCommand(state, {
    verb,
    target: target ?? targetNpc ?? undefined,
    indirect: indirect ?? indirectNpc ?? undefined,
    number: action.number,
    direction: action.direction,
    text: action.text,
    words: { target: action.target, indirect: action.indirect },
  });
  const instead = findRule(world, state, 'instead', verb, ids, reach);
  if (instead && !instead.continue) return applyRule(instead, world, state);
  // A `continue` rule runs first; if the default then misses or asks, the rule is undone too,
  // so a miss never changes state (the intent server retries from where things stood).
  const saved = instead ? snapshotState(state) : null;
  const before = instead ? applyRule(instead, world, state) : null;
  let ran: EngineResult;
  try {
    ran = run();
  } catch (e) {
    if (saved) restoreState(state, saved);
    throw e;
  }
  if (saved && ran.understood === false) {
    restoreState(state, saved);
    return ran;
  }
  const result = before ? { ...ran, lines: [...before.lines, ...ran.lines], mutated: ran.mutated || before.mutated } : ran;
  if (result.understood === false || !result.mutated) return result;
  const extra = afterRuleLines(verb, ids, world, state);
  return extra.length > 0 ? { ...result, lines: [...result.lines, ...extra] } : result;
}

/**
 * The lines of the `after` rule that follows a verb's success, run. onTake
 * (folded into after.take) has always fired only once, however the take came
 * about (TAKE, or READ's automatic take).
 */
export function afterRuleLines(verb: string, ids: RuleIds, world: World, state: GameState): string[] {
  const after = findRule(world, state, 'after', verb, ids, reachableItems(world, state));
  if (!after || (verb === 'take' && after.then && state.firedEvents.includes(after.then))) return [];
  return applyRule(after, world, state).lines;
}
