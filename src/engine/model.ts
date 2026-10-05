import type { GameState, Place } from '@/types/game';
import type { World } from '@/types/world';
import { fuzzyMatch } from './fuzzy';

/** The place that means “carried by the player”. Reserved: no room or item may use it. */
export const PLAYER = 'player';

/** Every item's starting parent: rooms' `items`, then items' `contains`. Unlisted items are offstage. */
export function initialLocations(world: World): Record<string, Place> {
  const loc: Record<string, Place> = {};
  for (const id of Object.keys(world.items)) loc[id] = null;
  for (const [roomId, room] of Object.entries(world.rooms)) {
    for (const id of room.items) loc[id] = roomId;
  }
  for (const [id, item] of Object.entries(world.items)) {
    for (const child of item.contains ?? []) loc[child] = id;
  }
  return loc;
}

export function parentOf(state: GameState, id: string): Place {
  return state.locations[id] ?? null;
}

/** What's directly in or on `place`, in world declaration order. */
export function childrenOf(world: World, state: GameState, place: string): string[] {
  return Object.keys(world.items).filter((id) => state.locations[id] === place);
}

export function inventoryOf(world: World, state: GameState): string[] {
  return childrenOf(world, state, PLAYER);
}

export function isCarried(state: GameState, id: string): boolean {
  return state.locations[id] === PLAYER;
}

export function moveItem(state: GameState, id: string, place: Place): void {
  state.locations[id] = place;
}

export function visibleItemsIn(roomId: string, world: World, state: GameState): string[] {
  return childrenOf(world, state, roomId);
}

/** Fuzzy candidates for items, with aliases folded into the matchable name. */
export function itemCandidates(ids: string[], world: World): Array<{ id: string; name: string }> {
  return ids.map((id) => {
    const item = world.items[id];
    const name = item ? [item.name, ...(item.aliases ?? [])].join(' ') : id;
    return { id, name };
  });
}

export function reachableItems(world: World, state: GameState): string[] {
  return [...childrenOf(world, state, state.currentRoom), ...inventoryOf(world, state)];
}

export function matchItem(target: string, ids: string[], world: World): string | null {
  return fuzzyMatch(target, itemCandidates(ids, world));
}

export function matchNpc(target: string, world: World, state: GameState): string | null {
  const present = world.rooms[state.currentRoom]?.npcs ?? [];
  return fuzzyMatch(
    target,
    present.map((id) => ({ id, name: world.npcs[id]?.name ?? id })),
  );
}

export function isOpen(world: World, state: GameState, id: string): boolean {
  const c = world.items[id]?.container;
  if (!c) return false;
  if (!c.openable) return true;
  return state.itemState[id]?.open ?? c.open ?? false;
}

export function isLocked(world: World, state: GameState, id: string): boolean {
  const c = world.items[id]?.container;
  if (!c) return false;
  return state.itemState[id]?.locked ?? c.locked ?? false;
}

export function isOn(state: GameState, id: string): boolean {
  return Boolean(state.itemState[id]?.on);
}

/** Can the player touch it? */
export function isReachable(world: World, state: GameState, id: string): boolean {
  return reachableItems(world, state).includes(id);
}
