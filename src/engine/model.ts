import type { GameState, NpcState, Place } from '@/types/game';
import type { World } from '@/types/world';
import { fuzzyCandidates, fuzzyMatch } from './fuzzy';

/** The place that means “carried by the player”. Reserved: no room or item may use it. */
export const PLAYER = 'player';

/** Every item's starting parent: rooms' `items`, then items' `contains`. Unlisted items are offstage. */
export function initialLocations(world: World): Record<string, Place> {
  const loc: Record<string, Place> = {};
  for (const id of Object.keys(world.items)) loc[id] = null;
  for (const [roomId, room] of Object.entries(world.rooms)) {
    // First listing wins; a fixed item listed again elsewhere is also present there (fixturesIn).
    for (const id of room.items) if (loc[id] === null) loc[id] = roomId;
  }
  for (const [id, item] of Object.entries(world.items)) {
    for (const child of item.contains ?? []) loc[child] = id;
  }
  for (const [id, npc] of Object.entries(world.npcs)) {
    for (const held of npc.holds ?? []) loc[held] = id;
  }
  return loc;
}

/**
 * Is a character in this room? Until something moves it, a character is in
 * every room that lists it (Office Space's Lumbergh is in three); once moved,
 * it's in one place. Dead or gone, it's nowhere.
 */
export function isNpcIn(world: World, state: GameState, id: string, roomId: string): boolean {
  const s = state.npcs?.[id];
  if (s?.strength === 0) return false;
  if (s && s.room !== undefined) return s.room === roomId;
  return world.rooms[roomId]?.npcs.includes(id) ?? false;
}

/** The characters in a room: the room's own list order, then any who arrived. */
export function npcsIn(world: World, state: GameState, roomId: string): string[] {
  const here = Object.keys(world.npcs).filter((id) => isNpcIn(world, state, id, roomId));
  const listed = world.rooms[roomId]?.npcs ?? [];
  return [...listed.filter((id) => here.includes(id)), ...here.filter((id) => !listed.includes(id)).sort()];
}

/** The characters in a room the player can see: present and not hidden. */
export function npcsSeen(world: World, state: GameState, roomId: string): string[] {
  return npcsIn(world, state, roomId).filter((id) => !isNpcHidden(world, state, id));
}

/** Is a character unseen? Its state says, else whether it starts hidden. */
export function isNpcHidden(world: World, state: GameState, id: string): boolean {
  return state.npcs?.[id]?.hidden ?? world.npcs[id]?.hidden ?? false;
}

/** A filter for items that aren't hidden (the `hide` effect). */
export const shown = (state: GameState) => (id: string) => !state.itemState[id]?.hidden;

/** A character's state, created on first use. */
export function npcStateOf(state: GameState, id: string): NpcState {
  return ((state.npcs ??= {})[id] ??= {});
}

export function isAlive(_world: World, state: GameState, id: string): boolean {
  const s = state.npcs?.[id];
  return s?.strength !== 0 && s?.room !== null;
}

/** Alive and conscious. */
export function isAwake(world: World, state: GameState, id: string): boolean {
  return isAlive(world, state, id) && (state.npcs?.[id]?.strength ?? 1) > 0;
}

export function parentOf(state: GameState, id: string): Place {
  return state.locations[id] ?? null;
}

/**
 * What's directly in or on `place`. Untouched things come in the order the room
 * or container lists them, and
 * moved things follow in the order they arrived (so the inventory keeps pickup
 * order). Infocom style reverses both, newest first, as Zork lists them.
 */
export function childrenOf(world: World, state: GameState, place: string): string[] {
  const here = Object.keys(world.items).filter((id) => state.locations[id] === place);
  const placed = state.placed ?? {};
  // Untouched things keep the order the room (or container) lists them in.
  const listed = world.rooms[place]?.items ?? world.items[place]?.contains ?? [];
  const rank = (id: string) => {
    const i = listed.indexOf(id);
    return i < 0 ? listed.length : i;
  };
  const untouched = here.filter((id) => placed[id] === undefined).sort((a, b) => rank(a) - rank(b));
  const moved = here.filter((id) => placed[id] !== undefined).sort((a, b) => placed[a] - placed[b]);
  if (world.style === 'infocom') return [...moved.reverse(), ...untouched.reverse()];
  return [...untouched, ...moved];
}

