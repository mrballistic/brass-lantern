import { describe, expect, it } from 'vitest';
import { execute } from '../../src/engine/engine';
import type { GameState } from '../../src/types/game';
import type { World } from '../../src/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const world: World = {
  ...fixtureWorld,
  vars: { ticks: 0 },
  daemons: [
    { if: 'in:bedroom', then: [{ add: 'ticks', by: 1 }] },
    { if: 'var:ticks=2', then: ['Two ticks.'] },
  ],
  events: {
    ...fixtureWorld.events,
    alarm_bell: ['🔔 Ring!'],
    start_timer: [{ schedule: 'alarm_bell', in: 2 }],
  },
  items: {
    ...fixtureWorld.items,
    bed: { ...fixtureWorld.items.bed, onUse: [{ then: 'start_timer' }] },
  },
};
const run = (s: GameState, action: string, target?: string, w: World = world) =>
  execute(target ? { action, target } : { action }, { world: w, state: s });

describe('daemons and fuses', () => {
  it('daemons run after each acted-on turn, in order, when their condition holds', () => {
    const s = stateWith(world);
    run(s, 'look');
    expect(s.vars?.ticks).toBe(1);
    expect(run(s, 'look').lines).toContain('Two ticks.');
  });

  it('nothing runs on a miss', () => {
    const s = stateWith(world);
    const before = structuredClone(s);
    expect(run(s, 'take', 'unicorn').understood).toBe(false);
    expect(s).toEqual(before);
  });

  it('a fuse fires after its count of acted-on turns, not the turn it was set', () => {
    const s = stateWith(world);
    expect(run(s, 'use', 'bed').lines).not.toContain('🔔 Ring!');
    expect(run(s, 'look').lines).not.toContain('🔔 Ring!');
    expect(run(s, 'look').lines).toContain('🔔 Ring!');
    expect(s.fuses?.alarm_bell).toBeUndefined();
  });

  it('rescheduling a pending fuse restarts its count, as a fresh schedule would', () => {
    const s = stateWith(world);
    run(s, 'use', 'bed'); // alarm_bell: 2
    run(s, 'look'); // 1
    run(s, 'use', 'bed'); // reset to 2; not counted down this turn
    expect(s.fuses?.alarm_bell).toBe(2);
    expect(run(s, 'look').lines).not.toContain('🔔 Ring!');
    expect(run(s, 'look').lines).toContain('🔔 Ring!');
  });

  it('cancel removes a pending fuse', () => {
    const s = stateWith(world);
    s.fuses = { alarm_bell: 2 }; // counts down to 1 first, then the daemon cancels it
    run(s, 'look', undefined, { ...world, daemons: [{ if: 'in:bedroom', then: [{ cancel: 'alarm_bell' }] }] });
    expect(s.fuses?.alarm_bell).toBeUndefined();
  });

  it('a daemon can name an event', () => {
    const s = stateWith(world);
    expect(run(s, 'look', undefined, { ...world, daemons: [{ if: 'in:bedroom', then: 'alarm_bell' }] }).lines).toContain('🔔 Ring!');
  });

  it('a daemon’s state changes are saved', () => {
    const s = stateWith(world);
    expect(run(s, 'look').mutated).toBe(true);
  });

  it('ambient lines still work, as daemons', () => {
    const s = stateWith(fixtureWorld, { room: 'yard' });
    run(s, 'look', undefined, fixtureWorld);
    expect(run(s, 'look', undefined, fixtureWorld).lines).toContain('A dog barks.');
  });
});

describe('WAIT’s extra turns (fast follow)', () => {
  const base = (daemon: World['daemons']): World => ({ ...fixtureWorld, wait: { turns: 3 }, daemons: daemon, events: { ...fixtureWorld.events, ring: ['Ring!'] } });
  it('a fuse scheduled on the first turn counts down on the others', () => {
    const w = base([{ if: '!flag:armed', then: [{ set: 'armed' }, { schedule: 'ring', in: 2 }] }]);
    const s = stateWith(w, { room: 'bedroom' });
    expect(execute({ action: 'wait' }, { world: w, state: s }).lines).toContain('Ring!');
  });
  it('a fuse cancelled silently doesn’t end the wait', () => {
    const w = { ...base([{ if: '!flag:hushed', then: [{ set: 'hushed' }, { cancel: 'quiet' }] }]), events: { ...fixtureWorld.events, ring: ['Ring!'], quiet: ['Shh.'] } };
    const s = stateWith(w, { room: 'bedroom' });
    s.fuses = { ring: 2, quiet: 5 };
    expect(execute({ action: 'wait' }, { world: w, state: s }).lines).toContain('Ring!');
  });
});

describe('a stale fired mark (backlog clear-out)', () => {
  it('a turn that throws after a timer fired doesn’t cut the next WAIT short', () => {
    const w: World = {
      ...fixtureWorld,
      wait: { turns: 3 },
      events: { ...fixtureWorld.events, pop: [], ring: ['Ring!'] },
      scripts: { ...fixtureWorld.scripts, boom: () => { throw new Error('boom'); } },
      daemons: [{ if: 'flag:explode', then: [{ script: 'boom' }] }],
    };
    const s = stateWith(w, { room: 'bedroom' });
    s.fuses = { pop: 1 };
    s.flags.explode = true;
    expect(() => execute({ action: 'look' }, { world: w, state: s })).toThrow('boom');
    s.flags.explode = false;
    s.fuses = { ring: 3 };
    expect(execute({ action: 'wait' }, { world: w, state: s }).lines).toContain('Ring!');
  });
});
