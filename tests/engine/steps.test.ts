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