export function inventoryOf(world: World, state: GameState): string[] {
  return childrenOf(world, state, PLAYER);
}

export function isCarried(state: GameState, id: string): boolean {
  return state.locations[id] === PLAYER;
}

export function moveItem(state: GameState, id: string, place: Place): void {
  state.locations[id] = place;
  const placed = (state.placed ??= {});
  placed[id] = Math.max(0, ...Object.values(placed)) + 1;
}

/**
 * Fixed items a room lists that live in another room: the same printer in two
 * versions of the break room. Nobody can carry them off, so they're present in
 * every room that lists them, until they leave the world altogether.
 */
function fixturesIn(world: World, state: GameState, roomId: string): string[] {
  return (world.rooms[roomId]?.items ?? []).filter((id) => {
    const home = state.locations[id];
    return world.items[id] && !world.items[id].portable && home !== roomId && home != null && home in world.rooms;
  });
}

/** What a room lists: its direct contents (and fixtures it shares), minus scenery. */
export function visibleItemsIn(roomId: string, world: World, state: GameState): string[] {
  return [...childrenOf(world, state, roomId), ...fixturesIn(world, state, roomId)].filter((id) => !world.items[id]?.scenery && shown(state)(id));
}

/** Fuzzy candidates for items, with aliases folded into the matchable name. */
export function itemCandidates(ids: string[], world: World): Array<{ id: string; name: string }> {
  return ids.map((id) => {
    const item = world.items[id];
    const name = item ? [item.name, ...(item.aliases ?? [])].join(' ') : id;
    return { id, name };
  });
}


export function matchItem(target: string, ids: string[], world: World): string | null {
  return fuzzyMatch(target, itemCandidates(ids, world));
}

export function matchNpc(target: string, world: World, state: GameState): string | null {
  const present = npcsSeen(world, state, state.currentRoom);
  // Names and aliases, through the one fuzzy matcher.
  const [id = null] = fuzzyCandidates(target, present.map((id) => ({ id, name: world.npcs[id]?.name ?? id, aliases: world.npcs[id]?.aliases })));
  if (id) noteActed(state, 'npc', id);
  return id;
}

/** What this turn's command resolved to, for pronouns (“it”, “her”). */
export interface Acted {
  target?: string;
  indirect?: string;
  npc?: string;
}

const actedThisTurn = new WeakMap<GameState, Acted>();

export function noteActed(state: GameState, slot: keyof Acted, id: string): void {
  const acted = actedThisTurn.get(state) ?? {};
  acted[slot] = id;
  actedThisTurn.set(state, acted);
}

