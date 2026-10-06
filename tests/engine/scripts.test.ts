import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import { execute } from '@/engine/engine';
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

  it('a character’s state is read-only too', () => {
    const w: World = { ...world, scripts: { ...world.scripts, kill: (ctx) => { (ctx.npc('guard') as { strength: number }).strength = 0; return []; } } };
    const s = stateWith(w, { room: 'shed' });
    s.npcs = { guard: { strength: 2 } };
    expect(() => runSteps([{ script: 'kill' }], w, s)).toThrow();
    expect(s.npcs.guard.strength).toBe(2);
  });

  it('can read characters’ rooms, room order, visits, treasures, tags, light and contents', () => {
    const w: World = {
      ...world,
      rooms: { ...world.rooms, cellar: { ...world.rooms.cellar, tags: ['deep'] } },
      scripts: { look: (ctx) => [`${ctx.npcIn('guard', 'shed')} ${ctx.rooms()[0]} ${ctx.visited('bedroom')} ${ctx.treasure('coin')} ${ctx.tags('cellar').join()} ${ctx.lit('bedroom')} ${ctx.children('chest').join()}`] },
    };
    expect(runSteps([{ script: 'look' }], w, stateWith(w))).toEqual(['true bedroom true 2 deep true coin']);
  });
});

describe('a script that throws (fast follow)', () => {
  it('leaves the turn as it found it, seed included, and still surfaces the error', () => {
    const w: World = {
      ...fixtureWorld,
      scripts: { ...fixtureWorld.scripts, boom: (ctx) => { void ctx.roll(6); throw new Error('boom'); } },
      events: { ...fixtureWorld.events, half: [{ set: 'half_done' }, 'Half.', { script: 'boom' }] },
      verbs: { ...fixtureWorld.verbs, explode: { words: ['explode'], target: 'none' } },
      rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, instead: { ...fixtureWorld.rooms.bedroom.instead, explode: [{ then: 'half' }] } } },
    };
    const s = stateWith(w, { room: 'bedroom' });
    const before = structuredClone(s);
    expect(() => execute({ action: 'explode' }, { world: w, state: s })).toThrow('boom');
    expect(s).toEqual(before);
  });
});
