import type { GameState, ParsedAction } from '@/types/game';
import type { Item, Room, Rule, World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { inventoryOf, matchItem, reachableItems, visibleItems } from './model';
import { runEventKey, turnHalted } from './effects';
import { ok, type EngineResult } from './result';

/* Events and rules */

/** Emit an event's lines, apply its effects, and record that it fired. */
export function runEvent(key: string, world: World, state: GameState): string[] {
  return runEventKey(key, world, state);
}

/** First applicable use rule on `itemId`, given what else is in reach. */
/** An owner's rules for a verb, with the older hooks folded in: onUse is instead.use, onTake is after.take. */
export function rulesFor(owner: Item | Room | undefined, phase: 'instead' | 'after', verb: string): Rule[] {
  if (!owner) return [];
  const own = owner[phase]?.[verb] ?? [];
  const item = owner as Item;
  if (phase === 'instead' && verb === 'use' && item.onUse) return [...own, ...item.onUse];
  if (phase === 'after' && verb === 'take' && item.onTake) return [...own, { then: item.onTake }];
  return own;
}

function ruleApplies(rule: Rule, other: string | null | undefined, reach: string[], world: World, state: GameState): boolean {
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
}

/** The target item's rules, then the indirect item's, then the room's. The first that applies wins. */
export function findRule(
  world: World,
  state: GameState,
  phase: 'instead' | 'after',
  verb: string,
  ids: RuleIds,
  reach: string[],
): Rule | null {
  const owners: Array<[Item | Room | undefined, string | null | undefined]> = [
    [ids.target ? world.items[ids.target] : undefined, ids.indirect],
    [ids.indirect ? world.items[ids.indirect] : undefined, ids.target],
    [world.rooms[ids.room], ids.indirect ?? ids.target],
  ];
  for (const [owner, other] of owners) {
    for (const rule of rulesFor(owner, phase, verb)) {
      if (ruleApplies(rule, other, reach, world, state)) return rule;
    }
  }
  return null;
}

export function applyRule(rule: Rule, world: World, state: GameState): EngineResult {
  const lines: string[] = [];
  if (rule.then) lines.push(...runEvent(rule.then, world, state));
  if (rule.say && !turnHalted(state)) lines.push(...rule.say);
  return ok(lines, Boolean(rule.then));
}

/** The items each built-in verb picks its target from. */
function targetScope(verb: string, world: World, state: GameState): string[] {
  switch (verb) {
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
  const reach = reachableItems(world, state);
  // Resolve the target the way the verb's handler will, so the rules that fire
  // belong to the item the verb actually acts on.
  const target = action.target ? matchItem(action.target, targetScope(verb, world, state), world) : null;
  const indirect = action.indirect ? matchItem(action.indirect, visibleItems(world, state), world) : null;
  const ids = { target, indirect, room: state.currentRoom };
  const instead = findRule(world, state, 'instead', verb, ids, reach);
  if (instead) return applyRule(instead, world, state);
  const result = run();
  if (result.understood === false || !result.mutated) return result;
  const after = findRule(world, state, 'after', verb, ids, reachableItems(world, state));
  // onTake (folded into after.take) has always fired only once.
  if (!after || (verb === 'take' && after.then && state.firedEvents.includes(after.then))) return result;
  const extra = applyRule(after, world, state);
  return { ...result, lines: [...result.lines, ...extra.lines] };
}
