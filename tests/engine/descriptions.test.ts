import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import type { GameState } from '@/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (s: GameState, action: string, target?: string) => execute(target ? { action, target } : { action }, { world, state: s });

describe('descriptions', () => {
  it('an item uses its initial sentence until moved, then its room sentence', () => {
    const s = stateWith(world, { room: 'living' });
    const first = describeCurrentRoom(world, s);
    expect(first).toContain('A wallet lies by the door.');
    expect(first.join('\n')).not.toMatch(/You can see:.*wallet/);
    run(s, 'take', 'wallet');
    run(s, 'drop', 'wallet');
    const lines = describeCurrentRoom(world, s);
    expect(lines).toContain('Someone dropped a wallet here.');
    expect(lines).not.toContain('A wallet lies by the door.');
  });

  it('a room’s first description shows on the first visit only', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['key'] });
    expect(run(s, 'go', 'shed').lines).toContain(world.rooms.shed.firstDescription);
    run(s, 'go', 'out');
    const again = run(s, 'go', 'shed').lines;
    expect(again).toContain(world.rooms.shed.description);
    expect(again).not.toContain(world.rooms.shed.firstDescription);
    expect(run(s, 'look').lines).toContain(world.rooms.shed.description);
  });

  it('the opening uses the start room’s first description when it has one', () => {
    const w = { ...world, startRoom: 'shed' };
    const lines = openingLines(w, initialState(w));
    expect(lines).toContain(world.rooms.shed.firstDescription);
  });

  it('READ shows text, or falls back to the description', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key'] });
    expect(run(s, 'read', 'book').lines).toEqual(['“It was a dark and stormy night.”']);
    expect(run(s, 'read', 'crate').lines).toEqual(['A nailed-shut crate.']);
    const before = structuredClone(s);
    expect(run(s, 'read', 'newspaper').understood).toBe(false);
    expect(s).toEqual(before);
  });

  it('turns switchable things on and off; others refuse without changing anything', () => {
    const s = stateWith(world, { room: 'living', carrying: ['lamp', 'bat'] });
    expect(run(s, 'turn_on', 'lamp').lines).toEqual(['The lamp is now on.']);
    expect(s.itemState.lamp.on).toBe(true);
    expect(run(s, 'turn_on', 'lamp').lines).toEqual(['It’s already on.']);
    expect(run(s, 'turn_off', 'lamp').lines).toEqual(['The lamp is now off.']);
    expect(run(s, 'turn_off', 'lamp').lines).toEqual(['It’s already off.']);
    const before = structuredClone(s);
    expect(run(s, 'turn_on', 'bat').lines).toEqual(['You can’t turn that on.']);
    expect({ ...s, turns: 0 }).toEqual({ ...before, turns: 0 });
  });

  it('parses read and switch verbs', () => {
    expect(fallbackParse('read the book')).toEqual({ action: 'read', target: 'book' });
    expect(fallbackParse('turn on lamp')).toEqual({ action: 'turn_on', target: 'lamp' });
    expect(fallbackParse('turn the lamp on')).toEqual({ action: 'turn_on', target: 'lamp' });
    expect(fallbackParse('turn the lamp off')).toEqual({ action: 'turn_off', target: 'lamp' });
    expect(fallbackParse('switch off lamp')).toEqual({ action: 'turn_off', target: 'lamp' });
    expect(fallbackParse('light lamp')).toEqual({ action: 'turn_on', target: 'lamp' });
    expect(fallbackParse('examine book')).toEqual({ action: 'examine', target: 'book' });
  });
});

describe('descriptions that change with the state of the world', () => {
  it('the first description whose condition holds replaces the plain one', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key'] });
    expect(run(s, 'look').lines).toContain('A dusty shed. A crate sits in the middle.');
    s.itemState.hatch = { open: true };
    expect(run(s, 'look').lines).toContain('A dusty shed. Daylight falls through the open hatch.');
  });

  it('Infocom style: a room you’ve been to is just its name and what’s in it, unless you LOOK', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'bedroom' });
    const go = (target: string) => execute({ action: 'go', target }, { world: w, state: s }).lines;
    expect(go('west')).toContain('A living room with a table by the door.');
    expect(go('east')).toEqual(['📍 Bedroom', 'There is a alarm clock here.', 'There is a bed here.']);
    expect(execute({ action: 'look' }, { world: w, state: s }).lines).toContain('A small bedroom.');
  });
});
