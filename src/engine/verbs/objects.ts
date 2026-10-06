import type { GameState } from '@/types/game';
import type { Item, World } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { contentsLines, describeRoom, lightNote, npcDescription, withArticle } from '../describe';
import { closedAround, inventoryOf, isCarried, isOpen, matchItem, matchNpc, moveItem, needObject, pickItem, PLAYER, reachableItems, visibleItems } from '../model';
import { miss, ok, type EngineResult } from '../result';
import { applyRule, findRule, runEvent } from '../rules';
import { takeRefusal } from '../weight';
import { finishEnding } from '../endings';

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
    lines.push(world.style === 'infocom' ? `  ${capitalize(withArticle(world, id))}${lightNote(world, state, id)}` : `  - ${name}`);
    lines.push(...contentsLines(world, state, id, 2));
  }
  return ok(lines);
}

export const ALL = /^(?:all|everything|it all)$/i;

export function handleTake(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) needObject();
  const carried = inventoryOf(world, state);
  const itemId = pickItem(target, visibleItems(world, state).filter((id) => !carried.includes(id)), world, 'target', state);
  if (!itemId) {
    if (matchItem(target, carried, world)) return ok(['You already have that.']);
    return miss(`You don’t see a “${target}” here.`);
  }
  return takeItem(itemId, world, state);
}

/** Take an item the player can see: refusals first, so a refusal changes nothing. */
export function takeItem(itemId: string, world: World, state: GameState): EngineResult {
  const item = world.items[itemId];
  if (itemId === state.aboard) return ok(['You’re inside of it!']);
  if (!item.portable) return ok([item.refusal ?? `You can’t take the ${item.name}.`]);
  const closed = closedAround(world, state, itemId);
  if (closed) return ok([`The ${world.items[closed].name} is closed.`]);
  const refusal = takeRefusal(world, state, itemId);
  if (refusal) return ok([refusal]);

  moveItem(state, itemId, PLAYER);
  (state.itemState[itemId] ??= {}).moved = true;
  return ok([world.style === 'infocom' ? 'Taken.' : `Taken: ${item.name}.`], true);
}

export function handleDrop(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) needObject();
  const itemId = pickItem(target, inventoryOf(world, state), world, 'target', state);
  if (!itemId) {
    // Infocom's parser checks HAVE first: a thing in sight but not held (the boat you're in) is “You don't have”.
    const seen = world.style === 'infocom' ? pickItem(target, visibleItems(world, state), world, 'target', state) : undefined;
    if (seen) return { ...ok([`You don’t have the ${world.items[seen].name}.`]), free: true };
    return miss(`You aren’t carrying a “${target}”.`);
  }

  // Aboard, things land in the vehicle (IDROP).
  moveItem(state, itemId, state.aboard ?? state.currentRoom);

  return ok([world.style === 'infocom' ? 'Dropped.' : `Dropped: ${world.items[itemId]?.name ?? itemId}.`], true);
}

export function handleExamine(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) needObject();
  const matchedItem = pickItem(target, visibleItems(world, state), world, 'target', state);
  if (matchedItem) {
    const item = world.items[matchedItem];
    const contents = contentsLines(world, state, matchedItem);
    // No description of its own: a container shows what's in it, as Zork's EXAMINE does.
    if (item && !item.description) {
      // Zork's EXAMINE reads what's written on it.
      if (item.text && world.style === 'infocom') return ok([item.text]);
      // Zork's EXAMINE of a closed box: it says so, rather than calling it empty.
      if (world.style === 'infocom' && item.container && !item.container.transparent && !isOpen(world, state, matchedItem)) return ok([`The ${item.name} is closed.`]);
      if (contents.length > 0) return ok(contents);
      return ok([item.container ? `The ${item.name} is empty.` : `There’s nothing special about the ${item.name}.`]);
    }
    return ok([item?.description ?? 'It’s nondescript.', ...contents]);
  }

  const matchedNpc = matchNpc(target, world, state);
  if (matchedNpc) return ok([npcDescription(world, state, matchedNpc)]);

  return miss(`You see no “${target}” here worth examining.`);
}

export function handleUse(
  target: string | undefined,
  indirect: string | undefined,
  world: World,
  state: GameState,
): EngineResult {
  if (!target) needObject();
  const reach = reachableItems(world, state);
  const itemId = pickItem(target, reach, world, 'target', state);
  if (!itemId) return miss(`There is no “${target}” here to use.`);
  const otherId = indirect ? pickItem(indirect, reach, world, 'indirect', state) : null;
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
  if (!target) needObject();
  const itemId = pickItem(target, inventoryOf(world, state), world, 'target', state);
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
  const itemId = target ? pickItem(target, reach, world, 'target', state) : null;
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
  // The finale is an ending: its event, the epilogues that now hold, the score, the footer.
  const lines = runEvent(finale.event, world, state);
  for (const trigger of finale.epilogue) {
    if (evaluateCondition(trigger.if, state, world)) lines.push(...runEvent(trigger.then, world, state));
  }
  if (!state.firedEvents.includes(finale.footer)) state.firedEvents.push(finale.footer);
  return ok(finishEnding(lines, true, world.events[finale.footer] ?? [], world, state), true);
}

export function handleRead(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) needObject();
  const id = pickItem(target, visibleItems(world, state), world, 'target', state);
  if (!id) return miss(`You don’t see a “${target}” here.`);
  const item = world.items[id];
  const text = item.text ?? (item.description || `There’s nothing special about the ${item.name}.`);
  // Zork's READ takes the thing first (its syntax's TAKE flag).
  if (world.style === 'infocom' && item.portable && !isCarried(state, id)) {
    const took = takeItem(id, world, state);
    // A take that fails is silent: READ reads anyway (ITAKE-CHECK; READ's syntax has TAKE, not HAVE).
    if (!took.mutated) return ok([text]);
    return ok(['(Taken)', text], true);
  }
  return ok([text]);
}

export function handleSwitch(target: string | undefined, on: boolean, world: World, state: GameState): EngineResult {
  const word = on ? 'on' : 'off';
  if (!target) needObject();
  const id = pickItem(target, reachableItems(world, state), world, 'target', state);
  if (!id) return miss(`You don’t see a “${target}” here.`);
  const item = world.items[id];
  if (!item.switchable) return ok([`You can’t turn that ${word}.`]);
  if (Boolean(state.itemState[id]?.on) === on) return ok([`It’s already ${word}.`]);
  (state.itemState[id] ??= {}).on = on;
  return ok([`The ${item.name} is now ${word}.`], true);
}
