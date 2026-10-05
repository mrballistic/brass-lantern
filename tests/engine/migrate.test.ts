import { describe, expect, it } from 'vitest';
import { migrateSave } from '@/engine/migrate';
import { initialState } from '@/engine/engine';
import { fixtureWorld as world } from '../fixtures/world';

const v1 = (gameState: object) => ({
  version: '1.0',
  savedAt: '2026-10-01T00:00:00Z',
  outputHistory: [{ id: '1', text: 'hello', timestamp: 0, type: 'prose' }],
  gameState: {
    currentRoom: 'bedroom', inventory: [], flags: {}, moveCount: 0, gameOver: false,
    itemsRemoved: {}, itemsAdded: {}, firedEvents: [], ...gameState,
  },
});

describe('migrateSave', () => {
  it('passes a 2.0 save through', () => {
    const save = { version: '2.0', savedAt: '', outputHistory: [], gameState: initialState(world) };
    expect(migrateSave(world, save)).toEqual(save);
  });

  it('migrates an untouched 1.0 game to the initial places', () => {
    const out = migrateSave(world, v1({}))!;
    expect(out.version).toBe('2.0');
    expect(out.gameState.locations).toEqual(initialState(world).locations);
    expect(out.gameState.visited).toEqual(['bedroom']);
    expect(out.gameState.itemState).toEqual({});
    expect(out.outputHistory).toHaveLength(1);
    expect(out.gameState).not.toHaveProperty('inventory');
    expect(out.gameState).not.toHaveProperty('itemsRemoved');
  });

  it('carried items go to the player; dropped items stay where they were dropped', () => {
    // Took the key in the living room, dropped the wallet in the yard, and is carrying the shirt.
    const out = migrateSave(world, v1({
      currentRoom: 'yard',
      inventory: ['key', 'shirt'],
      itemsRemoved: { living: ['key', 'wallet', 'shirt'] },
      itemsAdded: { yard: ['wallet'] },
      flags: { entered_living: true },
      moveCount: 3,
    }))!;
    expect(out.gameState.locations.key).toBe('player');
    expect(out.gameState.locations.shirt).toBe('player');
    expect(out.gameState.locations.wallet).toBe('yard');
    expect(out.gameState.locations.bat).toBe('yard');
    expect(out.gameState.flags).toEqual({ entered_living: true });
    expect(out.gameState.moveCount).toBe(3);
    expect(out.gameState.visited).toEqual(['yard']);
  });

  it('a smashed item that left the room is offstage', () => {
    const out = migrateSave(world, v1({ itemsRemoved: { bedroom: ['alarm'] }, firedEvents: ['smash_alarm'] }))!;
    expect(out.gameState.locations.alarm).toBeNull();
  });

  it('an item added by an event and still carried is carried', () => {
    const out = migrateSave(world, v1({ inventory: ['lit_lamp'] }))!;
    expect(out.gameState.locations.lit_lamp).toBe('player');
  });

  it('rejects anything it can’t read', () => {
    expect(migrateSave(world, null)).toBeNull();
    expect(migrateSave(world, { version: '9.9' })).toBeNull();
    expect(migrateSave(world, { version: '1.0', gameState: { currentRoom: 3 } })).toBeNull();
    expect(migrateSave(world, 'nonsense')).toBeNull();
    expect(migrateSave(world, { version: '2.0', savedAt: '', outputHistory: [] })).toBeNull();
  });

  it('treats a non-array history as empty', () => {
    const save = { version: '2.0', savedAt: '', outputHistory: 'oops', gameState: initialState(world) };
    expect(migrateSave(world, save)?.outputHistory).toEqual([]);
  });
});
