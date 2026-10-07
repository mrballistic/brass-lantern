import { conditionProblems, evaluateCondition } from '@/engine/conditions';
import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
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

describe('conditionProblems', () => {
  it('accepts every kind with things that exist, and reports the rest', () => {
    expect(conditionProblems('flag:any & !has:wallet & in:living & var:x>=2 & carrying<3 & lit:here & inside:wallet:player', fixtureWorld)).toEqual([]);
    expect(conditionProblems('has:unicorn', fixtureWorld)).toEqual(['“has:unicorn” names no item “unicorn”']);
    expect(conditionProblems('visited:mars', fixtureWorld)).toEqual(['“visited:mars” names no room “mars”']);
    expect(conditionProblems('inside:wallet:mars', fixtureWorld)).toEqual(['“inside:wallet:mars” names no place “mars”']);
    expect(conditionProblems('wibble:x', fixtureWorld)).toEqual(['unknown condition “wibble:x”']);
    expect(conditionProblems('number<=8', fixtureWorld)).toEqual([]);
    expect(conditionProblems('number:4', fixtureWorld)).toEqual([]);
    expect(conditionProblems('number<=x', fixtureWorld)).not.toEqual([]);
  });
});

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

describe('conditionProblems and characters', () => {
  it('has: and on: name items only; here: can name a person', () => {
    expect(conditionProblems('has:neighbor', fixtureWorld)).toEqual(['“has:neighbor” names no item “neighbor”']);
    expect(conditionProblems('on:neighbor', fixtureWorld)).toEqual(['“on:neighbor” names no item “neighbor”']);
    expect(conditionProblems('here:neighbor', fixtureWorld)).toEqual([]);
  });
});

describe('heaviest<=N (5c)', () => {
  it('is the heaviest thing held, a container counted with its contents', () => {
    const w: World = {
      ...fixtureWorld,
      items: {
        ...fixtureWorld.items,
        feather: { name: 'feather', description: '', portable: true, tags: [], size: 1 },
        pouch: { name: 'pouch', description: '', portable: true, tags: [], size: 2, container: { open: true } },
        rock: { name: 'rock', description: '', portable: true, tags: [], size: 3 },
      },
    };
    const s = stateWith(w, { room: 'bedroom' });
    expect(evaluateCondition('heaviest<=4', s, w)).toBe(true); // empty hands: 0
    s.locations.feather = 'player';
    s.locations.pouch = 'player';
    expect(evaluateCondition('heaviest<=4', s, w)).toBe(true); // 1 and 2
    s.locations.rock = 'pouch';
    expect(evaluateCondition('heaviest<=4', s, w)).toBe(false); // pouch 2 + rock 3
    expect(evaluateCondition('heaviest=5', s, w)).toBe(true);
    expect(evaluateCondition('!heaviest>4', s, w)).toBe(false);
  });
  it('the audit knows the form and catches a malformed one', () => {
    expect(conditionProblems('heaviest<=4', fixtureWorld)).toEqual([]);
    expect(conditionProblems('heaviest<4x', fixtureWorld)).not.toEqual([]);
  });
});

describe('score<op>N (5d)', () => {
  it('is the score SCORE prints, vars.score included', () => {
    const w: World = { ...fixtureWorld, scoring: [{ flag: 'a', points: 10 }, { if: 'flag:b', points: 5 }] };
    const s = stateWith(w, { room: 'bedroom' });
    expect(evaluateCondition('score=0', s, w)).toBe(true);
    s.flags.a = true;
    s.flags.b = true;
    s.vars = { ...s.vars, score: 3 };
    expect(evaluateCondition('score>=18', s, w)).toBe(true);
    expect(evaluateCondition('score>18', s, w)).toBe(false);
    expect(evaluateCondition('!score<18', s, w)).toBe(true);
  });
  it('the audit knows the form and catches a malformed one', () => {
    expect(conditionProblems('score>=350', fixtureWorld)).toEqual([]);
    expect(conditionProblems('score>=x', fixtureWorld)).not.toEqual([]);
  });
});

describe('held:ITEM', () => {
  it('is true for a thing inside a carried closed box, where has: is false', () => {
    const w: World = {
      ...fixtureWorld,
      items: {
        ...fixtureWorld.items,
        sock: { name: 'sock', description: 'A sock.', portable: true, tags: [] },
        box: { name: 'box', description: 'A box.', portable: true, tags: [], container: { openable: true } },
      },
    };
    const s = stateWith(w, { room: 'bedroom', carrying: ['box'] });
    s.locations.sock = 'box';
    expect(evaluateCondition('held:sock', s, w)).toBe(true);
    expect(evaluateCondition('has:sock', s, w)).toBe(false);
    expect(evaluateCondition('!held:sock', s, w)).toBe(false);
    expect(evaluateCondition('held:box', s, w)).toBe(true);
    s.locations.sock = 'bedroom';
    expect(evaluateCondition('held:sock', s, w)).toBe(false);
    expect(conditionProblems('held:sock', w)).toEqual([]);
    expect(conditionProblems('held:unicorn', w)).toEqual(['“held:unicorn” names no item “unicorn”']);
  });
});
