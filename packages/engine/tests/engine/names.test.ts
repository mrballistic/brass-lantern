import { describe, expect, it } from 'vitest';
import { execute } from '../../src/engine/engine';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';
import type { World } from '../../src/types/world';

/** The yard, plus things named after the neighbor (as Office Space names things after Lumbergh). */
export const world: World = {
  ...fixtureWorld,
  rooms: { ...fixtureWorld.rooms, yard: { ...fixtureWorld.rooms.yard, items: [...fixtureWorld.rooms.yard.items, 'neighbors_mug', 'neighbor_banner'] } },
  items: {
    ...fixtureWorld.items,
    neighbors_mug: { name: 'Neighbor’s coffee mug', aliases: ['mug'], article: '', description: 'A chipped mug.', portable: true, tags: [] },
    neighbor_banner: { name: 'banner', description: 'A faded banner.', portable: false, tags: [] },
  },
};

describe('objects and people, ranked together', () => {
  it('EXAMINE finds the person over things that only contain the name', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['neighbors_mug'] });
    expect(execute({ action: 'examine', target: 'neighbor' }, { world, state: s }).lines).toEqual(['Your neighbor, leaning on the fence.']);
  });
  it('GIVE … TO finds the person', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['wallet'] });
    const r = execute({ action: 'give', target: 'wallet', indirect: 'neighbor' }, { world, state: s });
    expect(r.ask).toBeUndefined();
    expect(r.understood).not.toBe(false);
  });
  it('a stronger object match still wins', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'coffee mug' }, { world, state: s }).lines).toEqual(['A chipped mug.']);
  });
  it('a misspelled person is found', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'nieghbor' }, { world, state: s }).lines).toContain('Your neighbor, leaning on the fence.');
  });
  it('no typos in Infocom style', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'nieghbor' }, { world: w, state: s }).understood).toBe(false);
  });
  it('no typos on an intent-server turn', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'nieghbor', byId: true }, { world, state: s }).understood).toBe(false);
  });
});
