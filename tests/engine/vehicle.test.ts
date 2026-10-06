import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '@/engine/conditions';
import { runSteps } from '@/engine/effects';
import { execute } from '@/engine/engine';
import { migrateSave } from '@/engine/migrate';
import { fallbackParse } from '@/engine/parser';
import { SAVE_VERSION, type ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

// A raft in the yard; the cellar is water (a flooded cellar).
export const boatWorld: World = {
  ...fixtureWorld,
  style: 'infocom',
  rooms: {
    ...fixtureWorld.rooms,
    yard: { ...fixtureWorld.rooms.yard, items: [...fixtureWorld.rooms.yard.items, 'raft'] },
    cellar: { ...fixtureWorld.rooms.cellar, water: true },
  },
  items: {
    ...fixtureWorld.items,
    raft: { name: 'raft', description: 'A raft.', portable: true, tags: [], vehicle: { travels: 'water' }, container: { open: true } },
  },
};
const run = (s: ReturnType<typeof stateWith>, a: ParsedAction, w: World = boatWorld) => execute(a, { world: w, state: s });

describe('boarding and leaving', () => {
  it('BOARD gets in, with Zork’s refusals', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    expect(run(s, { action: 'board', target: 'bat' }).lines).toEqual(['You have a theory on how to board a bat, perhaps?']);
    // (The yard's dog barks after any turn there: only the first line is the reply.)
    expect(run(s, { action: 'board', target: 'raft' }).lines[0]).toBe('You are now in the raft.');
    expect(s.aboard).toBe('raft');
    expect(run(s, { action: 'board', target: 'raft' }).lines[0]).toBe('You are already in the raft!');
  });
  it('the vehicle must be on the ground', () => {
    const s = stateWith(boatWorld, { room: 'yard', carrying: ['raft'] });
    expect(run(s, { action: 'board', target: 'raft' }).lines).toEqual(['The raft must be on the ground to be boarded.']);
  });
  it('DISEMBARK gets out, but not on water', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    expect(run(s, { action: 'disembark' }).lines[0]).toBe('You’re not in that!');
    s.aboard = 'raft';
    expect(run(s, { action: 'disembark' }).lines[0]).toBe('You are on your own feet again.');
    expect(s.aboard).toBeUndefined();
    const w = stateWith(boatWorld, { room: 'cellar' });
    w.locations.raft = 'cellar';
    w.aboard = 'raft';
    expect(run(w, { action: 'disembark' }).lines).toEqual(['You realize that getting out here would be fatal.']);
  });
  it('aboard: DROP puts things in the vehicle, TAKE vehicle refuses, room things stay in reach', () => {
    const s = stateWith(boatWorld, { room: 'yard', carrying: ['key'] });
    s.aboard = 'raft';
    run(s, { action: 'drop', target: 'key' });
    expect(s.locations.key).toBe('raft');
    expect(run(s, { action: 'take', target: 'raft' }).lines[0]).toBe('You’re inside of it!');
    expect(run(s, { action: 'take', target: 'bat' }).lines.join(' ')).toMatch(/Taken/);
  });
  it('parses BOARD, GET IN, DISEMBARK, GET OUT; bare EXIT stays a direction', () => {
    expect(fallbackParse('board raft')).toEqual({ action: 'board', target: 'raft' });
    expect(fallbackParse('get in the raft')).toEqual({ action: 'board', target: 'raft' });
    expect(fallbackParse('disembark')).toEqual({ action: 'disembark' });
    expect(fallbackParse('get out of raft')).toEqual({ action: 'disembark', target: 'raft' });
    expect(fallbackParse('exit')).toEqual({ action: 'go', target: 'out' });
    expect(fallbackParse('stand up')).toEqual({ action: 'disembark' });
  });
});

describe('conditions, helpers and effects', () => {
  it('aboard and water', () => {
    const s = stateWith(boatWorld, { room: 'cellar' });
    s.locations.raft = 'cellar';
    expect(evaluateCondition('water:here', s, boatWorld)).toBe(true);
    expect(evaluateCondition('water:yard', s, boatWorld)).toBe(false);
    expect(evaluateCondition('aboard', s, boatWorld)).toBe(false);
    runSteps([{ board: 'raft' }], boatWorld, s);
    expect(evaluateCondition('aboard:raft', s, boatWorld)).toBe(true);
    runSteps([{ disembark: true }], boatWorld, s);
    expect(s.aboard).toBeUndefined();
  });
  it('water can be a condition (a reservoir that drains)', () => {
    const w: World = { ...boatWorld, rooms: { ...boatWorld.rooms, cellar: { ...boatWorld.rooms.cellar, water: '!flag:drained' } } };
    const s = stateWith(w, { room: 'cellar' });
    expect(evaluateCondition('water:here', s, w)).toBe(true);
    s.flags.drained = true;
    expect(evaluateCondition('water:here', s, w)).toBe(false);
  });
  it('scripts read aboard() and water()', () => {
    let seen: unknown;
    const w: World = { ...boatWorld, scripts: { peek: (ctx) => void (seen = [ctx.aboard(), ctx.water(), ctx.water('cellar')]) } };
    const s = stateWith(w, { room: 'yard' });
    s.aboard = 'raft';
    runSteps([{ script: 'peek' }], w, s);
    expect(seen).toEqual(['raft', false, true]);
  });
  it('a script moving the vehicle away leaves the player aboard nothing', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    s.aboard = 'raft';
    runSteps([{ move: 'raft', to: null }], boatWorld, s);
    expect(s.aboard).toBeUndefined();
  });
  it('saves without `aboard` load not aboard, and with it, aboard', () => {
    const s = stateWith(boatWorld, { room: 'yard' });
    expect(migrateSave(boatWorld, { version: SAVE_VERSION, gameState: JSON.parse(JSON.stringify(s)), outputHistory: [] })?.gameState.aboard).toBeUndefined();
    s.aboard = 'raft';
    expect(migrateSave(boatWorld, { version: SAVE_VERSION, gameState: JSON.parse(JSON.stringify(s)), outputHistory: [] })?.gameState.aboard).toBe('raft');
  });
});

describe('the audit knows vehicles', () => {
  it('checks water conditions and board effects', async () => {
    const { auditWorld } = await import('../helpers/audit');
    const w: World = {
      ...boatWorld,
      rooms: { ...boatWorld.rooms, cellar: { ...boatWorld.rooms.cellar, water: 'flag:x & in:nowhere7' } },
      events: { ...boatWorld.events, hop: [{ board: 'nothing8' }, { disembark: true }] },
    };
    const p = auditWorld(w).join('\n');
    expect(p).toContain('nowhere7');
    expect(p).toContain('nothing8');
    expect(p).not.toMatch(/unknown effect/);
  });
});
