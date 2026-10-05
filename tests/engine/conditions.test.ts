import { evaluateCondition } from '@/engine/conditions';
import type { GameState } from '@/types/game';

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
