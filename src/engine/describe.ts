import type { GameState } from '@/types/game';
import type { Room, World } from '@/types/world';
import { canSeeInside, childrenOf, visibleItemsIn } from './model';

export const COMPASS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down'];

/**
 * "cubicles (east), lobby (west)". Shows the room's listed exits, each with
 * the compass direction that leads to the same place, if there is one.
 */
export function exitList(room: Room): string {
  const to = (label: string) => {
    const e = room.exits[label];
    return typeof e === 'string' ? e : e?.to;
  };
  // Message-only exits are listed only when listExits names them.
  const labels = room.listExits ?? Object.keys(room.exits).filter((l) => to(l) !== undefined);
  return labels
    .map((label) => {
      const name = label.replace(/_/g, ' ');
      if (COMPASS.includes(label)) return name;
      const dest = to(label);
      // Only a plain exit makes a good hint; a conditional one might refuse.
      const dir = dest && COMPASS.find((d) => d !== label && room.exits[d] === dest);
      return dir ? `${name} (${dir})` : name;
    })
    .join(', ');
}

/** "a", "an", "some" or "" for an item, from its `article` or its name. */
export function articleFor(world: World, id: string): string {
  const item = world.items[id];
  if (!item) return 'a';
  if (item.article !== undefined) return item.article;
  return /^[aeiou]/i.test(item.name) ? 'an' : 'a';
}

/** "a leaflet" */
export function withArticle(world: World, id: string): string {
  const article = articleFor(world, id);
  const name = world.items[id]?.name ?? id;
  return article ? `${article} ${name}` : name;
}

/** "A leaflet": Zork's style for listed items. */
function listed(world: World, id: string): string {
  const s = withArticle(world, id);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "a leaflet", "a leaflet and a sword", "a leaflet, a sword, and a lamp". */
export function listPhrase(world: World, ids: string[]): string {
  const parts = ids.map((id) => withArticle(world, id));
  if (parts.length <= 2) return parts.join(' and ');
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

function heading(world: World, id: string): string {
  const item = world.items[id];
  if (item?.contentsHeading) return item.contentsHeading;
  return item?.surface ? `Sitting on the ${item.name} is:` : `The ${item?.name ?? id} contains:`;
}

/**
 * Everything visible in or on `id`, in Zork's form: a heading at `depth`
 * (two spaces per level), then "A leaflet" lines one level in, nested.
 */
export function contentsLines(world: World, state: GameState, id: string, depth = 0): string[] {
  if (!canSeeInside(world, state, id)) return [];
  const kids = childrenOf(world, state, id).filter((k) => !world.items[k]?.scenery);
  if (kids.length === 0) return [];
  const lines = [`${'  '.repeat(depth)}${heading(world, id)}`];
  for (const k of kids) {
    lines.push(`${'  '.repeat(depth + 1)}${listed(world, k)}`);
    lines.push(...contentsLines(world, state, k, depth + 1));
  }
  return lines;
}

/** Lines emitted when entering a room (description, items, NPCs, exits). */
export function describeRoom(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [`The world frays. Room “${roomId}” does not exist.`];
  const lines: string[] = [];
  lines.push(`📍 ${room.name}`);
  lines.push(room.description);

  const infocom = world.style === 'infocom';
  const visibleItems = visibleItemsIn(roomId, world, state);
  if (infocom) {
    for (const id of visibleItems) lines.push(`There is ${withArticle(world, id)} here.`);
  } else if (visibleItems.length > 0) {
    const names = visibleItems.map((id) => world.items[id]?.name ?? id);
    lines.push(`You can see: ${names.join(', ')}.`);
  }
  for (const id of visibleItems) lines.push(...contentsLines(world, state, id));

  if (room.npcs.length > 0) {
    const names = room.npcs.map((id) => world.npcs[id]?.name ?? id);
    lines.push(`Present: ${names.join(', ')}.`);
  }

  const exits = exitList(room);
  if (exits && !infocom) lines.push(`Exits: ${exits}.`);
  return lines;
}