export function takeActed(state: GameState): Acted {
  const acted = actedThisTurn.get(state) ?? {};
  actedThisTurn.delete(state);
  return acted;
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

/** You can see what's in or on it: a surface, or an open or transparent container. */
export function canSeeInside(world: World, state: GameState, id: string): boolean {
  const item = world.items[id];
  if (!item) return false;
  if (item.surface) return true;
  if (!item.container || item.door) return false;
  return isOpen(world, state, id) || Boolean(item.container.transparent);
}

/** You can touch what's in or on it: a surface, or an open container. */
export function canReachInside(world: World, state: GameState, id: string): boolean {
  const item = world.items[id];
  if (!item) return false;
  return Boolean(item.surface) || (Boolean(item.container) && !item.door && isOpen(world, state, id));
}

function roots(world: World, state: GameState): string[] {
  const room = state.currentRoom;
  return [
    ...childrenOf(world, state, room),
    ...fixturesIn(world, state, room),
    ...(world.rooms[room]?.scenery ?? []),
    ...inventoryOf(world, state),
  ].filter(shown(state));
}

function collect(world: World, state: GameState, into: (id: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    if (out.includes(id)) return;
    out.push(id);
    if (into(id)) for (const child of childrenOf(world, state, id).filter(shown(state))) walk(child);
  };
  roots(world, state).forEach(walk);
  return out;
}

/**
 * Whether a room has light: it isn't dark, or a light source that's on is in
 * it, carried there, or inside something open or transparent there.
 */
export function isLit(world: World, state: GameState, roomId: string = state.currentRoom): boolean {
  if (!world.rooms[roomId]?.dark) return true;
  return Object.keys(world.items).some((id) => {
    if (!world.items[id].light || !state.itemState[id]?.on) return false;
    const seen = new Set<string>();
    let p = state.locations[id];
    while (p && world.items[p] && !seen.has(p)) {
      if (!canSeeInside(world, state, p)) return false; // shut in something opaque
      seen.add(p);
      p = state.locations[p];
    }
    const room = p === PLAYER ? state.currentRoom : p;
    return room === roomId;
  });
}

/** In the dark you can only find what you're carrying. */
function inDark(world: World, state: GameState): boolean {
  return !isLit(world, state);
}

function collectCarried(world: World, state: GameState, into: (id: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    if (out.includes(id)) return;
    out.push(id);
    if (into(id)) for (const child of childrenOf(world, state, id)) walk(child);
  };
  inventoryOf(world, state).forEach(walk);
  return out;
}

/** Everything the player can see: the room, its scenery, what they carry, and inside open or transparent things. */
export function visibleItems(world: World, state: GameState): string[] {
  const into = (id: string) => canSeeInside(world, state, id);
  return inDark(world, state) ? collectCarried(world, state, into) : collect(world, state, into);
}

/** Everything the player can touch: like visibleItems, but not through closed glass. */
export function reachableItems(world: World, state: GameState): string[] {
  const into = (id: string) => canReachInside(world, state, id);
  return inDark(world, state) ? collectCarried(world, state, into) : collect(world, state, into);
}

/** Is `id` inside `ancestor`, at any depth? */
export function isInside(state: GameState, id: string, ancestor: string): boolean {
  const seen = new Set<string>();
  for (let p = state.locations[id]; p && !seen.has(p); p = state.locations[p]) {
    if (p === ancestor) return true;
    seen.add(p);
  }
  return false;
}

/** The closed container keeping the player's hands off `id`, if any. */
export function closedAround(world: World, state: GameState, id: string): string | null {
  for (let p = state.locations[id]; p && world.items[p]; p = state.locations[p]) {
    if (!canReachInside(world, state, p)) return p;
  }
  return null;
}

/** Raised while resolving an object, before anything changes; execute turns it into a question. */
export class AskSignal extends Error {
  constructor(
    readonly ask: { kind: 'which'; slot: 'target' | 'indirect'; word: string; candidates: string[] } | { kind: 'what'; slot: 'target' | 'indirect' },
  ) {
    super('ask');
  }
}

// Commands the intent server produced name things by ID; those resolve by ID first.
const byIdTurns = new WeakSet<GameState>();

export function setResolveById(state: GameState, on: boolean): void {
  if (on) byIdTurns.add(state);
  else byIdTurns.delete(state);
}

/**
 * Resolves what the player named among `ids`: the item, or null if nothing
 * matches. Several equally good matches raise a question (AskSignal), which
 * is safe because handlers resolve before they change anything.
 */
export function pickItem(target: string, ids: string[], world: World, slot: 'target' | 'indirect' = 'target', state?: GameState): string | null {
  const candidates = ids.map((id) => ({ id, name: world.items[id]?.name ?? id, aliases: world.items[id]?.aliases }));
  const found = [...new Set(fuzzyCandidates(target, candidates, { byId: state ? byIdTurns.has(state) : false }))];
  if (found.length === 0) return null;
  if (found.length === 1) {
    if (state) noteActed(state, slot, found[0]);
    return found[0];
  }
  const word = target.trim().split(/\s+/).at(-1) ?? target;
  throw new AskSignal({ kind: 'which', slot, word, candidates: found });
}

/** A verb is missing an object: ask for it. */
export function needObject(slot: 'target' | 'indirect' = 'target'): never {
  throw new AskSignal({ kind: 'what', slot });
}
