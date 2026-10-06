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
      await s.submit('wait');
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
