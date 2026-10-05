import type { GameState } from '@/types/game';
import type { Room, World } from '@/types/world';
import { visibleItemsIn } from './model';

export const COMPASS = ['north', 'south', 'east', 'west', 'up', 'down'];

/**
 * "cubicles (east), lobby (west)". Shows the room's listed exits, each with
 * the compass direction that leads to the same place, if there is one.
 */
export function exitList(room: Room): string {
  const labels = room.listExits ?? Object.keys(room.exits);
  return labels
    .map((label) => {
      const name = label.replace(/_/g, ' ');
      if (COMPASS.includes(label)) return name;
      const dir = COMPASS.find((d) => d !== label && room.exits[d] === room.exits[label]);
      return dir ? `${name} (${dir})` : name;
    })
    .join(', ');
}

/** Lines emitted when entering a room (description, items, NPCs, exits). */
export function describeRoom(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [`The world frays. Room “${roomId}” does not exist.`];
  const lines: string[] = [];
  lines.push(`📍 ${room.name}`);
  lines.push(room.description);

  const visibleItems = visibleItemsIn(roomId, world, state);
  if (visibleItems.length > 0) {
    const names = visibleItems.map((id) => world.items[id]?.name ?? id);
    lines.push(`You can see: ${names.join(', ')}.`);
  }

  if (room.npcs.length > 0) {
    const names = room.npcs.map((id) => world.npcs[id]?.name ?? id);
    lines.push(`Present: ${names.join(', ')}.`);
  }

  const exits = exitList(room);
  if (exits) lines.push(`Exits: ${exits}.`);
  return lines;
}
