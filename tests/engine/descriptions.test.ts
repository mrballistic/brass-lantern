import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { expandTemplate } from '@/engine/text';
import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { auditWorld } from '../helpers/audit';
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
    expect({ ...s, turns: 0, moveCount: 0 }).toEqual({ ...before, turns: 0, moveCount: 0 });
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
    expect(go('east')).toEqual(['📍 Bedroom', 'There is a bed here.', 'There is a alarm clock here.']);
    expect(execute({ action: 'look' }, { world: w, state: s }).lines).toContain('A small bedroom.');
  });
});

describe('descriptions from state', () => {
  const w: World = {
    ...world,
    rooms: {
      ...world.rooms,
      bedroom: { ...world.rooms.bedroom, description: 'The dial reads {var:cell}.' },
      living: { ...world.rooms.living, firstDescription: 'First visit.', descriptionScript: 'grid' },
    },
    items: { ...world.items, alarm: { ...world.items.alarm, description: 'It shows {var:cell}; you typed {number}.', descriptionScript: undefined } },
    scripts: { grid: () => [{ say: '###' }, { say: '#.#' }] },
  };

  it('{var:NAME} reads a variable, and 0 when unset', () => {
    const s = stateWith(w, { room: 'bedroom' });
    expect(describeCurrentRoom(w, s)).toContain('The dial reads 0.');
    s.vars = { cell: 4 };
    expect(describeCurrentRoom(w, s)).toContain('The dial reads 4.');
  });

  it('expands in EXAMINE, leaves {number} and unknown placeholders as written, and never draws randomness', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.vars = { cell: 4 };
    expect(execute({ action: 'examine', target: 'alarm' }, { world: w, state: s }).lines).toEqual(['It shows 4; you typed {number}.']);
    const before = JSON.stringify(s);
    expect(expandTemplate('{a thing} {var:cell} {nope}', w, s)).toBe('{a thing} 4 {nope}');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a description script’s say lines are the description, ahead of the first-visit text', () => {
    const s = stateWith(w, { room: 'bedroom' });
    const lines = execute({ action: 'go', target: 'west' }, { world: w, state: s }).lines;
    expect(lines).toContain('###\n#.#');
    expect(lines).not.toContain('First visit.');
  });

  it('an item’s description script describes it in EXAMINE', () => {
    const w2: World = { ...w, items: { ...w.items, alarm: { ...w.items.alarm, descriptionScript: 'grid' } } };
    const s = stateWith(w2, { room: 'bedroom' });
    expect(execute({ action: 'examine', target: 'alarm' }, { world: w2, state: s }).lines).toEqual(['###\n#.#']);
  });

  it('the audit flags a description script naming no script', () => {
    const bad: World = { ...w, rooms: { ...w.rooms, bedroom: { ...w.rooms.bedroom, descriptionScript: 'nope' } } };
    expect(auditWorld(bad).some((p) => p.includes('nope'))).toBe(true);
    expect(auditWorld(w).some((p) => p.includes('descriptionScript'))).toBe(false);
  });

  it('describing never changes the game, even when the script rolls dice', () => {
    const w3: World = { ...w, scripts: { grid: (ctx) => [{ say: `###${ctx.random() > 2 ? 'x' : ''}` }] } };
    const s = stateWith(w3, { room: 'living' });
    const before = JSON.stringify(s);
    const a = describeCurrentRoom(w3, s);
    const b = describeCurrentRoom(w3, s);
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a script that says nothing falls through to the plain description', () => {
    const w3: World = { ...w, scripts: { grid: () => [] } };
    const s = stateWith(w3, { room: 'living' });
    s.visited = ['living'];
    expect(describeCurrentRoom(w3, s)).toContain(w3.rooms.living.description);
  });

  it('the audit flags a description script that does more than say', () => {
    const mk = (steps: World['scripts'] extends infer T ? T : never): World => ({ ...w, scripts: steps });
    const bad = mk({ grid: () => [{ say: 'x' }, { set: 'f' }] });
    expect(auditWorld(bad).some((p) => p.includes('grid') && p.includes('say'))).toBe(true);
    expect(auditWorld(mk({ grid: () => [{ say: 'x' }, 'y'] })).some((p) => p.includes('descriptionScript'))).toBe(false);
  });
});
