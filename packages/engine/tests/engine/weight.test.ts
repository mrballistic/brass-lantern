import { describe, expect, it } from 'vitest';
import { execute } from '../../src/engine/engine';
import { carriedWeight, loadLimit, weightOf } from '../../src/engine/weight';
import type { GameState } from '../../src/types/game';
import type { World } from '../../src/types/world';
import { carry, stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const world: World = {
  ...fixtureWorld,
  carry: { limit: 20, fumble: { over: 2, chance: 30 } },
  items: {
    ...fixtureWorld.items,
    bat: { ...fixtureWorld.items.bat, size: 15 },
    lamp: { ...fixtureWorld.items.lamp, size: 10 },
    jar: { ...fixtureWorld.items.jar, container: { ...fixtureWorld.items.jar.container!, weight: 6 } },
  },
};
// The reply only: the yard's dog barks every other turn.
const take = (s: GameState, t: string, w: World = world) => execute({ action: 'take', target: t }, { world: w, state: s }).lines.slice(0, 1);

describe('weight', () => {
  it('is an item’s size plus everything inside it; the default size is 5', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(weightOf(world, s, 'jar')).toBe(10); // the glass jar (5) holding the marble (5)
    carry(s, 'jar');
    expect(carriedWeight(world, s)).toBe(10);
    expect(loadLimit(world, s)).toBe(20);
  });

  it('refuses a take that would go over the limit, and changes nothing', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(take(s, 'bat')).toEqual(['Taken: bat.']);
    const before = structuredClone(s);
    expect(take(s, 'lamp')).toEqual(['[That’s too heavy to carry with everything else.]']);
    expect(s.locations.lamp).toBe('yard');
    expect({ ...s, turns: 0, moveCount: 0, rng: 0 }).toEqual({ ...before, turns: 0, moveCount: 0, rng: 0 });
  });

  it('uses Zork’s words in Infocom style, and mentions wounds when the limit is down', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'yard' });
    carry(s, 'bat');
    expect(take(s, 'lamp', w)).toEqual(['Your load is too heavy.']);
    s.player = { load: 18 };
    expect(take(s, 'lamp', w)).toEqual(['Your load is too heavy, especially in light of your condition.']);
  });

  it('fumbles a take past the count, by the seed, the same way every time', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const run = () => {
        const s = stateWith(world, { room: 'living' });
        carry(s, 'wallet', 'shirt', 'key');
        s.rng = seed;
        return take(s, 'rusty key')[0];
      };
      const first = run();
      expect(run()).toBe(first);
      outcomes.add(first);
    }
    expect([...outcomes].sort()).toEqual(['Taken: rusty key.', '[You’re carrying too many things.]'].sort());
  });

  it('a container’s weight limit refuses what doesn’t fit', () => {
    const s = stateWith(world, { room: 'shed' });
    carry(s, 'wallet');
    execute({ action: 'open', target: 'jar' }, { world, state: s });
    expect(execute({ action: 'put', target: 'wallet', indirect: 'jar', prep: 'in' }, { world, state: s }).lines).toEqual(['There’s no room in the glass jar.']);
  });

  it('worlds without carry have no limit', () => {
    const s = stateWith(fixtureWorld, { room: 'yard' });
    carry(s, 'wallet', 'shirt', 'key', 'rusty_key');
    expect(take(s, 'bat', fixtureWorld)).toEqual(['Taken: bat.']);
  });
});

describe('worn things (backlog clear-out)', () => {
  it('weigh 1 and don’t count toward the fumble count (Zork’s WEIGHT and CCOUNT)', async () => {
    const { fixtureWorld } = await import('../fixtures/world');
    const { stateWith } = await import('../helpers/state');
    const { carriedWeight, carriedCount } = await import('../../src/engine/weight');
    const w = { ...fixtureWorld, carry: { limit: 100 }, items: { ...fixtureWorld.items, shirt: { ...fixtureWorld.items.shirt, size: 8 } } };
    const s = stateWith(w, { room: 'bedroom', carrying: ['shirt'] });
    expect(carriedWeight(w, s)).toBe(8);
    expect(carriedCount(w, s)).toBe(1);
    s.firedEvents.push(w.items.shirt.onWear!);
    expect(carriedWeight(w, s)).toBe(1);
    expect(carriedCount(w, s)).toBe(0);
  });
});
