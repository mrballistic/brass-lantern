import { describe, expect, it } from 'vitest';
import { execute } from '../../src/engine/engine';
import { stateWith } from '../helpers/state';
import { createGame } from '../../src/engine/game';
import { restoreState, snapshotState } from '../../src/engine/model';
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

describe('verbs that act on objects keep their rules', () => {
  // The banner alone (no mug), so “neighbor” names one object here.
  const ruled: World = {
    ...world,
    rooms: { ...world.rooms, yard: { ...world.rooms.yard, items: [...fixtureWorld.rooms.yard.items, 'neighbor_banner'] } },
    items: {
      ...world.items,
      neighbor_banner: {
        ...world.items.neighbor_banner,
        portable: true,
        instead: { take: [{ say: ['The banner rule.'] }], open: [{ say: ['The banner open rule.'] }] },
      },
    },
  };
  it('TAKE fires the object’s rule when a person outranks it', () => {
    const s = stateWith(ruled, { room: 'yard' });
    expect(execute({ action: 'take', target: 'neighbor' }, { world: ruled, state: s }).lines).toEqual(['The banner rule.']);
    expect(s.locations.neighbor_banner).toBe('yard');
  });
  it('OPEN fires the object’s rule when a person outranks it', () => {
    const s = stateWith(ruled, { room: 'yard' });
    expect(execute({ action: 'open', target: 'neighbor' }, { world: ruled, state: s }).lines).toEqual(['The banner open rule.']);
  });
});

describe('objects rank by their own name and aliases', () => {
  const withNed = (aliases?: string[]): World => ({
    ...world,
    rooms: { ...world.rooms, yard: { ...world.rooms.yard, items: [...world.rooms.yard.items, 'ned_portrait'], npcs: [...(world.rooms.yard.npcs ?? []), 'flanders'] } },
    items: { ...world.items, ned_portrait: { name: 'Ned', ...(aliases ? { aliases } : {}), description: 'A portrait of Ned.', portable: false, tags: [] } },
    npcs: { ...world.npcs, flanders: { name: 'Ned Flanders', description: 'Hi-diddly-ho.' } },
  });
  it('an exact object name beats a person’s name word, with or without an alias', () => {
    for (const w of [withNed(['portrait']), withNed()]) {
      const s = stateWith(w, { room: 'yard' });
      expect(execute({ action: 'follow', target: 'ned' }, { world: w, state: s }).lines).toEqual(['You can’t follow that.']);
    }
  });
});

describe('typo replies', () => {
  const w: World = { ...world, typoReplies: ['“{typed}”? You mean {name}.', 'Close enough: {name}.'] };
  it('reply once per thing, in rotation, ahead of the command’s lines', () => {
    const s = stateWith(w, { room: 'yard' });
    const first = execute({ action: 'examine', target: 'nieghbor' }, { world: w, state: s });
    expect(first.lines).toEqual(['“nieghbor”? You mean the Neighbor.', 'Your neighbor, leaning on the fence.']);
    expect(s.typoMocked).toEqual(['neighbor']);
    // The fixture's ambient line may follow; the point is that no second tease leads.
    expect(execute({ action: 'examine', target: 'nieghbor' }, { world: w, state: s }).lines[0]).toBe('Your neighbor, leaning on the fence.');
    s.currentRoom = 'shed';
    expect(execute({ action: 'examine', target: 'gaurd' }, { world: w, state: s }).lines[0]).toBe('Close enough: the guard.');
  });
  it('silent without typoReplies', () => {
    const quiet: World = { ...world, typoReplies: undefined };
    const s = stateWith(quiet, { room: 'yard' });
    expect(execute({ action: 'examine', target: 'nieghbor' }, { world: quiet, state: s }).lines).toEqual(['Your neighbor, leaning on the fence.']);
    expect(s.typoMocked).toBeUndefined();
  });
  it('a command that misses records nothing', () => {
    const s = stateWith(w, { room: 'yard' });
    const r = execute({ action: 'give', target: 'wallet', indirect: 'nieghbor' }, { world: w, state: s });
    expect(r.understood).toBe(false);
    expect(s.typoMocked).toBeUndefined();
  });
  it('typoMocked survives a snapshot round-trip (UNDO, saves)', () => {
    const s = stateWith(w, { room: 'yard' });
    const snap = snapshotState(s);
    execute({ action: 'examine', target: 'nieghbor' }, { world: w, state: s });
    const after = snapshotState(s);
    restoreState(s, snap);
    expect(s.typoMocked).toBeUndefined();
    restoreState(s, after);
    expect(s.typoMocked).toEqual(['neighbor']);
  });
  it('works through createGame', () => {
    const game = createGame(w, { seed: 1 });
    game.state.currentRoom = 'yard';
    expect(game.send('x nieghbor').lines[0]).toBe('“nieghbor”? You mean the Neighbor.');
  });
});
