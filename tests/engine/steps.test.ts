import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { runSteps } from '@/engine/effects';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

describe('conditional steps', () => {
  it('run then or else by a condition', () => {
    const s = stateWith(fixtureWorld, { room: 'living' });
    expect(runSteps([{ if: 'in:living', then: ['here'], else: ['away'] }], fixtureWorld, s)).toEqual(['here']);
    expect(runSteps([{ if: 'in:yard', then: ['here'], else: ['away'] }], fixtureWorld, s)).toEqual(['away']);
    expect(runSteps([{ if: 'in:yard', then: ['here'] }], fixtureWorld, s)).toEqual([]);
  });
});

describe('quiet go', () => {
  it('moves without describing', () => {
    const s = stateWith(fixtureWorld, { room: 'living' });
    expect(runSteps([{ go: 'yard', quiet: true }], fixtureWorld, s)).toEqual([]);
    expect(s.currentRoom).toBe('yard');
    expect(s.visited).toContain('yard');
  });
  it('into a dark room: no lines, and not visited until lit', () => {
    const s = stateWith(fixtureWorld, { room: 'shed' });
    expect(runSteps([{ go: 'cellar', quiet: true }], fixtureWorld, s)).toEqual([]);
    expect(s.currentRoom).toBe('cellar');
    expect(s.visited).not.toContain('cellar');
  });
});

describe('unvisit', () => {
  it('makes the next arrival show the full description again', () => {
    const w: World = { ...fixtureWorld, style: 'infocom' };
    const s = stateWith(w, { room: 'living' });
    const go = (to: string) => execute({ action: 'go', target: to }, { world: w, state: s }).lines.join(' ');
    expect(go('outside')).toContain('A yard.');
    go('in');
    expect(go('outside')).not.toContain('A yard.');
    go('in');
    runSteps([{ unvisit: 'yard' }], w, s);
    expect(go('outside')).toContain('A yard.');
  });
});

describe('free steps', () => {
  it('make the turn take no time', () => {
    const w: World = {
      ...fixtureWorld,
      events: { ...fixtureWorld.events, pause: ['Hm.', { free: true }] },
      rooms: { ...fixtureWorld.rooms, living: { ...fixtureWorld.rooms.living, instead: { snooze: [{ then: 'pause' }] } } },
    };
    const s = stateWith(w, { room: 'living' });
    const r = execute({ action: 'snooze' }, { world: w, state: s });
    expect(r.lines).toEqual(['Hm.']);
    expect(s.moveCount).toBe(0);
  });
});

describe('noDarkLine', () => {
  const w: World = {
    ...fixtureWorld,
    events: { ...fixtureWorld.events, snuff: ['You are left in the dark.', { switch: 'lamp', on: false }, { noDarkLine: true }], snuffed: [{ switch: 'lamp', on: false }] },
    rooms: { ...fixtureWorld.rooms, cellar: { ...fixtureWorld.rooms.cellar, instead: { snooze: [{ if: 'flag:loud', then: 'snuffed' }, { then: 'snuff' }] } } },
  };
  it('stops the engine’s own darkness line after a step already said it', () => {
    const s = stateWith(w, { room: 'cellar', carrying: ['lamp'] });
    s.itemState.lamp = { on: true };
    expect(execute({ action: 'snooze' }, { world: w, state: s }).lines).toEqual(['You are left in the dark.']);
  });
  it('without it, the engine says it', () => {
    const s = stateWith(w, { room: 'cellar', carrying: ['lamp'], flags: ['loud'] });
    s.itemState.lamp = { on: true };
    expect(execute({ action: 'snooze' }, { world: w, state: s }).lines.join(' ')).toMatch(/pitch black/i);
  });
});

describe('scripts see the line and can parse', () => {
  it('ctx.parse reads a command with the world’s verbs', () => {
    let seen: unknown;
    const w: World = { ...fixtureWorld, scripts: { peek: (ctx) => void (seen = ctx.parse('take the key')) } };
    runSteps([{ script: 'peek' }], w, stateWith(w));
    expect(seen).toEqual({ action: 'take', target: 'key' });
  });
});

