import type { GameState } from '@/types/game';
import type { UseRule, World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { ok, type EngineResult } from './result';

/* Events and rules */

/** Apply structural mutations indicated by an event script's bracketed system lines. */
export function applyEventEffects(eventKey: string, world: World, state: GameState): void {
  const lines = world.events[eventKey] ?? [];
  for (const line of lines) {
    if (!line.startsWith('[')) continue;

    const flagSet = line.match(/^\[Flag set:\s*(.+?)\]$/i);
    if (flagSet) {
      const flagId = world.flagLabels[flagSet[1].toLowerCase().trim()];
      if (flagId) state.flags[flagId] = true;
    }

    const added = line.match(/^\[Added to inventory:\s*(.+?)\]$/i);
    if (added) {
      const itemId = itemIdForName(added[1], world);
      if (itemId && !state.inventory.includes(itemId)) state.inventory.push(itemId);
    }

    const consumed = line.match(/^\[(.+?) consumed\]$/i);
    if (consumed) {
      const itemId = itemIdForName(consumed[1], world);
      if (itemId) state.inventory = state.inventory.filter((i) => i !== itemId);
    }
  }
}

export function itemIdForName(label: string, world: World): string | null {
  const normalized = label.trim().toLowerCase();
  for (const [id, item] of Object.entries(world.items)) {
    if (item.name.toLowerCase() === normalized) return id;
  }
  return null;
}

/** Emit an event's lines, apply its effects, and record that it fired. */
export function runEvent(key: string, world: World, state: GameState): string[] {
  applyEventEffects(key, world, state);
  if (!state.firedEvents.includes(key)) state.firedEvents.push(key);
  return [...(world.events[key] ?? [])];
}

/** First applicable use rule on `itemId`, given what else is in reach. */
export function findUseRule(
  itemId: string,
  other: string | null,
  reach: string[],
  state: GameState,
  world: World,
): UseRule | null {
  for (const rule of world.items[itemId]?.onUse ?? []) {
    if (rule.with) {
      if (!reach.includes(rule.with)) continue;
      if (other && other !== rule.with) continue;
    }
    if (rule.if && !evaluateCondition(rule.if, state)) continue;
    return rule;
  }
  return null;
}

export function applyUseRule(rule: UseRule, world: World, state: GameState): EngineResult {
  const lines: string[] = [];
  if (rule.then) lines.push(...runEvent(rule.then, world, state));
  if (rule.say) lines.push(...rule.say);
  return ok(lines, Boolean(rule.then));
}
