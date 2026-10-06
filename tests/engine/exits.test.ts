import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import type { GameState } from '@/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (s: GameState, action: string, target?: string) => execute(target ? { action, target } : { action }, { world, state: s });

describe('exits', () => {
  it('a message-only exit says its piece and goes nowhere', () => {
    const s = stateWith(world, { room: 'yard' });
    const before = structuredClone(s);
    const r = run(s, 'go', 'west');
    expect(r.lines).toEqual(['The fence is too high to climb.']);
    expect(r.understood).not.toBe(false);
    expect(s).toEqual({ ...before, turns: 1, moveCount: 1 });
  });

  it('a conditional exit is refused until its condition holds', () => {
    const s = stateWith(world, { room: 'living' });
    expect(run(s, 'go', 'south').lines).toEqual(['The door is stuck.']);
    expect(s.currentRoom).toBe('living');
    s.flags.paid = true;
    run(s, 'go', 'south');
    expect(s.currentRoom).toBe('yard');
  });

  it('a door must be open, from either side', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key'] });
    expect(run(s, 'go', 'up').lines).toEqual(['The hatch is closed.']);
    expect(run(s, 'open', 'hatch').lines).toEqual(['Opened.']);
    run(s, 'go', 'ne');
    expect(s.currentRoom).toBe('loft');
    run(s, 'close', 'hatch');
    expect(run(s, 'go', 'down').lines).toEqual(['The hatch is closed.']);
    run(s, 'open', 'hatch');
    run(s, 'go', 'sw');
    expect(s.currentRoom).toBe('shed');
  });

  it('enter and climb take a matching exit', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(run(s, 'climb', 'fence').lines).toEqual(['The fence is too high to climb.']);
    run(s, 'enter', 'shed');
    expect(s.currentRoom).toBe('yard'); // the shed requires the key
    const s2 = stateWith(world, { room: 'yard', carrying: ['key'] });
    run(s2, 'enter', 'shed');
    expect(s2.currentRoom).toBe('shed');
    const s3 = stateWith(world, { room: 'yard' });
    run(s3, 'enter');
    expect(s3.currentRoom).toBe('living');
  });

  it('climbing something with nowhere to go is a miss', () => {
    const s = stateWith(world, { room: 'bedroom' });
    const before = structuredClone(s);
    expect(run(s, 'climb', 'moon').understood).toBe(false);
    expect(s).toEqual(before);
  });

  it('parses diagonals, U/D, enter and climb', () => {
    expect(fallbackParse('ne')).toEqual({ action: 'go', target: 'northeast' });
    expect(fallbackParse('sw')).toEqual({ action: 'go', target: 'southwest' });
    expect(fallbackParse('northwest')).toEqual({ action: 'go', target: 'northwest' });
    expect(fallbackParse('u')).toEqual({ action: 'go', target: 'up' });
    expect(fallbackParse('d')).toEqual({ action: 'go', target: 'down' });
    expect(fallbackParse('climb the tree')).toEqual({ action: 'climb', target: 'tree' });
    expect(fallbackParse('climb up')).toEqual({ action: 'climb', target: 'up' });
    expect(fallbackParse('climb')).toEqual({ action: 'climb' });
    expect(fallbackParse('enter house')).toEqual({ action: 'enter', target: 'house' });
  });

  it('message-only exits aren’t listed unless listExits names them', () => {
    expect(describeCurrentRoom(world, stateWith(world, { room: 'yard' })).join('\n')).not.toMatch(/Exits:.*west/);
  });

  it('an exit can refuse for different reasons, first match wins', () => {
    const w = {
      ...world,
      rooms: {
        ...world.rooms,
        bedroom: {
          ...world.rooms.bedroom,
          exits: {
            ...world.rooms.bedroom.exits,
            up: { to: 'living', denials: [{ if: 'carrying<=0', text: 'Not empty-handed.' }, { if: '!has:key', text: 'You need the key.' }] },
          },
        },
      },
    };
    const s = stateWith(w);
    const before = structuredClone(s);
    expect(execute({ action: 'go', target: 'up' }, { world: w, state: s }).lines).toEqual(['Not empty-handed.']);
    expect({ ...s, turns: 0, moveCount: 0 }).toEqual({ ...before, turns: 0, moveCount: 0 });
    s.locations.wallet = 'player';
    expect(execute({ action: 'go', target: 'up' }, { world: w, state: s }).lines).toEqual(['You need the key.']);
    s.locations.key = 'player';
    execute({ action: 'go', target: 'up' }, { world: w, state: s });
    expect(s.currentRoom).toBe('living');
  });

  it('an exit can run an event as you pass through it, before you arrive', () => {
    const w = {
      ...world,
      rooms: { ...world.rooms, yard: { ...world.rooms.yard, exits: { ...world.rooms.yard.exits, north: { to: 'bedroom', then: 'squeeze' } } } },
      events: { ...world.events, squeeze: ['You squeeze through.', { set: 'squeezed' }] },
    };
    const s = stateWith(w, { room: 'yard' });
    const lines = execute({ action: 'go', target: 'north' }, { world: w, state: s }).lines;
    expect(lines[0]).toBe('You squeeze through.');
    expect(s.flags.squeezed).toBe(true);
    expect(s.currentRoom).toBe('bedroom');
  });

  it('a repeating arrival trigger fires every time its condition holds', () => {
    const w = {
      ...world,
      rooms: { ...world.rooms, bedroom: { ...world.rooms.bedroom, onEnter: [{ if: 'flag:paid', then: 'creak', repeat: true }] } },
      events: { ...world.events, creak: ['The floor creaks.'] },
    };
    const s = stateWith(w, { room: 'living', flags: ['paid'] });
    expect(execute({ action: 'go', target: 'east' }, { world: w, state: s }).lines).toContain('The floor creaks.');
    execute({ action: 'go', target: 'west' }, { world: w, state: s });
    expect(execute({ action: 'go', target: 'east' }, { world: w, state: s }).lines).toContain('The floor creaks.');
  });
});

