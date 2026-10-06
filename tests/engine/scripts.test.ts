import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import { roll } from '@/engine/rng';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const world: World = {
  ...fixtureWorld,
  scripts: {
    coin_flip: (ctx) => (ctx.random() < 0.5 ? ['Heads.'] : ['Tails.']),
    greet: (ctx) => [`Hello, ${ctx.arg}.`, { set: 'greeted' }],
    where: (ctx) => [`${ctx.room()} ${ctx.holder('cudgel')} ${ctx.carried('wallet')} ${ctx.npc('guard')?.strength ?? 'unhurt'}`],
    meddle: (ctx) => {
      (ctx.state as { currentRoom: string }).currentRoom = 'yard';
      return [];
    },
    nothing: () => undefined,
    explode: () => {
      throw new Error('boom');
    },
  },
};

describe('scripts', () => {
  it('return steps the engine runs', () => {
    const s = stateWith(world);
    expect(runSteps([{ script: 'greet', arg: 'Bob' }], world, s)).toEqual(['Hello, Bob.']);
    expect(s.flags.greeted).toBe(true);
  });

  it('see where things are', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(runSteps([{ script: 'where' }], world, s)).toEqual(['shed guard false unhurt']);
  });

  it('draw from the seeded generator, so a replay matches', () => {
    const a = stateWith(world);
    const b = structuredClone(a);
    expect(runSteps([{ script: 'coin_flip' }], world, a)).toEqual(runSteps([{ script: 'coin_flip' }], world, b));
    expect(a.rng).toBe(b.rng);
    expect(a.rng).not.toBe(stateWith(world).rng);
  });

  it('see the state read-only', () => {
    const s = stateWith(world);
    expect(() => runSteps([{ script: 'meddle' }], world, s)).toThrow();
    expect(s.currentRoom).not.toBe('yard');
  });

  it('a missing script, or one that returns nothing, does nothing', () => {
    const s = stateWith(world);
    const before = structuredClone(s);
    expect(runSteps([{ script: 'absent' }, { script: 'nothing' }], world, s)).toEqual([]);
    expect(s).toEqual(before);
  });

  it('a script that throws surfaces the error instead of half-running', () => {
    const s = stateWith(world);
    expect(() => runSteps([{ set: 'paid' }, { script: 'explode' }], world, s)).toThrow('boom');
  });

  it('roll is Zork’s RANDOM: 1 to n', () => {
    const s = stateWith(world);
    const rolls = Array.from({ length: 200 }, () => roll(s, 9));
    expect(Math.min(...rolls)).toBe(1);
    expect(Math.max(...rolls)).toBe(9);
  });
});
