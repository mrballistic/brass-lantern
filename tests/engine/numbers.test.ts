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
    // The slot keeps the digits typed; the number rides along.
    expect(fallbackParse('turn dial to 4')).toEqual({ action: 'turn', target: 'dial', indirect: '4', number: 4 });
    expect(fallbackParse('set the dial to 776')).toEqual({ action: 'turn', target: 'dial', indirect: '776', number: 776 });
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
    expect(execute({ action: 'take', target: 'number', number: 4, byId: true }, { world: fixtureWorld, state: s }).understood).toBe(false);
    expect(JSON.stringify(s)).toBe(beforeTake);
    // No rule answers: V-TURN's default in Infocom style; a miss in brass style.
    const plain: World = { ...dial, rooms: { ...dial.rooms, bedroom: { ...dial.rooms.bedroom, instead: undefined } } };
    const infocom: World = { ...plain, style: 'infocom' };
    expect(execute(fallbackParse('turn dial to 4')!, { world: infocom, state: stateWith(infocom, { room: 'bedroom' }) }).lines).toEqual(['This has no effect.']);
    expect(execute(fallbackParse('turn dial to 4')!, { world: plain, state: stateWith(plain, { room: 'bedroom' }) }).understood).toBe(false);
  });
  it('number conditions read the command being run', () => {
    const s = stateWith(fixtureWorld, { room: 'bedroom' });
    expect(evaluateCondition('number:4', s, fixtureWorld)).toBe(false);
    expect(evaluateCondition('number<=8', s, fixtureWorld)).toBe(false);
  });

  it('a number no rule wants misses with the digits typed, as before 6a', () => {
    const s = stateWith(fixtureWorld, { room: 'bedroom' });
    const before = JSON.stringify(s);
    const miss = (input: string, line: string) => {
      const r = execute(fallbackParse(input)!, { world: fixtureWorld, state: s });
      expect(r.understood, input).toBe(false);
      expect(r.lines, input).toEqual([line]);
    };
    miss('take 5', 'You don’t see a “5” here.');
    miss('examine 12', 'You see no “12” here worth examining.');
    miss('go to 4', 'You can’t go that way. Exits: living room (west).');
    expect(fallbackParse('go to 4')).toEqual({ action: 'go', target: '4', number: 4 });
    expect(JSON.stringify(s)).toBe(before);
  });
  it('“number” is never fuzzy-matched: the intent server’s literal names no “number plate”', () => {
    const plated: World = {
      ...fixtureWorld,
      items: { ...fixtureWorld.items, plate: { name: 'number plate', description: 'A number plate.', portable: true, tags: [] } },
      rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, items: [...fixtureWorld.rooms.bedroom.items, 'plate'] } },
    };
    const s = stateWith(plated, { room: 'bedroom' });
    const before = JSON.stringify(s);
    expect(execute({ action: 'take', target: 'number', byId: true }, { world: plated, state: s }).understood).toBe(false);
    expect(execute({ action: 'take', target: 'number', number: 3, byId: true }, { world: plated, state: s }).understood).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    // Typed, it's an ordinary word.
    execute(fallbackParse('take number')!, { world: plated, state: s });
    expect(s.locations.plate).toBe('player');
  });
  it('the intent server’s TURN X TO N reaches the rules as the typed one does', () => {
    const s = stateWith(dial, { room: 'bedroom' });
    expect(execute({ action: 'turn', target: 'dial', indirect: 'number', number: 6, byId: true }, { world: dial, state: s }).lines).toEqual(['The dial clicks.']);
    expect(s.vars?.cell).toBe(6);
  });
});

// A thing named or aliased by digits (a golf club called “5”, locker 12): digits typed where an object
// goes name it first, as Zork's parser reads a word in its vocabulary before trying NUMBER?.
// Only when nothing in scope is called that are they the number.
const club = {
  name: 'golf club',
  aliases: ['5'],
  description: 'A five iron.',
  portable: true,
  tags: [],
  instead: { take: [{ say: ['The club is bolted to the rack.'] }], examine: [{ say: ['A five iron, engraved “5”.'] }] },
};
const clubbed: World = {
  ...fixtureWorld,
  items: { ...fixtureWorld.items, club },
  rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, items: [...fixtureWorld.rooms.bedroom.items, 'club'] } },
};
const lockers: World = {
  ...dial,
  items: { ...dial.items, locker: { name: 'locker 12', description: 'Locker 12.', portable: false, tags: [] } },
  rooms: {
    ...dial.rooms,
    bedroom: {
      ...dial.rooms.bedroom,
      items: [...dial.rooms.bedroom.items, 'locker'],
      instead: {
        turn: [
          { with: 'locker', if: 'number:12', say: ['You can’t set the dial to a locker.'] },
          { with: 'number', if: 'number:5', say: ['Five, says the dial.'] },
          ...(dial.rooms.bedroom.instead?.turn ?? []),
        ],
      },
    },
  },
};

describe('a thing named by digits (6a follow-up)', () => {
  it('TAKE 5 with a golf club aliased “5”: the club’s own rule fires', () => {
    const s = stateWith(clubbed, { room: 'bedroom' });
    expect(execute(fallbackParse('take 5')!, { world: clubbed, state: s }).lines).toEqual(['The club is bolted to the rack.']);
    expect(s.locations.club).toBe('bedroom');
  });
  it('EXAMINE 5 uses its examine rules', () => {
    const s = stateWith(clubbed, { room: 'bedroom' });
    expect(execute(fallbackParse('examine 5')!, { world: clubbed, state: s }).lines).toEqual(['A five iron, engraved “5”.']);
  });
  it('with nothing called that, TURN DIAL TO 5 still reaches `with: number` rules and number:5', () => {
    const s = stateWith(lockers, { room: 'bedroom' });
    expect(execute(fallbackParse('turn dial to 5')!, { world: lockers, state: s }).lines).toEqual(['Five, says the dial.']);
  });
  it('TURN DIAL TO 12 with locker 12 here: the locker wins (its rules, number:12 still true)', () => {
    const s = stateWith(lockers, { room: 'bedroom' });
    expect(execute(fallbackParse('turn dial to 12')!, { world: lockers, state: s }).lines).toEqual(['You can’t set the dial to a locker.']);
    expect(s.vars?.cell).toBeUndefined();
  });
  it('digits name a thing only as a whole word: TURN DIAL TO 1 is the number, not locker 12', () => {
    const s = stateWith(lockers, { room: 'bedroom' });
    expect(execute(fallbackParse('turn dial to 1')!, { world: lockers, state: s }).lines).toEqual(['The dial clicks.']);
    expect(s.vars?.cell).toBe(1);
    // And TAKE 2 is no “locker 12”.
    const t = stateWith(lockers, { room: 'bedroom' });
    expect(execute(fallbackParse('take 2')!, { world: lockers, state: t }).lines).toEqual(['You don’t see a “2” here.']);
  });
  it('with no rule, TURN X TO a thing named by digits is TURN X WITH Y: understood, no effect', () => {
    const plain: World = { ...lockers, rooms: { ...lockers.rooms, bedroom: { ...lockers.rooms.bedroom, instead: undefined } } };
    const s = stateWith(plain, { room: 'bedroom' });
    const r = execute(fallbackParse('turn dial to 12')!, { world: plain, state: s });
    expect(r.understood).not.toBe(false);
    expect(r.lines).toEqual(['This has no effect.']);
    // The number, with no rule, is still a miss in brass style.
    const m = stateWith(plain, { room: 'bedroom' });
    expect(execute(fallbackParse('turn dial to 7')!, { world: plain, state: m }).understood).toBe(false);
  });
});
