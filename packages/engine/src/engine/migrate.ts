import type { GameState, OutputLine, SavedState } from '../types/game.ts';
import { SAVE_VERSION } from '../types/game.ts';
import type { World } from '../types/world.ts';
import { initialLocations, moveItem, PLAYER } from './model.ts';

/** The 1.0 state: an inventory list plus per-room deltas against the world's starting items. */
interface V1Game {
  currentRoom: string;
  inventory?: string[];
  flags?: Record<string, boolean>;
  moveCount?: number;
  gameOver?: boolean;
  itemsRemoved?: Record<string, string[]>;
  itemsAdded?: Record<string, string[]>;
  firedEvents?: string[];
  misses?: number;
  turns?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function history(raw: Record<string, unknown>): OutputLine[] {
  return Array.isArray(raw.outputHistory) ? (raw.outputHistory as OutputLine[]) : [];
}

function fromV1(world: World, g: V1Game): GameState {
  const state: GameState = {
    currentRoom: g.currentRoom,
    locations: initialLocations(world),
    itemState: {},
    visited: [g.currentRoom],
    flags: { ...(g.flags ?? {}) },
    moveCount: g.moveCount ?? 0,
    gameOver: Boolean(g.gameOver),
    firedEvents: [...(g.firedEvents ?? [])],
    misses: g.misses ?? 0,
    turns: g.turns ?? 0,
  };
  // Removed first, then added, then carried: an item taken in one room and
  // dropped in another must end up where it was dropped. 1.0's TAKE never
  // cleared itemsAdded while DROP did clear itemsRemoved, so an item in both
  // lists for one room was taken back from there: that entry is stale.
  const removed = g.itemsRemoved ?? {};
  for (const ids of Object.values(removed)) for (const id of ids) moveItem(state, id, null);
  for (const [room, ids] of Object.entries(g.itemsAdded ?? {})) {
    for (const id of ids) if (!(removed[room] ?? []).includes(id)) moveItem(state, id, room);
  }
  for (const id of g.inventory ?? []) moveItem(state, id, PLAYER);
  return state;
}

/** A save in the current format, migrated if it's older. Null if it can't be read. */
export function migrateSave(world: World, raw: unknown): SavedState | null {
  if (!isRecord(raw) || !isRecord(raw.gameState)) return null;
  const g = raw.gameState;
  if (typeof g.currentRoom !== 'string') return null;
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : '';
  try {
    if (raw.version === SAVE_VERSION) {
      // 1.12.0 stamped characters' arrivals with turn numbers (`arrived`); 1.12.5 uses `seq`.
      if (isRecord(g.npcs)) for (const n of Object.values(g.npcs)) if (isRecord(n)) delete n.arrived;
      // Items added to the world since the save was made start where the world places them; a null (consumed) stays null.
      if (isRecord(g.locations)) {
        for (const [id, at] of Object.entries(initialLocations(world))) if (!Object.hasOwn(g.locations, id)) g.locations[id] = at;
      }
      return { version: SAVE_VERSION, savedAt, gameState: g as unknown as GameState, outputHistory: history(raw) };
    }
    if (raw.version === '1.0') {
      return { version: SAVE_VERSION, savedAt, gameState: fromV1(world, g as unknown as V1Game), outputHistory: history(raw) };
    }
  } catch {
    return null;
  }
  return null;
}
