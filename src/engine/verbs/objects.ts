import type { GameState } from '@/types/game';
import type { Item, World } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { describeRoom } from '../describe';
import { matchItem, matchNpc, reachableItems, visibleItemsIn } from '../model';
import { miss, ok, type EngineResult } from '../result';
import { applyEventEffects, applyUseRule, findUseRule, runEvent } from '../rules';
import { scoreLines } from './meta';

export function handleLook(world: World, state: GameState): EngineResult {
  return ok(describeRoom(state.currentRoom, world, state));
}

export function handleInventory(world: World, state: GameState): EngineResult {
  if (state.inventory.length === 0) return ok(['Just the weight of corporate despair.']);
  const lines = ['You are carrying:'];
  for (const id of state.inventory) lines.push(`  - ${world.items[id]?.name ?? id}`);
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
    for (const id of portable) lines.push(...handleTake(id, world, state).lines);
    return ok(lines, true);
  }
  const itemId = matchItem(target, visibleIds, world);
  if (!itemId) {
    if (matchItem(target, state.inventory, world)) return ok(['You already have that.']);
    return miss(`You don’t see a “${target}” here.`);
  }
  const item = world.items[itemId];
  if (!item.portable) return ok([item.refusal ?? `You can’t take the ${item.name}.`]);

  state.inventory.push(itemId);
  const removed = state.itemsRemoved[state.currentRoom] ?? [];
  removed.push(itemId);
  state.itemsRemoved[state.currentRoom] = removed;

  const lines = [`Taken: ${item.name}.`];
  if (item.onTake && !state.firedEvents.includes(item.onTake)) {
    lines.push(...runEvent(item.onTake, world, state));
  }
  return ok(lines, true);
}

export function handleDrop(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Drop what?']);
  const itemId = matchItem(target, state.inventory, world);
  if (!itemId) return miss(`You aren’t carrying a “${target}”.`);

  state.inventory = state.inventory.filter((i) => i !== itemId);
  const added = state.itemsAdded[state.currentRoom] ?? [];
  added.push(itemId);
  state.itemsAdded[state.currentRoom] = added;
  const removed = state.itemsRemoved[state.currentRoom] ?? [];
  state.itemsRemoved[state.currentRoom] = removed.filter((i) => i !== itemId);

  return ok([`Dropped: ${world.items[itemId]?.name ?? itemId}.`], true);
}

export function handleExamine(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Examine what?']);
  const matchedItem = matchItem(target, reachableItems(world, state), world);
  if (matchedItem) return ok([world.items[matchedItem]?.description ?? 'It’s nondescript.']);

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
    findUseRule(itemId, otherId, reach, state, world) ??
    (otherId ? findUseRule(otherId, itemId, reach, state, world) : null);
  if (rule) return applyUseRule(rule, world, state);

  if (world.items[itemId]?.onWear && state.inventory.includes(itemId)) {
    return handleWear(target, world, state);
  }
  return miss('You can’t see how to use that here.');
}

export function handleWear(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Wear what?']);
  const itemId = matchItem(target, state.inventory, world);
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
    const armed = state.inventory.includes(finale.with);
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
    const removed = state.itemsRemoved[state.currentRoom] ?? [];
    if (!removed.includes(itemId)) removed.push(itemId);
    state.itemsRemoved[state.currentRoom] = removed;
    return ok(lines, true);
  }

  if (target && !itemId) {
    const wreck = smashedHere(world, state).find((id) =>
      matchItem(target, [id], world),
    );
    if (wreck) return ok([`The ${world.items[wreck].name} is already in pieces.`]);
    if (!PRONOUN.test(target)) return miss(`You don’t see a “${target}” worth smashing.`);
  }
  return ok(['Smashing things at work is, somehow, still frowned upon.']);
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
    if (evaluateCondition(trigger.if, state)) lines.push(...runEvent(trigger.then, world, state));
  }
  lines.push(...scoreLines(world, state));
  lines.push(...runEvent(finale.footer, world, state));
  state.gameOver = true;
  return ok(lines, true);
}

export function handleSnooze(world: World, state: GameState): EngineResult {
  const snoozable = visibleItemsIn(state.currentRoom, world, state)
    .map((id) => world.items[id])
    .find((item) => item?.onSnooze);
  if (!snoozable?.onSnooze) {
    const wreck = smashedHere(world, state).find((id) => world.items[id].onSnooze);
    if (wreck) {
      return ok([
        `The ${world.items[wreck].name} is in pieces. There is nothing left to snooze.`,
        'You will probably oversleep tomorrow. This feels, on balance, fine.',
      ]);
    }
    return ok(['There is nothing here to snooze.']);
  }
  // Snoozing is repeatable and changes nothing, so it isn't recorded as fired.
  applyEventEffects(snoozable.onSnooze, world, state);
  return ok([...(world.events[snoozable.onSnooze] ?? [])]);
}

export function handleInstall(target: string | undefined, world: World, state: GameState): EngineResult {
  // INSTALL is USE with a carried item. With no usable target, try whatever
  // the player is carrying that has a rule here.
  if (target) {
    const result = handleUse(target, undefined, world, state);
    if (result.understood !== false) return result;
  }
  const reach = reachableItems(world, state);
  for (const id of state.inventory) {
    const rule = findUseRule(id, null, reach, state, world);
    if (rule?.with) return applyUseRule(rule, world, state);
  }
  return miss('There is nothing here to install onto.');
}
