import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { fuzzyMatch } from './fuzzy';

export function visibleItemsIn(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [];
  const removed = new Set(state.itemsRemoved[roomId] ?? []);
  const inInventory = new Set(state.inventory);
  const base = room.items.filter((i) => !removed.has(i) && !inInventory.has(i));
  const added = (state.itemsAdded[roomId] ?? []).filter((i) => !inInventory.has(i));
  return [...base, ...added];
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
  return [...visibleItemsIn(state.currentRoom, world, state), ...state.inventory];
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
