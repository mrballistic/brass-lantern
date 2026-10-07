import { describe, expect, it } from 'vitest';
import { conditionProblems } from '@/engine/conditions';
import { execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const thing = (name: string, extra: Record<string, unknown> = {}) => ({ name, description: `A ${name}.`, portable: true, tags: [], ...extra });

const world: World = {
  ...fixtureWorld,
  items: {
    ...fixtureWorld.items,
    mat: thing('mat'),
    door: thing('door', { portable: false, door: true, container: { openable: true } }),
    painting: thing('painting', { portable: false }),
    box: thing('box'),
    book: thing('book'),
    lens: thing('lens'),
  },
  rooms: {
    ...fixtureWorld.rooms,
    living: { ...fixtureWorld.rooms.living, items: [...fixtureWorld.rooms.living.items, 'mat', 'door', 'painting', 'box', 'book', 'lens'] },
  },
};

const play = (input: string, opts: { carrying?: string[]; w?: World } = {}) => {
  const w = opts.w ?? world;
  const state = stateWith(w, { room: 'living', carrying: opts.carrying ?? ['mat', 'key', 'book', 'lens'] });
  const parsed = fallbackParse(input);
  expect(parsed).not.toBeNull();
  return { r: execute(parsed!, { world: w, state }), state };
};

describe('prepositions (6a)', () => {
  describe('parse table', () => {
    it.each(['put mat under door', 'slide mat under door', 'push mat under door'])('%s', (input) => {
      expect(fallbackParse(input)).toEqual({ action: 'put', target: 'mat', indirect: 'door', prep: 'under' });
    });
    it('put key behind painting', () => {
      expect(fallbackParse('put key behind painting')).toEqual({ action: 'put', target: 'key', indirect: 'painting', prep: 'behind' });
    });
    it('throw rope off cliff', () => {
      expect(fallbackParse('throw rope off cliff')).toEqual({ action: 'throw', target: 'rope', indirect: 'cliff', prep: 'off' });
    });
    it('throw rope over cliff', () => {
      expect(fallbackParse('throw rope over the cliff')).toEqual({ action: 'throw', target: 'rope', indirect: 'cliff', prep: 'over' });
    });
    it.each(['read book through lens', 'read book with lens'])('%s', (input) => {
      expect(fallbackParse(input)).toEqual({ action: 'read', target: 'book', indirect: 'lens', prep: 'through' });
    });
    it('push box north', () => {
      expect(fallbackParse('push box north')).toEqual({ action: 'push', target: 'box', direction: 'north' });
      expect(fallbackParse('push the box sw')).toEqual({ action: 'push', target: 'box', direction: 'southwest' });
    });
    it('push box to wall', () => {
      expect(fallbackParse('push box to wall')).toEqual({ action: 'push', target: 'box', indirect: 'wall' });
    });
    it('spray repellent on me', () => {
      const verbs = { spray: { words: ['spray'], target: 'required' as const, indirect: ['on'] } };
      // The word typed stays: the engine decides it names the player.
      expect(fallbackParse('spray repellent on me', verbs)).toEqual({ action: 'spray', target: 'repellent', indirect: 'me' });
      expect(fallbackParse('use key on myself')).toEqual({ action: 'use', target: 'key', indirect: 'myself' });
    });
    it('keeps the old forms', () => {
      expect(fallbackParse('push button')).toEqual({ action: 'use', target: 'button' });
      expect(fallbackParse('put key in box')).toEqual({ action: 'put', target: 'key', indirect: 'box', prep: 'in' });
      expect(fallbackParse('throw key at door')).toEqual({ action: 'throw', target: 'key', indirect: 'door' });
      expect(fallbackParse('read book')).toEqual({ action: 'read', target: 'book' });
      expect(fallbackParse('give me the key')).toEqual({ action: 'give', target: 'me the key' });
    });
  });

  describe('defaults (Zork’s)', () => {
    it('PUT UNDER', () => {
      const { r, state } = play('put mat under door');
      expect(r.lines).toEqual(['You can’t do that.']);
      expect(state.locations.mat).toBe('player');
    });
    it('PUT BEHIND', () => {
      expect(play('put brass key behind painting').r.lines).toEqual(['That hiding place is too obvious.']);
    });
    it('THROW OFF and OVER', () => {
      expect(play('throw brass key off door').r.lines).toEqual(['You can’t throw anything off of that!']);
      const { r, state } = play('throw brass key over door');
      expect(r.lines).toEqual(['You can’t throw anything off of that!']);
      expect(state.locations.key).toBe('player');
    });
    it('READ THROUGH reads the thing', () => {
      expect(play('read book through lens').r.lines).toEqual(['A book.']);
    });
    it('PUSH X direction and PUSH X TO Y', () => {
      expect(play('push box north', { carrying: [] }).r.lines).toEqual(['You can’t push things to that.']);
      const { r, state } = play('push box to painting', { carrying: [] });
      expect(r.lines).toEqual(['You can’t push things to that.']);
      expect(state.locations.box).toBe('living');
    });
    it('a target naming nothing is a miss with no change', () => {
      for (const input of ['push crate north', 'push box to nowhere', 'throw brass key off nowhere', 'put mat under nowhere']) {
        const { r, state } = play(input, { carrying: ['mat', 'key'] });
        expect(r.understood, input).toBe(false);
        expect(state.moveCount, input).toBe(0);
      }
    });
  });

  describe('rules and ME', () => {
    it('a world’s rule on the door fires before the default', () => {
      const ruled: World = {
        ...world,
        items: {
          ...world.items,
          door: { ...world.items.door, instead: { put: [{ prep: 'under', then: 'mat_under' }] } },
        },
        events: { ...world.events, mat_under: ['The mat slides under the door.'] },
      };
      expect(play('put mat under door', { w: ruled }).r.lines).toEqual(['The mat slides under the door.']);
      // The rule is for UNDER only: BEHIND still gets the default.
      expect(play('put mat behind door', { w: ruled }).r.lines).toEqual(['That hiding place is too obvious.']);
    });
    it('ME reaches a rule with: player', () => {
      const ruled: World = {
        ...world,
        items: { ...world.items, key: { ...world.items.key, instead: { use: [{ with: 'player', say: ['You spray yourself.'] }] } } },
      };
      const state = stateWith(ruled, { room: 'living', carrying: ['key'] });
      // The intent server's reserved ID for the player.
      expect(execute({ action: 'use', target: 'brass key', indirect: 'player', byId: true }, { world: ruled, state }).lines).toEqual(['You spray yourself.']);
      const again = execute(fallbackParse('use brass key on me')!, { world: ruled, state });
      expect(again.lines).toEqual(['You spray yourself.']);
    });
    it('ME works through withRules for built-in verbs too', () => {
      const ruled: World = {
        ...world,
        items: { ...world.items, key: { ...world.items.key, instead: { put: [{ with: 'player', say: ['You can’t put that in yourself.'] }] } } },
      };
      const state = stateWith(ruled, { room: 'living', carrying: ['key'] });
      const r = execute({ action: 'put', target: 'brass key', indirect: 'me', prep: 'in' }, { world: ruled, state });
      expect(r.lines).toEqual(['You can’t put that in yourself.']);
    });
  });

  describe('ME in either slot', () => {
    const ruledRoom = (instead: Record<string, unknown>): World => ({
      ...world,
      rooms: { ...world.rooms, living: { ...world.rooms.living, instead } as World['rooms'][string] },
    });
    it('examine me and attack myself with no rule are misses that change nothing', () => {
      for (const input of ['examine me', 'attack myself']) {
        const state = stateWith(world, { room: 'living', carrying: ['key'] });
        const before = JSON.stringify(state);
        const r = execute(fallbackParse(input)!, { world, state });
        expect(r.understood, input).toBe(false);
        expect(JSON.stringify(state), input).toBe(before);
      }
    });
    it('a room rule on target:player answers examine me', () => {
      const w = ruledRoom({ examine: [{ if: 'target:player', say: ['You look fine.'] }] });
      expect(play('examine me', { w }).r.lines).toEqual(['You look fine.']);
    });
    it('put brass key in me: a miss with no rule, the rule’s line with one', () => {
      const state = stateWith(world, { room: 'living', carrying: ['key'] });
      const before = JSON.stringify(state);
      expect(execute(fallbackParse('put brass key in me')!, { world, state }).understood).toBe(false);
      expect(JSON.stringify(state)).toBe(before);
      const w = ruledRoom({ put: [{ if: 'indirect:player', say: ['That would be messy.'] }] });
      expect(play('put brass key in me', { w }).r.lines).toEqual(['That would be messy.']);
    });
    it('direction: conditions tell the pushes apart', () => {
      const w = ruledRoom({ push: [{ if: 'direction:north', say: ['It slides north.'] }, { say: ['It won’t budge that way.'] }] });
      expect(play('push box north', { w, carrying: [] }).r.lines).toEqual(['It slides north.']);
      expect(play('push box east', { w, carrying: [] }).r.lines).toEqual(['It won’t budge that way.']);
    });
    it('conditionProblems accepts the command conditions', () => {
      expect(conditionProblems('target:player & indirect:lamp & direction:north', fixtureWorld)).toEqual([]);
      expect(conditionProblems('direction:sideways', fixtureWorld)).toHaveLength(1);
    });
  });
});
