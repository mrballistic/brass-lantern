import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { contentsLines, listPhrase } from '../describe';
import {
  canReachInside,
  closedAround,
  canSeeInside,
  childrenOf,
  shown,
  inventoryOf,
  isCarried,
  isInside,
  isLocked,
  isOpen,
  matchItem,
  moveItem,
  needObject,
  pickItem,
  reachableItems,
  visibleItems,
} from '../model';
import { miss, ok, type EngineResult } from '../result';
import { applyRule, findRule } from '../rules';
import { takeItem } from './objects';
import { weightOf } from '../weight';

// Every handler checks everything it needs before it changes anything, so a
// refusal is an understood reply that leaves the game as it was.

const name = (world: World, id: string) => world.items[id]?.name ?? id;

function find(target: string, world: World, state: GameState, slot: 'target' | 'indirect' = 'target'): string | null {
  return pickItem(target, visibleItems(world, state), world, slot, state);
}

/** “The glass jar is closed.” when one of these is visible but sealed away. */
function behindGlass(world: World, state: GameState, ...ids: Array<string | null>): EngineResult | null {
  for (const id of ids) {
    const closed = id ? closedAround(world, state, id) : null;
    if (closed) return ok([`The ${name(world, closed)} is closed.`]);
  }
  return null;
}

/** Worlds that modeled OPEN or PUT as USE keep working: fall back to the target's use rules. */
function useFallback(id: string, other: string | null, world: World, state: GameState): EngineResult | null {
  const reach = reachableItems(world, state);
  const rule = findRule(world, state, 'instead', 'use', { target: id, indirect: other, room: state.currentRoom }, reach);
  return rule ? applyRule(rule, world, state) : null;
}

export function handleOpen(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) needObject();
  const id = find(target, world, state);
  if (!id) return miss(`You don’t see a “${target}” here.`);
  const sealed = behindGlass(world, state, id);
  if (sealed) return sealed;
  const item = world.items[id];
  if (!item.container?.openable) return useFallback(id, null, world, state) ?? ok(['You can’t open that.']);
  if (isOpen(world, state, id)) return ok(['It’s already open.']);
  if (isLocked(world, state, id)) return ok([`The ${item.name} is locked.`]);
  (state.itemState[id] ??= {}).open = true;
  // Zork's V-OPEN touches a container (not a door): its first-seen sentence is over.
  if (world.style === 'infocom' && !item.door) state.itemState[id].moved = true;
  const inside = childrenOf(world, state, id).filter((k) => !world.items[k]?.scenery && shown(state)(k));
  if (item.container.opened) return ok([item.container.opened], true);
  if (item.door || inside.length === 0 || item.container.transparent) return ok(['Opened.'], true);
  // Zork's V-OPEN: one untouched thing with a first-seen sentence speaks for itself.
  const only = world.items[inside[0]];
  if (world.style === 'infocom' && inside.length === 1 && only?.initialDescription && !state.itemState[inside[0]]?.moved) {
    return ok([`The ${item.name} opens.`, only.initialDescription], true);
  }
  return ok([`Opening the ${item.name} reveals ${listPhrase(world, inside)}.`], true);
}

export function handleClose(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) needObject();
  const id = find(target, world, state);
  if (!id) return miss(`You don’t see a “${target}” here.`);
  const sealed = behindGlass(world, state, id);
  if (sealed) return sealed;
  if (!world.items[id].container?.openable) return ok(['You can’t close that.']);
  if (!isOpen(world, state, id)) return ok(['It’s already closed.']);
  (state.itemState[id] ??= {}).open = false;
  return ok([world.items[id].container?.closed ?? 'Closed.'], true);
}

function handleLockState(
  locking: boolean,
  target: string | undefined,
  indirect: string | undefined,
  world: World,
  state: GameState,
): EngineResult {
  const verb = locking ? 'lock' : 'unlock';
  if (!target) needObject();
  const id = find(target, world, state);
  if (!id) return miss(`You don’t see a “${target}” here.`);
  const sealed = behindGlass(world, state, id);
  if (sealed) return sealed;
  const c = world.items[id].container;
  if (!c?.key) return ok([`You can’t ${verb} that.`]);
  if (!indirect) needObject('indirect');
  const keyId = pickItem(indirect, visibleItems(world, state), world, 'indirect', state);
  if (!keyId) return miss(`You don’t see a “${indirect}” here.`);
  if (!isCarried(state, keyId)) return ok([`You aren’t carrying the ${name(world, keyId)}.`]);
  if (keyId !== c.key) return ok([`The ${name(world, keyId)} doesn’t fit the lock.`]);
  if (locking && isOpen(world, state, id)) return ok(['You’ll have to close it first.']);
  if (isLocked(world, state, id) === locking) return ok([`It’s already ${locking ? 'locked' : 'unlocked'}.`]);
  (state.itemState[id] ??= {}).locked = locking;
  return ok([locking ? 'Locked.' : 'Unlocked.'], true);
}

