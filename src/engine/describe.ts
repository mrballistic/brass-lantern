import type { GameState } from '@/types/game';
import type { EventStep, Exit, Room, World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { darknessLook } from './light';
import { scriptSteps } from './scripts';
import { expandTemplate } from './text';
import { canSeeInside, childrenOf, isLit, listable, npcsSeen, visibleItemsIn } from './model';

export const COMPASS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down'];

/** Where an exit leads, if anywhere (a message-only exit leads nowhere). */
export function exitTarget(exit: string | Exit | undefined): string | undefined {
  return typeof exit === 'string' ? exit : exit?.to;
}

/**
 * "cubicles (east), lobby (west)". Shows the room's listed exits, each with
 * the compass direction that leads to the same place, if there is one.
 */
export function exitList(room: Room): string {
  const to = (label: string) => exitTarget(room.exits[label]);
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
function articleFor(world: World, id: string): string {
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
export function listedName(world: World, id: string): string {
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

/** Untouched, with a first-seen sentence of its own (“On the table is a brown sack.”). */
function firstSeen(world: World, state: GameState, id: string): boolean {
  return !state.itemState[id]?.moved && Boolean(world.items[id]?.initialDescription);
}

/**
 * Everything visible in or on `id`, in Zork's form: a heading at `depth`
 * (two spaces per level), then "A leaflet" lines one level in, nested.
 */
export function contentsLines(world: World, state: GameState, id: string, depth = 0): string[] {
  if (!canSeeInside(world, state, id)) return [];
  const kids = childrenOf(world, state, id).filter(listable(world, state));
  const lines: string[] = [];
  // Untouched things with a first-seen sentence describe themselves.
  const told = kids.filter((k) => firstSeen(world, state, k));
  for (const k of told) {
    lines.push(world.items[k].initialDescription!);
    lines.push(...contentsLines(world, state, k, depth));
  }
  const rest = kids.filter((k) => !told.includes(k));
  if (rest.length === 0) return lines;
  // FIRSTER prints a heading of the world's own (the trophy case's) unindented.
  lines.push(`${world.items[id]?.contentsHeading ? '' : '  '.repeat(depth)}${heading(world, id)}`);
  for (const k of rest) {
    lines.push(`${'  '.repeat(depth + 1)}${listedName(world, k)}${lightNote(world, state, k)}`);
    lines.push(...contentsLines(world, state, k, depth + 1));
  }
  return lines;
}

/** A scenery surface with no heading of its own (Zork's kitchen table): Release 119 describes what's on it as if on the floor. */
function floorLike(world: World, id: string): boolean {
  const item = world.items[id];
  return Boolean(item?.surface && !item.contentsHeading);
}

/** What's on a floor-like surface: first-seen sentences, then “There is a … here.” (and “(outside the boat)”) with each thing's contents; `listed` if any was the latter. */
function surfaceAsFloor(world: World, state: GameState, id: string, outside: string): { lines: string[]; listed: boolean } {
  const kids = childrenOf(world, state, id).filter(listable(world, state));
  const told = (k: string) => firstSeen(world, state, k);
  const lines: string[] = [];
  let listed = false;
  for (const k of [...kids.filter(told), ...kids.filter((k) => !told(k))]) {
    if (told(k)) lines.push(world.items[k].initialDescription!);
    else {
      listed = true;
      lines.push((world.items[k].roomDescription ?? `There is ${withArticle(world, k)} here${lightNote(world, state, k)}.`) + outside);
    }
    lines.push(...contentsLines(world, state, k));
  }
  return { lines, listed };
}

/** “ (providing light)” after a lit light source, as Zork lists it. */
export function lightNote(world: World, state: GameState, id: string): string {
  return world.items[id]?.light && state.itemState[id]?.on ? ' (providing light)' : '';
}

/** An item's own sentence in a room listing: its script's, else its first-seen one until it's moved, then its room one. */
function itemSentence(world: World, state: GameState, id: string): string | undefined {
  const item = world.items[id];
  if (!item) return undefined;
  return firstSeen(world, state, id) ? item.initialDescription : item.roomDescription;
}

/** What an item's room-sentence script says now (Zork's DESCFCN), if it has one that says anything. */
function scriptedSentence(world: World, state: GameState, id: string): string | undefined {
  const text = scriptDescription(world.items[id]?.roomDescriptionScript, world, state);
  return text === undefined ? undefined : expandTemplate(text, world, state);
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
  const vehicle = state.aboard ? world.items[state.aboard] : undefined;
  // DESCRIBE-ROOM: “Frigid River, in the magic boat”.
  lines.push(`📍 ${room.name}${vehicle ? (infocom ? `, in the ${vehicle.name}` : ` (in the ${vehicle.name})`) : ''}`);
  // SUPERBRIEF: the name and nothing else, as Zork skips DESCRIBE-OBJECTS.
  if (opts.namesOnly) return lines;
  // BRIEF (Infocom's default) and SUPERBRIEF: just the name and contents.
  let roomScripted = false;
  if (!opts.brief) {
    const varied = room.descriptions?.find((d) => evaluateCondition(d.if, state, world))?.text;
    const scripted = scriptDescription(room.descriptionScript, world, state);
    roomScripted = scripted !== undefined;
    lines.push(expandTemplate(scripted ?? (opts.first && room.firstDescription ? room.firstDescription : (varied ?? room.description)), world, state));
  }
  // DESCRIBE-ROOM: aboard, the vehicle's own M-LOOK, unless the room's M-LOOK described it in full.
  const inside = vehicle?.vehicle?.descriptionScript && !roomScripted ? scriptDescription(vehicle.vehicle.descriptionScript, world, state) : undefined;
  if (inside !== undefined) lines.push(expandTemplate(inside, world, state));

  // The vehicle you're in isn't listed; what's in it is, after the room's things.
  const told = (id: string) => firstSeen(world, state, id);
  const inRoom = visibleItemsIn(roomId, world, state).filter((id) => id !== state.aboard);
  // Infocom lists untouched things' first-seen sentences before everything else (PRINT-CONT's first pass).
  const visibleItems = infocom ? [...inRoom.filter(told), ...inRoom.filter((id) => !told(id))] : inRoom;
  const plain: string[] = [];
  // Zork lists a room's contents newest first: a character who moved in this turn comes before its things.
  const people = npcsSeen(world, state, roomId).filter((id) => !(state.npcs?.[id]?.scenery ?? world.npcs[id]?.scenery));
  const newestThing = Math.max(0, ...inRoom.map((id) => state.placed?.[id] ?? 0));
  const justArrived = infocom ? people.filter((id) => (state.npcs?.[id]?.seq ?? -1) > newestThing) : [];
  for (const id of justArrived) lines.push(npcDescription(world, state, id));
  // Aboard, Zork marks the room's things “(outside the boat)”, all but first-seen sentences (PRINT-CONT).
  const outside = infocom && vehicle ? ` (outside the ${vehicle.name})` : '';
  let listed = false;
  for (const id of visibleItems) {
    // A DESCFCN says everything itself: no “(outside the boat)” after it.
    const scripted = scriptedSentence(world, state, id);
    const sentence = scripted ?? itemSentence(world, state, id);
    const isFirst = told(id);
    if (!isFirst && (sentence || infocom)) listed = true;
    if (scripted !== undefined) lines.push(scripted);
    else if (sentence) lines.push(isFirst ? sentence : sentence + outside);
    else if (infocom) lines.push(`There is ${withArticle(world, id)} here${lightNote(world, state, id)}.${outside}`);
    else plain.push(world.items[id]?.name ?? id);
    // Zork describes what's in each thing right after it.
    if (infocom) lines.push(...contentsLines(world, state, id));
  }
  if (plain.length > 0) lines.push(`You can see: ${plain.join(', ')}.`);
  if (!infocom) for (const id of visibleItems) lines.push(...contentsLines(world, state, id));
  // Scenery isn't listed, but what's on or in it is (the kitchen table's sack).
  for (const id of childrenOf(world, state, roomId).filter((k) => world.items[k]?.scenery)) {
    if (infocom && floorLike(world, id)) {
      const floor = surfaceAsFloor(world, state, id, outside);
      if (floor.listed) listed = true;
      lines.push(...floor.lines);
      continue;
    }
    // Zork's PRINT-CONT: once something on the floor was listed, the rest go a level deeper.
    lines.push(...contentsLines(world, state, id, infocom && listed ? 1 : 0));
  }
  // The vehicle's contents come last (PRINT-CONT), a level deeper when anything else was listed.
  if (state.aboard) lines.push(...contentsLines(world, state, state.aboard, infocom && listed ? 1 : 0));

  // Infocom style: each character's own line, as Zork's LDESC; brass: a list.
  if (infocom) for (const id of people.filter((p) => !justArrived.includes(p))) lines.push(npcDescription(world, state, id));
  else if (people.length > 0) lines.push(`Present: ${people.map((id) => world.npcs[id]?.name ?? id).join(', ')}.`);

  const exits = exitList(room);
  if (exits && !infocom) lines.push(`Exits: ${exits}.`);
  return lines;
}

/** The steps a description script returns. Describing never changes the game, so the seed is put back. */
export function descriptionSteps(name: string, world: World, state: GameState): EventStep[] {
  const rng = state.rng;
  try {
    return scriptSteps(name, undefined, world, state);
  } finally {
    state.rng = rng;
  }
}

/** What a description script says: its `say` lines, a line each (undefined when there's no such script or it says nothing). */
export function scriptDescription(name: string | undefined, world: World, state: GameState): string | undefined {
  if (!name || !world.scripts?.[name]) return undefined;
  const lines = descriptionSteps(name, world, state)
    .map((step) => (typeof step === 'string' ? step : 'say' in step ? step.say : undefined))
    .filter((s): s is string => s !== undefined);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** A character's line: its description script, else the first description whose condition holds, else its description. */
export function npcDescription(world: World, state: GameState, id: string): string {
  const npc = world.npcs[id];
  const text = scriptDescription(npc?.descriptionScript, world, state) ?? npc?.descriptions?.find((d) => evaluateCondition(d.if, state, world))?.text ?? npc?.description ?? id;
  return expandTemplate(text, world, state);
}
