import { describe, expect, it } from 'vitest';
import { execute, initialState } from '../../src/engine/engine';
import { isNpcIn } from '../../src/engine/model';
import { fallbackParse } from '../../src/engine/parser';
import type { GameState } from '../../src/types/game';
import { zork1 } from '../../src/worlds/zork1';

function at(room: string, seed: number, setup?: (s: GameState) => void) {
  const state = initialState(zork1);
  state.currentRoom = room;
  state.locations.lamp = 'player';
  state.itemState.lamp = { on: true, moved: true };
  state.rng = seed;
  setup?.(state);
  const run = (c: string) => execute(fallbackParse(c, zork1.verbs) ?? { action: 'unknown' }, { world: zork1, state }).lines;
  return { state, run };
}
const thiefRoom = (s: GameState) => Object.keys(zork1.rooms).find((r) => isNpcIn(zork1, s, 'thief', r));
/** Tries seeds until `check` holds; returns the first that does. */
function seedWhere(check: (seed: number) => boolean, tries = 400): number {
  for (let seed = 1; seed <= tries; seed++) if (check(seed)) return seed;
  throw new Error('no seed found');
}

describe('Zork I, natively: the thief', () => {
  it('starts hidden in the Round Room and walks Zork’s room order, never into sacred rooms', () => {
    const { state, run } = at('living_room', 1);
    expect(thiefRoom(state)).toBe('round_room');
    run('look');
    expect(thiefRoom(state)).toBe('ew_passage');
    const visited = new Set<string>();
    for (let i = 0; i < 60; i++) {
      run('look');
      visited.add(thiefRoom(state)!);
    }
    for (const room of visited) expect(zork1.rooms[room].tags ?? []).not.toContain('sacred');
  });

  it('takes treasures from rooms you’ve visited (75% each)', () => {
    seedWhere((seed) => {
      const { state, run } = at('living_room', seed, (s) => {
        s.locations.painting = 'ew_passage';
        s.visited.push('ew_passage');
      });
      run('look');
      return state.locations.painting === 'thief';
    });
  });

  it('turns up in your dark room', () => {
    seedWhere((seed) => {
      const { run } = at('ew_passage', seed);
      return run('look').some((l) => l.startsWith('Someone carrying a large bag is casually leaning against one of the walls here.'));
    });
  });

  it('robs you in passing', () => {
    seedWhere((seed) => {
      const { state, run } = at('ew_passage', seed, (s) => (s.locations.egg = 'player'));
      const lines = [...run('look'), ...run('look')];
      // The next turn he may already have left it in his lair.
      return lines.some((l) => l.includes('quietly abstracted some valuables from your possession')) && state.locations.egg !== 'player';
    });
  });

  it('takes your only light and leaves you in the dark', () => {
    // The brass lantern isn't a treasure in Zork; a world where it is shows the light-change line.
    seedWhere((seed) => {
      const world = { ...zork1, items: { ...zork1.items, lamp: { ...zork1.items.lamp, treasure: 1 } } };
      const state = initialState(world);
      state.currentRoom = 'ew_passage';
      state.locations.lamp = 'player';
      state.itemState.lamp = { on: true, moved: true };
      state.rng = seed;
      const lines = [0, 1, 2].flatMap(() => execute({ action: 'wait' }, { world, state }).lines);
      return lines.includes('The thief seems to have left you in the dark.');
    });
  });

  it('is never heard robbing the maze: Zork clears its TOUCHBIT, so he leaves it alone', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { state, run } = at('maze_14', seed, (s) => {
        s.npcs = { thief: { room: 'maze_15', hidden: true } };
        s.visited.push('maze_15');
        s.locations.knife = 'maze_15';
      });
      const lines = [...run('look'), ...run('look')];
      expect(lines.some((l) => l.startsWith('You hear, off in the distance'))).toBe(false);
      expect(state.locations.knife).toBe('maze_15');
    }
  });

  it('defends his lair: the scream, the vanishing treasures, the chalice he guards', () => {
    const { run } = at('cyclops_room', 3, (s) => {
      s.flags.cyclops_asleep = true;
      s.locations.painting = 'treasure_room';
    });
    const lines = run('up');
    expect(lines[0]).toMatch(/^You hear a scream of anguish as you violate the robber’s hideaway/);
    expect(lines).toContain('The thief gestures mysteriously, and the treasures in the room suddenly vanish.');
    expect(run('take chalice')[0]).toBe('You’d be stabbed in the back first.');
    expect(execute({ action: 'take', target: 'painting' }, { world: zork1, state: at('cyclops_room', 3).state }).understood).toBe(false);
  });

  it('dying in his lair, his treasures reappear and the chalice is safe', () => {
    const { state, run } = at('treasure_room', 5, (s) => {
      s.npcs = { thief: { room: 'treasure_room', hidden: false, fighting: true, strength: 1 } };
      s.locations.painting = 'treasure_room';
      s.itemState.painting = { hidden: true };
      s.locations.stiletto = 'treasure_room';
      s.locations.knife = 'player';
    });
    for (let i = 0; i < 15 && state.npcs?.thief?.strength !== 0; i++) run('kill thief with knife');
    expect(state.npcs?.thief?.strength).toBe(0);
    expect(state.itemState.painting?.hidden).toBe(false);
    expect(run('look').join(' ')).toContain('painting');
  });

  it('gifts, and talking to him (each reply comes before his turn)', () => {
    const fresh = () =>
      at('ew_passage', 2, (s) => {
        s.npcs = { thief: { room: 'ew_passage', hidden: false } };
        s.locations.leaflet = 'player';
        s.locations.egg = 'player';
      });
    expect(fresh().run('give leaflet to thief')[0]).toBe('The thief places the leaflet in his bag and thanks you politely.');
    const gift = fresh();
    expect(gift.run('give egg to thief')[0]).toBe('The thief is taken aback by your unexpected generosity, but accepts the jewel-encrusted egg and stops to admire its beauty.');
    expect(gift.state.locations.egg).not.toBe('player');
    expect(fresh().run('take thief')[0]).toBe('Once you got him, what would you do with him?');
    expect(fresh().run('thief, give me the egg')[0]).toBe('The thief is a strong, silent type.');
    expect(fresh().run('examine robber')[0]).toMatch(/^The thief is a slippery character with beady eyes/);
  });

  it('a knife thrown at him: he usually fights, sometimes flees and spills his bag', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const { run } = at('ew_passage', seed, (s) => {
        s.npcs = { thief: { room: 'ew_passage', hidden: false } };
        s.locations.knife = 'player';
      });
      outcomes.add(run('throw knife at thief')[0].slice(0, 12));
    }
    expect([...outcomes].sort()).toEqual(['You evidentl', 'You missed. '].sort());
  });

  it('talking to Zork’s characters gets their own replies (review fix)', () => {
    const thief = () => at('ew_passage', 2, (s) => (s.npcs = { thief: { room: 'ew_passage', hidden: false } }));
    for (const c of ['talk to thief', 'ask thief about bag', 'tell thief about bag']) expect(thief().run(c)[0]).toBe('The thief is a strong, silent type.');
    const asleep = () => at('cyclops_room', 2, (s) => (s.flags.cyclops_asleep = true));
    for (const c of ['talk to cyclops', 'tell cyclops about food', 'cyclops, hello']) expect(asleep().run(c)[0]).toBe('No use talking to him. He’s fast asleep.');
    expect(at('troll_room', 2).run('troll, hello')[0]).toBe('The troll isn’t much of a conversationalist.');
  });

  it('leaves sacred and hidden things alone: the platinum bar until the echo, the buried trunk', () => {
    const robbed = (flags: string[], item: string, hidden = false) => {
      for (let seed = 1; seed <= 200; seed++) {
        const { state, run } = at('living_room', seed, (s) => {
          s.npcs = { thief: { room: 'ns_passage', hidden: true } };
          s.locations[item] = 'loud_room';
          s.visited.push('loud_room');
          for (const f of flags) s.flags[f] = true;
          if (hidden) s.itemState[item] = { ...s.itemState[item], hidden: true };
        });
        for (let i = 0; i < 3; i++) run('look');
        if (state.locations[item] !== 'loud_room') return true;
      }
      return false;
    };
    expect(robbed([], 'bar')).toBe(false);
    expect(robbed(['loud_flag', 'unsacred_bar'], 'bar')).toBe(true);
    expect(robbed([], 'trunk', true)).toBe(false);
  });

  it('taking your only light says so once: his line, not the engine’s too', () => {
    let checked = false;
    for (let seed = 1; seed <= 400 && !checked; seed++) {
      const { state, run } = at('ns_passage', seed, (s) => {
        s.locations.lamp = null;
        s.locations.torch = 'player';
        s.itemState.torch = { on: true, moved: true };
        s.npcs = { thief: { room: 'ns_passage', hidden: false } };
        s.flags.thief_here = true;
      });
      const lines = run('look');
      if (state.locations.torch === 'player') continue;
      if (!lines.some((l) => l.includes('left you in the dark'))) continue;
      checked = true;
      expect(lines.filter((l) => /pitch black/i.test(l))).toEqual([]);
    }
    expect(checked).toBe(true);
  });
});