describe('climbing a thing up or down (5c)', () => {
  it('CLIMB DOWN LADDER keeps the direction and takes the down exit', () => {
    expect(fallbackParse('climb down ladder')).toEqual({ action: 'climb', target: 'ladder', direction: 'down' });
    expect(fallbackParse('climb up the ladder')).toEqual({ action: 'climb', target: 'ladder', direction: 'up' });
    expect(fallbackParse('climb down')).toEqual({ action: 'climb', target: 'down' });
    const w = { ...world, items: { ...world.items, ladder: { name: 'ladder', description: '', portable: false, tags: [], scenery: true } } };
    const s = stateWith(w, { room: 'shed' });
    s.locations.ladder = 'shed';
    execute({ action: 'climb', target: 'ladder', direction: 'down' }, { world: w, state: s });
    expect(s.currentRoom).toBe('cellar');
  });
});

describe('final review fixes (5c)', () => {
  it('CLIMB UP a thing takes the room’s climb exit when there’s no up exit', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(execute(fallbackParse('climb up fence')!, { world, state: s }).lines).toEqual(['The fence is too high to climb.']);
  });
});

describe('a refused exit, Infocom style (fast follow)', () => {
  it('still costs a turn, but skips the room’s end routine (V-WALK’s RFATAL)', () => {
    const w = {
      ...world,
      style: 'infocom' as const,
      rooms: { ...world.rooms, yard: { ...world.rooms.yard, exits: { ...world.rooms.yard.exits, west: { denial: 'A fence.' } }, onEnd: [{ if: 'in:yard', then: ['Tick.'] }] } },
    };
    const s = stateWith(w, { room: 'yard' });
    const moves = s.moveCount;
    const r = execute({ action: 'go', target: 'west' }, { world: w, state: s });
    expect(r.lines).toEqual(['A fence.']);
    expect(s.moveCount).toBe(moves + 1);
  });
  it('a room that turns you away (GOTO’s refusal, not V-WALK’s) still runs the end routine (1.12.5 review)', () => {
    const w = {
      ...world,
      style: 'infocom' as const,
      rooms: { ...world.rooms, yard: { ...world.rooms.yard, onEnd: [{ if: 'in:yard', then: ['Tick.'] }] } },
    };
    const s = stateWith(w, { room: 'yard' });
    const r = execute({ action: 'go', target: 'north' }, { world: w, state: s });
    expect(r.lines).toEqual(['The shed is locked.', 'Tick.']);
  });
});
