import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import type { ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

// Zork's verbs, as 5a's scripted sessions found them.
const w: World = {
  ...fixtureWorld,
  style: 'infocom',
  items: {
    ...fixtureWorld.items,
    note: { name: 'note', description: '', text: '“Back soon.”', portable: true, tags: [] },
    tub: { name: 'tub', description: 'A tub.', portable: false, tags: [] },
    puddle: { name: 'water', description: 'A puddle.', portable: false, tags: [], scenery: true },
    flask: { name: 'quantity of water', aliases: ['water'], description: 'Wet.', portable: true, tags: [], instead: { pour: [{ say: ['Splash.'] }] } },
  },
  verbs: { ...fixtureWorld.verbs, pour: { words: ['pour'], target: 'required', held: true } },
};
const run = (s: ReturnType<typeof stateWith>, a: ParsedAction, world: World = w) => execute(a, { world, state: s }).lines;

describe('Infocom verbs (5a)', () => {
  it('EXAMINE prints the text of a readable thing with no description', () => {
    const s = stateWith(w, { room: 'living' });
    s.locations.note = 'living';
    expect(run(s, { action: 'examine', target: 'note' })).toEqual(['“Back soon.”']);
  });
  it('READ takes a thing first, as Zork’s parser does', () => {
    const s = stateWith(w, { room: 'living' });
    s.locations.note = 'living';
    expect(run(s, { action: 'read', target: 'note' })).toEqual(['(Taken)', '“Back soon.”']);
    expect(s.locations.note).toBe('player');
    const b = stateWith(fixtureWorld, { room: 'living' });
    b.locations.note = 'living';
    run(b, { action: 'read', target: 'note' }, { ...fixtureWorld, items: w.items });
    expect(b.locations.note).toBe('living');
  });
  it('PUT … ON something that isn’t a surface', () => {
    const s = stateWith(w, { room: 'living', carrying: ['key'] });
    s.locations.tub = 'living';
    expect(run(s, { action: 'put', target: 'key', indirect: 'tub', prep: 'on' })).toEqual(['There’s no good surface on the tub.']);
  });
  it('held includes things inside what you carry', () => {
    const world: World = { ...w, items: { ...w.items, jar: { ...w.items.jar, container: { open: true } } } };
    const s = stateWith(world, { room: 'living', carrying: ['jar'] });
    s.locations.flask = 'jar';
    s.locations.puddle = 'living';
    expect(run(s, fallbackParse('pour water', world.verbs)!, world)).toEqual(['Splash.']);
    const closed: World = { ...world, items: { ...world.items, jar: { ...world.items.jar, container: { openable: true, transparent: true } } } };
    const t = stateWith(closed, { room: 'living', carrying: ['jar'] });
    t.locations.flask = 'jar';
    expect(run(t, fallbackParse('pour water', closed.verbs)!, closed)).toEqual(['Splash.']);
  });
  it('a world verb that wants a held thing picks from what you carry', () => {
    const s = stateWith(w, { room: 'living', carrying: ['flask'] });
    s.locations.puddle = 'living';
    expect(run(s, fallbackParse('pour water', w.verbs)!)).toEqual(['Splash.']);
  });
});

describe('local globals give way (5a)', () => {
  it('a room’s scenery is matched only when nothing else is (Zork’s GLOBAL-CHECK)', () => {
    const world: World = { ...w, items: { ...w.items, kite: { name: 'kite', aliases: ['sky'], description: 'A blue kite, sky-coloured.', portable: true, tags: [] } } };
    const s = stateWith(world, { room: 'yard', carrying: ['kite'] });
    expect(run(s, { action: 'examine', target: 'sky' }, world)).toEqual(['A blue kite, sky-coloured.']);
    const t = stateWith(world, { room: 'yard' });
    expect(run(t, { action: 'examine', target: 'sky' }, world).join(' ')).not.toMatch(/kite/);
  });
});

describe('more of Zork’s habits (5a)', () => {
  it('rules on the second object come first (PRSI before PRSO)', () => {
    const world: World = {
      ...w,
      items: {
        ...w.items,
        flask: { ...w.items.flask, instead: { pour: [{ say: ['Splash.'] }] } },
        tub: { ...w.items.tub, instead: { pour: [{ as: 'indirect', say: ['The tub hisses.'] }] } },
      },
      verbs: { ...w.verbs, pour: { words: ['pour'], target: 'required', held: true, indirect: ['on'] } },
    };
    const s = stateWith(world, { room: 'living', carrying: ['flask'] });
    s.locations.tub = 'living';
    expect(run(s, fallbackParse('pour water on tub', world.verbs)!, world)).toEqual(['The tub hisses.']);
  });
  it('opening a container whose one untouched thing has a first-seen sentence', () => {
    const world: World = {
      ...w,
      items: {
        ...w.items,
        box: { name: 'box', description: '', portable: false, tags: [], container: { openable: true }, contains: ['gem'] },
        gem: { name: 'gem', description: 'A gem.', initialDescription: 'A gem glitters in the box.', portable: true, tags: [] },
      },
    };
    const s = stateWith(world, { room: 'living' });
    s.locations.box = 'living';
    expect(run(s, { action: 'open', target: 'box' }, world)).toEqual(['The box opens.', 'A gem glitters in the box.']);
  });
  it('a room lists each thing’s contents right after it', () => {
    const world: World = {
      ...w,
      items: {
        ...w.items,
        jug: { name: 'jug', description: '', portable: true, tags: [], container: { open: true }, contains: ['marble'] },
        bat: { ...w.items.bat },
      },
    };
    const s = stateWith(world, { room: 'yard' });
    for (const id of Object.keys(s.locations)) if (s.locations[id] === 'yard') s.locations[id] = null;
    s.locations.jug = 'yard';
    s.locations.bat = 'yard';
    s.locations.marble = 'jug';
    const lines = run(s, { action: 'look' }, world);
    const jug = lines.findIndex((l) => /jug/.test(l));
    expect(lines[jug + 1]).toMatch(/jug contains/);
  });
});

describe('final review fixes (5a)', () => {
  it('TURN and PLUG … WITH miss on words that name nothing, and take no turn', () => {
    const s = stateWith(w, { room: 'living' });
    const before = JSON.stringify(s);
    expect(run(s, { action: 'turn', target: 'xyzzy', indirect: 'foo' }).length).toBeGreaterThan(0);
    expect(execute({ action: 'turn', target: 'xyzzy', indirect: 'foo' }, { world: w, state: s }).understood).toBe(false);
    expect(execute({ action: 'plug', target: 'foo', indirect: 'bar' }, { world: w, state: s }).understood).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('READ still reads when the take it tries fails', () => {
    const world: World = { ...w, carry: { limit: 1 }, items: { ...w.items, note: { ...w.items.note, size: 5 } } };
    const s = stateWith(world, { room: 'living' });
    s.locations.note = 'living';
    expect(run(s, { action: 'read', target: 'note' }, world)).toEqual(['“Back soon.”']);
    expect(s.locations.note).toBe('living');
  });
  it('brass worlds keep their own EXAMINE and questions', () => {
    const brass: World = { ...w, style: 'brass', items: { ...w.items, kite: { name: 'kite', aliases: ['sky'], description: 'A kite.', portable: true, tags: [] } } };
    const s = stateWith(brass, { room: 'living' });
    s.locations.note = 'living';
    expect(run(s, { action: 'examine', target: 'note' }, brass)).toEqual(['There’s nothing special about the note.']);
    const t = stateWith(brass, { room: 'yard', carrying: ['kite'] });
    expect(run(t, { action: 'examine', target: 'sky' }, brass).join(' ')).toMatch(/Which/);
  });
});
