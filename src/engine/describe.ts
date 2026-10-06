import type { GameState } from '@/types/game';
import type { Room, World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { darknessLook } from './light';
import { canSeeInside, childrenOf, isLit, visibleItemsIn } from './model';

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
  // Infocom's games print a plain "a" ("a elvish sword" never comes up; they chose names to suit).
  if (world.style === 'infocom') return 'a';
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
  if (parts.length === 1) return parts[0];
  // Zork puts “, and” before the last item even when there are only two.
  if (parts.length === 2 && world.style !== 'infocom') return parts.join(' and ');
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
  const lines: string[] = [];
  // Untouched things with a first-seen sentence describe themselves (“On the table is a brown sack.”).
  const told = kids.filter((k) => !state.itemState[k]?.moved && world.items[k]?.initialDescription);
  for (const k of told) {
    lines.push(world.items[k].initialDescription!);
    lines.push(...contentsLines(world, state, k, depth));
  }
  const rest = kids.filter((k) => !told.includes(k));
  if (rest.length === 0) return lines;
  lines.push(`${'  '.repeat(depth)}${heading(world, id)}`);
  for (const k of rest) {
    lines.push(`${'  '.repeat(depth + 1)}${listed(world, k)}${lightNote(world, state, k)}`);
    lines.push(...contentsLines(world, state, k, depth + 1));
  }
  return lines;
}

/** “ (providing light)” after a lit light source, as Zork lists it. */
export function lightNote(world: World, state: GameState, id: string): string {
  return world.items[id]?.light && state.itemState[id]?.on ? ' (providing light)' : '';
}

/** An item's own sentence in a room listing: its first-seen one until it's moved, then its room one. */
function itemSentence(world: World, state: GameState, id: string): string | undefined {
  const item = world.items[id];
  if (!item) return undefined;
  if (!state.itemState[id]?.moved && item.initialDescription) return item.initialDescription;
  return item.roomDescription;
}

/** Lines emitted when entering a room (description, items, NPCs, exits). */
export function describeRoom(
  roomId: string,
  world: World,
  state: GameState,
  opts: { first?: boolean; brief?: boolean; namesOnly?: boolean } = {},
): string[] {
  const room = world.rooms[roomId];
  if (!room) return [`The world frays. Room “${roomId}” does not exist.`];
  const infocom = world.style === 'infocom';
  if (!isLit(world, state, roomId)) {
    // Zork prints only the darkness line; brass keeps a header so the screen reads the same.
    return infocom ? [darknessLook(world)] : ['📍 Darkness', darknessLook(world)];
  }
  const lines: string[] = [];
  lines.push(`📍 ${room.name}`);
  // SUPERBRIEF: the name and nothing else, as Zork skips DESCRIBE-OBJECTS.
  if (opts.namesOnly) return lines;
  // BRIEF (Infocom's default) and SUPERBRIEF: just the name and contents.
  if (!opts.brief) {
    const varied = room.descriptions?.find((d) => evaluateCondition(d.if, state, world))?.text;
    lines.push(opts.first && room.firstDescription ? room.firstDescription : (varied ?? room.description));
  }

  const visibleItems = visibleItemsIn(roomId, world, state);
  const plain: string[] = [];
  for (const id of visibleItems) {
    const sentence = itemSentence(world, state, id);
    if (sentence) lines.push(sentence);
    else if (infocom) lines.push(`There is ${withArticle(world, id)} here.`);
    else plain.push(world.items[id]?.name ?? id);
  }
  if (plain.length > 0) lines.push(`You can see: ${plain.join(', ')}.`);
  for (const id of visibleItems) lines.push(...contentsLines(world, state, id));
  // Scenery isn't listed, but what's on or in it is (the kitchen table's sack).
  for (const id of childrenOf(world, state, roomId).filter((k) => world.items[k]?.scenery)) {
    lines.push(...contentsLines(world, state, id));
  }

  if (room.npcs.length > 0) {
    const names = room.npcs.map((id) => world.npcs[id]?.name ?? id);
    lines.push(`Present: ${names.join(', ')}.`);
  }

  const exits = exitList(room);
  if (exits && !infocom) lines.push(`Exits: ${exits}.`);
  return lines;
}