describe('the audit knows the new steps', () => {
  it('checks rooms and conditions inside them', async () => {
    const { auditWorld } = await import('../helpers/audit');
    const w: World = {
      ...fixtureWorld,
      events: { ...fixtureWorld.events, odd: [{ unvisit: 'nowhere' }, { if: 'in:nowhere', then: [{ go: 'nowhere' }] }, { free: true }, { noDarkLine: true }, { go: 'yard', quiet: true }] },
    };
    const problems = auditWorld(w).filter((p) => p.includes('odd'));
    expect(problems.some((p) => p.includes('unvisit'))).toBe(true);
    expect(problems.some((p) => p.includes('go names no room'))).toBe(true);
    expect(problems.some((p) => /nowhere/.test(p) && /room/.test(p) && !p.includes('go names'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown') || p.includes('not an effect'))).toBe(false);
  });
});

describe('Zork’s WAIT: several clock ticks (5a)', () => {
  const base: World = { ...fixtureWorld, wait: { turns: 3 }, vars: { ticks: 0 }, daemons: [{ if: 'in:living', then: [{ add: 'ticks', by: 1 }] }] };
  it('runs the clock up to `turns` times, a move each', () => {
    const s = stateWith(base, { room: 'living' });
    execute({ action: 'wait' }, { world: base, state: s });
    expect(s.vars.ticks).toBe(3);
    expect(s.moveCount).toBe(3);
  });
  it('stops after a tick that printed something or fired a fuse', () => {
    const w: World = { ...base, daemons: [...base.daemons!, { if: 'var:ticks=2', then: ['Tick two.'] }] };
    const s = stateWith(w, { room: 'living' });
    const r = execute({ action: 'wait' }, { world: w, state: s });
    expect(r.lines.at(-1)).toBe('Tick two.');
    expect(s.vars.ticks).toBe(2);
    const f: World = { ...base, events: { ...base.events, boom: [{ set: 'boomed' }] } };
    const t = stateWith(f, { room: 'living' });
    t.fuses = { boom: 1 };
    execute({ action: 'wait' }, { world: f, state: t });
    expect(t.flags.boomed).toBe(true);
    expect(t.vars.ticks).toBe(1);
  });
  it('other commands tick once', () => {
    const s = stateWith(base, { room: 'living' });
    execute({ action: 'look' }, { world: base, state: s });
    expect(s.vars.ticks).toBe(1);
  });
});

describe('room end routines (Zork’s M-END) (5a)', () => {
  const w: World = {
    ...fixtureWorld,
    wait: { turns: 3 },
    rooms: { ...fixtureWorld.rooms, living: { ...fixtureWorld.rooms.living, onEnd: [{ if: 'in:living', then: ['The floor creaks.'] }] } },
    daemons: [{ if: 'in:living', then: ['Tock.'] }],
  };
  it('run after the action and before the clock, without stopping a WAIT', () => {
    const s = stateWith(w, { room: 'living' });
    expect(execute({ action: 'look' }, { world: w, state: s }).lines.slice(-2)).toEqual(['The floor creaks.', 'Tock.']);
    const t = stateWith({ ...w, daemons: [] }, { room: 'living' });
    const r = execute({ action: 'wait' }, { world: { ...w, daemons: [] }, state: t });
    expect(r.lines.at(-1)).toBe('The floor creaks.');
    expect(t.moveCount).toBe(3);
  });
});

describe('unlist and relist (Zork’s NDESCBIT, set in play) (5a)', () => {
  it('keeps a thing where it is but out of the room’s list', () => {
    const s = stateWith(fixtureWorld, { room: 'living' });
    runSteps([{ unlist: 'wallet' }], fixtureWorld, s);
    const look = execute({ action: 'look' }, { world: fixtureWorld, state: s }).lines.join(' ');
    expect(look).not.toContain('wallet');
    expect(execute({ action: 'examine', target: 'wallet' }, { world: fixtureWorld, state: s }).understood).not.toBe(false);
    runSteps([{ relist: 'wallet' }], fixtureWorld, s);
    expect(execute({ action: 'look' }, { world: fixtureWorld, state: s }).lines.join(' ')).toContain('wallet');
  });
});

describe('shared fixtures (5a)', () => {
  it('a fixture moved by an effect is no longer seen where it started', async () => {
    const { visibleItems } = await import('@/engine/model');
    const s = stateWith(fixtureWorld, { room: 'shed' });
    runSteps([{ move: 'socket', to: 'yard' }], fixtureWorld, s);
    expect(visibleItems(fixtureWorld, s)).not.toContain('socket');
  });
});

describe('look steps (5a)', () => {
  it('describe the room in full, as LOOK does', () => {
    const w: World = { ...fixtureWorld, style: 'infocom' };
    const s = stateWith(w, { room: 'living' });
    s.visited.push('living');
    expect(runSteps([{ look: true }], w, s).join(' ')).toContain('A living room with a table by the door.');
  });
});