export function handleLock(target: string | undefined, indirect: string | undefined, world: World, state: GameState) {
  return handleLockState(true, target, indirect, world, state);
}

export function handleUnlock(target: string | undefined, indirect: string | undefined, world: World, state: GameState) {
  return handleLockState(false, target, indirect, world, state);
}

export function handlePut(
  target: string | undefined,
  indirect: string | undefined,
  world: World,
  state: GameState,
  prep?: string,
): EngineResult {
  if (!target) needObject();
  const id = pickItem(target, inventoryOf(world, state), world, 'target', state);
  if (!id) {
    // “Put a cover sheet on the report”, where the cover sheets are a stack on a table:
    // something in sight, with use rules, still works as it did when PUT was USE.
    const seen = matchItem(target, visibleItems(world, state), world);
    const other = indirect ? find(indirect, world, state) : null;
    const sealed = seen ? behindGlass(world, state, seen, other) : null;
    if (sealed) return sealed;
    const fallback = seen ? useFallback(seen, other, world, state) : null;
    return fallback ?? miss(`You aren’t carrying a “${target}”.`);
  }
  if (!indirect) needObject('indirect');
  const dest = find(indirect, world, state, 'indirect');
  if (!dest) return miss(`You don’t see a “${indirect}” here.`);
  // Zork's V-PUT-UNDER and V-PUT-BEHIND: no place to hide things, unless a rule says so.
  if (prep === 'under') return ok(['You can’t do that.']);
  if (prep === 'behind') return ok(['That hiding place is too obvious.']);
  const sealed = behindGlass(world, state, dest);
  if (sealed) return sealed;
  const d = world.items[dest];
  if ((!d.container || d.door) && !d.surface) {
    const refusal = world.style === 'infocom' && prep === 'on' ? `There’s no good surface on the ${d.name}.` : 'You can’t put things there.';
    return useFallback(id, dest, world, state) ?? ok([refusal]);
  }
  if (dest === id || isInside(state, dest, id)) return ok([`You can’t put the ${name(world, id)} inside itself.`]);
  if (!canReachInside(world, state, dest)) return ok([`The ${d.name} is closed.`]);
  const capacity = d.container?.capacity;
  const holds = d.container?.weight;
  const full =
    (capacity !== undefined && childrenOf(world, state, dest).length >= capacity) ||
    (holds !== undefined && weightOf(world, state, dest) - (d.size ?? 5) + weightOf(world, state, id) > holds);
  if (full) {
    return ok([`There’s no room in the ${d.name}.`]);
  }
  moveItem(state, id, dest);
  return ok(['Done.'], true);
}

export function handleTakeFrom(target: string, indirect: string, world: World, state: GameState): EngineResult {
  const from = find(indirect, world, state, 'indirect');
  if (!from) return miss(`You don’t see a “${indirect}” here.`);
  const fromName = name(world, from);
  const isHolder = Boolean(world.items[from].surface || world.items[from].container);
  if (isHolder && !canReachInside(world, state, from) && !canSeeInside(world, state, from)) {
    return ok([`The ${fromName} is closed.`]);
  }
  const id = pickItem(target, childrenOf(world, state, from), world, 'target', state);
  if (!id) return miss(`There’s no “${target}” in the ${fromName}.`);
  return takeItem(id, world, state);
}

export function handleSearch(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) needObject();
  const id = find(target, world, state);
  if (!id) return miss(`You don’t see a “${target}” here.`);
  const item = world.items[id];
  if (!canSeeInside(world, state, id)) {
    return ok([item.container && !item.door ? `The ${item.name} is closed.` : 'You find nothing of interest.']);
  }
  const lines = contentsLines(world, state, id);
  return ok(lines.length > 0 ? lines : [`The ${item.name} is empty.`]);
}
