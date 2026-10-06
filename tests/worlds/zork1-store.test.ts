// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { useGameStore } from '@/stores/game';
import { zork1 } from '@/worlds/zork1';

/** The game store on native Zork, in the East-West Passage with the egg and a lit lamp. */
function store(seed: number) {
  setActivePinia(createPinia());
  localStorage.clear();
  const s = useGameStore();
  s.initialize({ kind: 'world', id: 'zork1-native', title: 'ZORK I · NATIVE', world: zork1, saveKey: 'test:zork1' });
  Object.assign(s.game, { currentRoom: 'ew_passage', rng: seed });
  s.game.locations.egg = 'player';
  s.game.locations.lamp = 'player';
  s.game.itemState.lamp = { on: true, moved: true };
  return s;
}

describe('the thief and UNDO', () => {
  it('UNDO after a theft gives the things back, and the seed replays the same theft', async () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const s = store(seed);
      // One WAIT: up to three turns of Zork's clock, all undone together.
      await s.submit('wait');
      if (s.game.locations.egg === 'player') continue;
      found = true;
      const stolenTo = s.game.locations.egg;
      await s.submit('undo');
      const afterUndo = s.game.locations.egg;
      await s.submit('wait');
      expect({ afterUndo, replayed: s.game.locations.egg }).toEqual({ afterUndo: 'player', replayed: stolenTo });
    }
    expect(found).toBe(true);
  });
});

describe('the coal mine and UNDO (5c)', () => {
  it('UNDO after the machine and after lowering the basket puts things back', async () => {
    const s = store(1);
    s.game.npcs = { thief: { room: null } };
    s.game.currentRoom = 'machine_room';
    s.game.locations.screwdriver = 'player';
    s.game.locations.coal = 'machine';
    await s.submit('turn switch with screwdriver');
    expect(s.game.locations.diamond).toBe('machine');
    await s.submit('undo');
    expect(s.game.locations.coal).toBe('machine');
    expect(s.game.locations.diamond ?? null).toBeNull();
    s.game.currentRoom = 'shaft_room';
    await s.submit('lower basket');
    expect(s.game.locations.raised_basket).toBe('lower_shaft');
    await s.submit('undo');
    expect(s.game.locations.raised_basket).toBe('shaft_room');
    expect(s.game.locations.lowered_basket).toBe('lower_shaft');
  });
});

describe('the barrow and RESTORE (5d)', () => {
  it('after the ending only RESTART and RESTORE work; a save from before plays on', async () => {
    const s = store(1);
    s.game.npcs = { thief: { room: null } };
    s.game.currentRoom = 'stone_barrow';
    s.game.flags.won = true;
    await s.submit('save');
    await s.submit('before');
    await s.submit('west');
    expect(s.game.gameOver).toBe(true);
    await s.submit('look');
    expect(s.output.at(-1)!.text).toContain('The game has ended');
    await s.submit('restore');
    await s.submit('before');
    expect(s.game.gameOver).toBeFalsy();
    expect(s.game.currentRoom).toBe('stone_barrow');
  });
});
