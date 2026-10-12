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
  it('a miss rewritten as “too dark” records nothing and teases nothing', () => {
    const dark: World = { ...w, rooms: { ...w.rooms, yard: { ...w.rooms.yard, dark: true } } };
    const s = stateWith(dark, { room: 'yard', carrying: ['wallet'] });
    const r = execute({ action: 'give', target: 'wallt', indirect: 'zzzz' }, { world: dark, state: s });
    expect(r.free).toBe(true);
    expect(r.lines.join(' ')).not.toContain('You mean');
    expect(s.typoMocked).toBeUndefined();
  });
  it('a turn that asks records nothing', () => {
    const twins: World = {
      ...w,
      items: {
        ...w.items,
        twin_a: { name: 'red thing', aliases: ['thing'], description: 'A.', portable: true, tags: [] },
        twin_b: { name: 'blue thing', aliases: ['thing'], description: 'B.', portable: true, tags: [] },
      },
    };
    const s = stateWith(twins, { room: 'yard', carrying: ['twin_a', 'twin_b'] });
    const r = execute({ action: 'give', target: 'thing', indirect: 'nieghbor' }, { world: twins, state: s });
    expect(r.ask).toBeDefined();
    expect(r.lines.join(' ')).not.toContain('You mean the Neighbor');
    expect(s.typoMocked).toBeUndefined();
  });
  it('works through createGame', () => {
    const game = createGame(w, { seed: 1 });
    game.state.currentRoom = 'yard';
    expect(game.send('x nieghbor').lines[0]).toBe('“nieghbor”? You mean the Neighbor.');
  });
});

describe('GIVE PERSON THING', () => {
  const play = (line: string) => {
    const game = createGame(world, { seed: 1 });
    game.state.currentRoom = 'yard';
    Object.assign(game.state.locations, { wallet: 'player' });
    return game.send(line);
  };
  it('reads the person first', () => {
    expect(play('give neighbor wallet').understood).not.toBe(false);
    expect(play('give neighbor the wallet').lines.join(' ')).not.toContain('aren’t carrying');
  });
  it('with a misspelled person', () => {
    expect(play('give nieghbor wallet').lines.join(' ')).not.toContain('aren’t carrying');
  });
  it('leaves GIVE THING alone', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['wallet'] });
    expect(execute({ action: 'give', target: 'wallet' }, { world, state: s }).understood).not.toBe(false);
  });
  it('no split fits: today’s reply', () => {
    expect(play('give neighbor trombone').lines.join(' ')).toContain('aren’t carrying');
  });
});

describe('WEAR takes first', () => {
  it('takes it from the floor, then wears it', () => {
    const s = stateWith(world, { room: 'living' });
    const r = execute({ action: 'wear', target: 'shirt' }, { world, state: s });
    expect(r.lines[0]).toBe('(first taking the loud shirt)');
    expect(r.lines).not.toContain('Taken: loud shirt.');
    expect(s.locations.shirt).toBe('player');
    expect(s.firedEvents).toContain('wear_shirt');
  });
  it('a refused take changes nothing', () => {
    const w: World = { ...world, items: { ...world.items, shirt: { ...world.items.shirt, instead: { take: [{ say: ['Not yours to take.'] }] } } } };
    const s = stateWith(w, { room: 'living' });
    const before = structuredClone(s);
    expect(execute({ action: 'wear', target: 'shirt' }, { world: w, state: s }).lines).toEqual(['Not yours to take.']);
    expect(s.locations).toEqual(before.locations);
  });
  it('carried: as before', () => {
    const s = stateWith(world, { room: 'living', carrying: ['shirt'] });
    expect(execute({ action: 'wear', target: 'shirt' }, { world, state: s }).lines[0]).not.toBe('(first taking the loud shirt)');
  });
});

