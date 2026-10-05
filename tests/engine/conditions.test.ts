import { evaluateCondition } from '@/engine/conditions';
import type { GameState } from '@/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

function makeState(overrides: Partial<GameState> & { inventory?: string[] } = {}): GameState {
  const { inventory = [], ...rest } = overrides;
  return {
    currentRoom: 'somewhere',
    locations: Object.fromEntries(inventory.map((id) => [id, 'player'])),
    itemState: {},
    visited: [],
    flags: {},
    moveCount: 0,
    gameOver: false,
    firedEvents: [],
    ...rest,
  };
}

describe('evaluateCondition', () => {
  describe('flag:NAME', () => {
    it('returns true when the flag is set', () => {
      const state = makeState({ flags: { foo: true } });
      expect(evaluateCondition('flag:foo', state)).toBe(true);
    });

    it('returns false when the flag is not set', () => {
      const state = makeState();
      expect(evaluateCondition('flag:foo', state)).toBe(false);
    });

    it('returns false when the flag is explicitly false', () => {
      const state = makeState({ flags: { foo: false } });
      expect(evaluateCondition('flag:foo', state)).toBe(false);
    });
  });

  describe('!flag:NAME', () => {
    it('returns true when the flag is not set', () => {
      const state = makeState();
      expect(evaluateCondition('!flag:foo', state)).toBe(true);
    });

    it('returns false when the flag is set', () => {
      const state = makeState({ flags: { foo: true } });
      expect(evaluateCondition('!flag:foo', state)).toBe(false);
    });
  });

  describe('has:ITEM', () => {
    it('returns true when the item is in inventory', () => {
      const state = makeState({ inventory: ['stapler'] });
      expect(evaluateCondition('has:stapler', state)).toBe(true);
    });

    it('returns false when the item is not in inventory', () => {
      const state = makeState();
      expect(evaluateCondition('has:stapler', state)).toBe(false);
    });
  });

  describe('!has:ITEM', () => {
    it('returns true when the item is not in inventory', () => {
      const state = makeState();
      expect(evaluateCondition('!has:stapler', state)).toBe(true);
    });

    it('returns false when the item is in inventory', () => {
      const state = makeState({ inventory: ['stapler'] });
      expect(evaluateCondition('!has:stapler', state)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for an empty string', () => {
      expect(evaluateCondition('', makeState())).toBe(false);
    });

    it('returns false for whitespace-only', () => {
      expect(evaluateCondition('   ', makeState())).toBe(false);
    });

    it('trims surrounding whitespace before evaluating', () => {
      const state = makeState({ flags: { foo: true } });
      expect(evaluateCondition('  flag:foo  ', state)).toBe(true);
    });

    it('returns false for an unknown kind', () => {
      expect(evaluateCondition('weather:rain', makeState())).toBe(false);
    });

    it('returns false for a negated unknown kind', () => {
      // !weather:rain still routes through the unknown-kind branch (false), not negated true.
      expect(evaluateCondition('!weather:rain', makeState())).toBe(false);
    });
  });
});

describe('evaluateCondition — conjunctions', () => {
  it('requires every part joined with &', () => {
    const state = makeState({ currentRoom: 'lobby', inventory: ['wallet'], flags: { a: true } });
    expect(evaluateCondition('flag:a & has:wallet & in:lobby', state)).toBe(true);
    expect(evaluateCondition('flag:a & !flag:b', state)).toBe(true);
    expect(evaluateCondition('flag:a & flag:b', state)).toBe(false);
    expect(evaluateCondition('in:lobby & !has:wallet', state)).toBe(false);
  });
});

describe('world conditions', () => {
  it('visited, inside and has read the object tree', () => {
    const s = stateWith(fixtureWorld, { carrying: ['key'] });
    expect(evaluateCondition('visited:bedroom', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('visited:yard', s, fixtureWorld)).toBe(false);
    expect(evaluateCondition('inside:key:player', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('inside:wallet:living', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('!inside:wallet:yard', s, fixtureWorld)).toBe(true);
  });

  it('open, locked and on read item state', () => {
    const s = stateWith(fixtureWorld);
    s.itemState.lamp = { on: true };
    expect(evaluateCondition('on:lamp', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('on:bat', s, fixtureWorld)).toBe(false);
    expect(evaluateCondition('open:bat', s, fixtureWorld)).toBe(false);
    expect(evaluateCondition('locked:bat', s, fixtureWorld)).toBe(false);
  });

  it('here: is false without a world, so old callers stay safe', () => {
    const s = stateWith(fixtureWorld, { carrying: ['key'] });
    expect(evaluateCondition('here:key', s, fixtureWorld)).toBe(true);
    expect(evaluateCondition('here:key', s)).toBe(false);
    expect(evaluateCondition('here:crate', s, fixtureWorld)).toBe(false);
  });
});
