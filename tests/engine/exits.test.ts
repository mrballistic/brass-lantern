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
    expect(s).toEqual({ ...before, turns: 1 });
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
});
