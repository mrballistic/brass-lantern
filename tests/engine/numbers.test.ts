import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse, parseNumber } from '@/engine/parser';
import { evaluateCondition } from '@/engine/conditions';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const dial: World = {
  ...fixtureWorld,
  items: { ...fixtureWorld.items, dial: { name: 'dial', description: 'A dial.', portable: false, tags: [], scenery: true } },
  rooms: {
    ...fixtureWorld.rooms,
    bedroom: {
      ...fixtureWorld.rooms.bedroom,
      scenery: [...(fixtureWorld.rooms.bedroom.scenery ?? []), 'dial'],
      instead: { turn: [{ with: 'number', if: 'number<=8', then: 'dialed' }, { with: 'number', say: ['The dial only goes to 8.'] }] },
    },
  },
  events: { ...fixtureWorld.events, dialed: [{ setVar: 'cell', from: 'number' }, 'The dial clicks.'] },
};

describe('numbers (Zork’s INTNUM) (6a)', () => {
  it('parses like NUMBER?: up to 1000, and H:MM as minutes', () => {
    expect(parseNumber('4')).toBe(4);
    expect(parseNumber('1000')).toBe(1000);
    expect(parseNumber('1001')).toBeNull();
    expect(parseNumber('9:30')).toBe(570);
    expect(parseNumber('3:00')).toBe(900);
    expect(parseNumber('24:00')).toBeNull();
    expect(parseNumber('4a')).toBeNull();
  });
  it('TURN X TO N and SET X TO N carry the number', () => {
    expect(fallbackParse('turn dial to 4')).toEqual({ action: 'turn', target: 'dial', indirect: 'number', number: 4 });
    expect(fallbackParse('set the dial to 776')).toEqual({ action: 'turn', target: 'dial', indirect: 'number', number: 776 });
    expect(fallbackParse('turn dial to lamp')).toEqual({ action: 'turn', target: 'dial', indirect: 'lamp' });
    expect(fallbackParse('set lamp on table')).toEqual({ action: 'put', target: 'lamp', indirect: 'table', prep: 'on' });
    expect(fallbackParse('turn bolt with wrench')).toEqual({ action: 'turn', target: 'bolt', indirect: 'wrench' });
  });
  it('rules see it: number conditions and setVar from the number', () => {
    const s = stateWith(dial, { room: 'bedroom' });
    expect(execute(fallbackParse('turn dial to 4')!, { world: dial, state: s }).lines).toEqual(['The dial clicks.']);
    expect(s.vars?.cell).toBe(4);
    expect(execute(fallbackParse('turn dial to 9')!, { world: dial, state: s }).lines).toEqual(['The dial only goes to 8.']);
  });
  it('the default is Zork’s V-TURN, and a thing where a number goes is not a number', () => {
    const missed = stateWith(dial, { room: 'bedroom' });
    const before = JSON.stringify(missed);
    const r = execute(fallbackParse('turn dial to lamp')!, { world: dial, state: missed });
    expect(r.understood).toBe(false);
    expect(JSON.stringify(missed)).toBe(before);
    const s = stateWith(fixtureWorld, { room: 'bedroom' });
    const beforeTake = JSON.stringify(s);
    expect(execute({ action: 'take', target: 'number', number: 4 }, { world: fixtureWorld, state: s }).understood).toBe(false);
    expect(JSON.stringify(s)).toBe(beforeTake);
    // No rule answers: V-TURN's default.
    const plain: World = { ...dial, rooms: { ...dial.rooms, bedroom: { ...dial.rooms.bedroom, instead: undefined } } };
    expect(execute(fallbackParse('turn dial to 4')!, { world: plain, state: stateWith(plain, { room: 'bedroom' }) }).lines).toEqual(['This has no effect.']);
  });
  it('number conditions read the command being run', () => {
    const s = stateWith(fixtureWorld, { room: 'bedroom' });
    expect(evaluateCondition('number:4', s, fixtureWorld)).toBe(false);
    expect(evaluateCondition('number<=8', s, fixtureWorld)).toBe(false);
  });
});
