import { describe, expect, it } from 'vitest';
import { captureLine } from '@/engine/engine';
import type { World } from '@/types/world';
import { play } from '../helpers/play';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const w: World = {
  ...fixtureWorld,
  rooms: { ...fixtureWorld.rooms, shed: { ...fixtureWorld.rooms.shed, requires: undefined, capture: { if: '!flag:quiet', script: 'echo' } } },
  scripts: {
    echo: (ctx) => {
      const line = ctx.line!.trim().toLowerCase();
      if (line === 'south' || line === 'out') return; // declines: normal parsing
      if (line === 'roll') {
        ctx.roll(6);
        return; // declines after rolling: must not advance the seed
      }
      if (line === 'echo') return ['The acoustics change.', { set: 'quiet' }, { free: true }];
      return [`${line} ${line}...`, { free: true }];
    },
  },
};

describe('line capture', () => {
  it('takes a piece before parsing, with no time passing', () => {
    const s = stateWith(w, { room: 'shed' });
    expect(captureLine(w, s, 'xyzzy')?.lines).toEqual(['xyzzy xyzzy...']);
    expect(s.moveCount).toBe(0);
  });
  it('declines without changing anything, even after rolling', () => {
    const s = stateWith(w, { room: 'shed' });
    const before = JSON.stringify(s);
    expect(captureLine(w, s, 'roll')).toBeNull();
    expect(captureLine(w, s, 'south')).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });
  it('stops once its condition fails', () => {
    const s = stateWith(w, { room: 'shed' });
    expect(captureLine(w, s, 'echo')?.lines).toEqual(['The acoustics change.']);
    expect(captureLine(w, s, 'anything')).toBeNull();
  });
  it('only where the player is, and never after the game ends', () => {
    expect(captureLine(w, stateWith(w, { room: 'yard' }), 'anything')).toBeNull();
    const t = stateWith(w, { room: 'shed' });
    t.gameOver = true;
    expect(captureLine(w, t, 'anything')).toBeNull();
  });
  it('a taken piece ends the line', () => {
    const { text, state } = play({ ...w, startRoom: 'shed' }, ['hello. south']);
    expect(text).toContain('hello hello...');
    expect(state.currentRoom).toBe('shed');
  });
  it('a declined piece runs normally', () => {
    const { state } = play({ ...w, startRoom: 'shed' }, ['south']);
    expect(state.currentRoom).toBe('yard');
  });
  it('a world capture runs after the room’s', () => {
    const ww: World = { ...w, capture: { script: 'always' }, scripts: { ...w.scripts, always: () => ['World.', { free: true }] } };
    expect(captureLine(ww, stateWith(ww, { room: 'yard' }), 'jump')?.lines).toEqual(['World.']);
    expect(captureLine(ww, stateWith(ww, { room: 'shed' }), 'blah')?.lines).toEqual(['blah blah...']);
  });
});

describe('the audit checks captures', () => {
  it('flags a missing script and a bad condition', async () => {
    const { auditWorld } = await import('../helpers/audit');
    const bad: World = { ...fixtureWorld, capture: { if: 'in:nowhere', script: 'nope' }, rooms: { ...fixtureWorld.rooms, yard: { ...fixtureWorld.rooms.yard, capture: { script: 'gone' } } } };
    const problems = auditWorld(bad).join('\n');
    expect(problems).toMatch(/capture.*nope/);
    expect(problems).toMatch(/capture.*gone/);
    expect(problems).toMatch(/capture.*nowhere/);
  });
});