describe('answering “both”', () => {
  it('TAKE: takes each', () => {
    const game = createGame(world, { seed: 1 });
    game.state.currentRoom = 'living';
    expect(game.send('take key').lines[0]).toMatch(/^Which do you mean/);
    const lines = game.send('both').lines.join('\n');
    expect(lines).toContain('brass key');
    expect(lines).toContain('rusty key');
    expect(game.state.locations.key).toBe('player');
    expect(game.state.locations.rusty_key).toBe('player');
  });
  it('GIVE: one at a time, and the question stays open', () => {
    const game = createGame(world, { seed: 1 });
    game.state.currentRoom = 'yard';
    Object.assign(game.state.locations, { key: 'player', rusty_key: 'player' });
    expect(game.send('give key to neighbor').lines[0]).toMatch(/^Which do you mean/);
    expect(game.send('both').lines).toEqual(['One at a time: the brass key or the rusty key?']);
    const last = game.send('rusty').lines.join(' ');
    expect(last).not.toContain('One at a time');
    // The neighbor refuses the brass key with “Keep your key.”; “No thanks.” is the reply to the rusty key.
    expect(last).toContain('No thanks.');
    expect(last).not.toContain('Keep your key.');
  });
  it('TAKE: each in the order the question listed them', () => {
    const game = createGame(world, { seed: 1 });
    game.state.currentRoom = 'living';
    const ask = game.send('take key').lines[0];
    const lines = game.send('both').lines;
    const order = (ask.indexOf('brass') < ask.indexOf('rusty')) ? ['brass key', 'rusty key'] : ['rusty key', 'brass key'];
    const at = (n: string) => lines.findIndex((l) => l.startsWith(`${n}:`));
    expect(at(order[0])).toBeGreaterThanOrEqual(0);
    expect(at(order[0])).toBeLessThan(at(order[1]));
  });
  it('DROP: drops each', () => {
    const game = createGame(world, { seed: 1 });
    game.state.currentRoom = 'living';
    Object.assign(game.state.locations, { key: 'player', rusty_key: 'player' });
    expect(game.send('drop key').lines[0]).toMatch(/^Which do you mean/);
    game.send('both');
    expect(game.state.locations.key).toBe('living');
    expect(game.state.locations.rusty_key).toBe('living');
  });
  it('TAKE in Infocom style: keys in an open container are both taken', () => {
    const w: World = {
      ...world,
      style: 'infocom',
      rooms: { ...world.rooms, living: { ...world.rooms.living, dark: false, items: ['box'] } },
      items: {
        ...world.items,
        box: { name: 'box', description: 'A box.', portable: false, tags: [], container: { openable: true, open: true } },
      },
    };
    const game = createGame(w, { seed: 1 });
    game.state.currentRoom = 'living';
    Object.assign(game.state.locations, { key: 'box', rusty_key: 'box', box: 'living' });
    expect(game.send('take key').lines[0]).toMatch(/^Which/);
    game.send('both');
    expect(game.state.locations.key).toBe('player');
    expect(game.state.locations.rusty_key).toBe('player');
  });
});

describe('BURN and THROW … AT rank people with objects', () => {
  const fiery: World = { ...world, items: { ...world.items, torch: { name: 'torch', description: 'A torch.', portable: true, tags: [], flaming: true } } };
  it('THROW X AT a person among things named after them: the person', () => {
    const s = stateWith(fiery, { room: 'yard', carrying: ['wallet'] });
    const r = execute({ action: 'throw', target: 'wallet', indirect: 'neighbor' }, { world: fiery, state: s });
    expect(r.ask).toBeUndefined();
    expect(r.lines).toEqual(['The wallet isn’t something you can throw at them.']);
    expect(s.locations.wallet).toBe('player');
  });
  it('BURN a person among things named after them: the refusal, in both styles', () => {
    for (const w of [fiery, { ...fiery, style: 'infocom' as const }]) {
      const s = stateWith(w, { room: 'yard', carrying: ['torch'] });
      const r = execute({ action: 'burn', target: 'neighbor', indirect: 'torch' }, { world: w, state: s });
      expect(r.ask).toBeUndefined();
      expect(r.lines).toEqual(['You can’t burn a Neighbor.']);
    }
  });
  it('BURN still prefers an object on a tie', () => {
    const s = stateWith(fiery, { room: 'yard', carrying: ['torch'] });
    expect(execute({ action: 'burn', target: 'banner', indirect: 'torch' }, { world: fiery, state: s }).lines).toEqual(['You can’t burn a banner.']);
  });
});

describe('ATTACK and SMASH without combat rank people too', () => {
  const peaceful: World = { ...world, combat: undefined, npcs: { ...world.npcs, guard: { ...world.npcs.guard, combat: undefined } } };
  const run = (verb: string, target: string) => {
    const s = stateWith(peaceful, { room: 'yard' });
    const before = structuredClone(s.locations);
    const r = execute({ action: verb, target }, { world: peaceful, state: s });
    return { r, s, before };
  };
  it('ATTACK and SMASH a person: an understood refusal that changes nothing', () => {
    for (const verb of ['attack', 'smash']) {
      const { r, s, before } = run(verb, 'neighbor');
      expect(r.ask).toBeUndefined();
      expect(r.lines).toEqual(['Violence isn’t the answer to this one.']);
      expect(s.locations).toEqual(before);
    }
  });
  it('a misspelled person: the tease, then the same line', () => {
    const { r } = run('attack', 'neighbr');
    expect(r.lines).toEqual(['“neighbr”? You mean the Neighbor.', 'Violence isn’t the answer to this one.']);
  });
  it('an object still smashes as before', () => {
    const s = stateWith(peaceful, { room: 'bedroom' });
    const r = execute({ action: 'attack', target: 'alarm clock' }, { world: peaceful, state: s });
    expect(r.lines[0]).toBe('🔨 You smash the alarm clock.');
    expect(s.locations.alarm).toBeNull();
  });
});
