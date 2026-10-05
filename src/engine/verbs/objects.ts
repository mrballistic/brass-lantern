import type { GameState } from '@/types/game';
import type { Item, World } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { contentsLines, describeRoom, withArticle } from '../describe';
import {
  closedAround, inventoryOf, isCarried, matchItem, matchNpc, moveItem, PLAYER, reachableItems, visibleItems, visibleItemsIn,
} from '../model';
import { miss, ok, type EngineResult } from '../result';
import { applyRule, findRule, runEvent, withRules } from '../rules';
import { scoreLines } from './meta';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function handleLook(world: World, state: GameState): EngineResult {
  return ok(describeRoom(state.currentRoom, world, state));
}

export function handleInventory(world: World, state: GameState): EngineResult {
  const carried = inventoryOf(world, state);
  if (carried.length === 0) return ok([world.emptyInventory ?? 'You are empty-handed.']);
  const lines = ['You are carrying:'];
  for (const id of carried) {
    const name = world.items[id]?.name ?? id;
    lines.push(world.style === 'infocom' ? `  ${capitalize(withArticle(world, id))}` : `  - ${name}`);
    lines.push(...contentsLines(world, state, id, 2));
  }
  return ok(lines);
}

export const ALL = /^(?:all|everything|it all)$/i;

export function handleTake(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Take what?']);
  const visibleIds = visibleItemsIn(state.currentRoom, world, state);
  if (ALL.test(target)) {
    const portable = visibleIds.filter((id) => world.items[id]?.portable);
    if (portable.length === 0) return ok(['There is nothing here worth taking.']);
    const lines: string[] = [];
    for (const id of portable) {
      lines.push(...withRules('take', { action: 'take', target: id }, world, state, () => handleTake(id, world, state)).lines);
    }
    return ok(lines, true);
  }
  const carried = inventoryOf(world, state);
  const itemId = matchItem(target, visibleItems(world, state).filter((id) => !carried.includes(id)), world);
  if (!itemId) {
    if (matchItem(target, carried, world)) return ok(['You already have that.']);
    return miss(`You don’t see a “${target}” here.`);
  }
  return takeItem(itemId, world, state);
}

/** Take an item the player can see: refusals first, so a refusal changes nothing. */
export function takeItem(itemId: string, world: World, state: GameState): EngineResult {
  const item = world.items[itemId];
  if (!item.portable) return ok([item.refusal ?? `You can’t take the ${item.name}.`]);
  const closed = closedAround(world, state, itemId);
  if (closed) return ok([`The ${world.items[closed].name} is closed.`]);

  moveItem(state, itemId, PLAYER);
  (state.itemState[itemId] ??= {}).moved = true;
  return ok([world.style === 'infocom' ? 'Taken.' : `Taken: ${item.name}.`], true);
}

export function handleDrop(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Drop what?']);
  const itemId = matchItem(target, inventoryOf(world, state), world);
  if (!itemId) return miss(`You aren’t carrying a “${target}”.`);

  moveItem(state, itemId, state.currentRoom);

  return ok([world.style === 'infocom' ? 'Dropped.' : `Dropped: ${world.items[itemId]?.name ?? itemId}.`], true);
}

export function handleExamine(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Examine what?']);
  const matchedItem = matchItem(target, visibleItems(world, state), world);
  if (matchedItem) {
    return ok([world.items[matchedItem]?.description ?? 'It’s nondescript.', ...contentsLines(world, state, matchedItem)]);
  }

  const matchedNpc = matchNpc(target, world, state);
  if (matchedNpc) return ok([world.npcs[matchedNpc]?.description ?? 'They look back at you.']);

  return miss(`You see no “${target}” here worth examining.`);
}

export function handleUse(
  target: string | undefined,
  indirect: string | undefined,
  world: World,
  state: GameState,
): EngineResult {
  if (!target) return ok(['Use what?']);
  const reach = reachableItems(world, state);
  const itemId = matchItem(target, reach, world);
  if (!itemId) return miss(`There is no “${target}” here to use.`);
  const otherId = indirect ? matchItem(indirect, reach, world) : null;
  if (indirect && !otherId) return miss(`There is no “${indirect}” here.`);

  // "put the disk in the terminal" and "use the terminal with the disk" mean
  // the same thing, so check the rules on both sides.
  const rule =
    findRule(world, state, 'instead', 'use', { target: itemId, indirect: otherId, room: state.currentRoom }, reach);
  if (rule) return applyRule(rule, world, state);

  if (world.items[itemId]?.onWear && isCarried(state, itemId)) {
    return handleWear(target, world, state);
  }
  return miss('You can’t see how to use that here.');
}

export function handleWear(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Wear what?']);
  const itemId = matchItem(target, inventoryOf(world, state), world);
  if (!itemId) return miss(`You aren’t carrying a “${target}”.`);
  const item: Item = world.items[itemId];
  if (!item.onWear) return ok(['That is not really wearable.']);
  if (state.firedEvents.includes(item.onWear)) return ok([`You’re already wearing the ${item.name}.`]);
  return ok(runEvent(item.onWear, world, state), true);
}

export const PRONOUN = /^(?:it|that|this|them)$/i;

export function handleSmash(
  target: string | undefined,
  world: World,
  state: GameState,
): EngineResult {
  const finale = world.finale;
  const reach = reachableItems(world, state);
  const itemId = target ? matchItem(target, reach, world) : null;
  const item = itemId ? world.items[itemId] : null;

  if (finale && itemId === finale.item) {
    const armed = isCarried(state, finale.with);
    if (armed && state.currentRoom === finale.room) return runFinale(world, state);
    if (armed) return ok([finale.wrongRoom ?? 'Not here.']);
    if (finale.bareHanded) {
      if (state.firedEvents.includes(finale.bareHanded)) {
        return ok([finale.bareHandedAgain ?? 'That still won’t work.']);
      }
      return ok(runEvent(finale.bareHanded, world, state), true);
    }
  }

  // Destructible items with their own one-shot event (the alarm clock). The
  // item is removed from the room afterward.
  if (item?.onSmash && itemId) {
    if (state.firedEvents.includes(item.onSmash)) {
      return ok([`The ${item.name} is already in pieces.`]);
    }
    const lines = runEvent(item.onSmash, world, state);
    moveItem(state, itemId, null);
    return ok(lines, true);
  }

  if (target && !itemId) {
    const wreck = smashedHere(world, state).find((id) =>
      matchItem(target, [id], world),
    );
    if (wreck) return ok([`The ${world.items[wreck].name} is already in pieces.`]);
    if (!PRONOUN.test(target)) return miss(`You don’t see a “${target}” worth smashing.`);
  }
  return ok([world.smashRefusal ?? 'Violence isn’t the answer to this one.']);
}

/** Items that started in this room and have since been smashed. */
export function smashedHere(world: World, state: GameState): string[] {
  return (world.rooms[state.currentRoom]?.items ?? []).filter((id) => {
    const hook = world.items[id]?.onSmash;
    return hook !== undefined && state.firedEvents.includes(hook);
  });
}

export function runFinale(world: World, state: GameState): EngineResult {
  const finale = world.finale!;
  const lines = runEvent(finale.event, world, state);
  for (const trigger of finale.epilogue) {
    if (evaluateCondition(trigger.if, state, world)) lines.push(...runEvent(trigger.then, world, state));
  }
  lines.push(...scoreLines(world, state));
  lines.push(...runEvent(finale.footer, world, state));
  state.gameOver = true;
  return ok(lines, true);
}
