import { describe, expect, it } from 'vitest';
import { execute } from '../../src/engine/engine';
import { fallbackParse } from '../../src/engine/parser';
import type { ParsedAction } from '../../src/types/game';
import type { World } from '../../src/types/world';
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

describe('first-seen sentences come first (PRINT-CONT) (5b)', () => {
  it('lists untouched things with their own first sentence before the rest', () => {
    const world: World = {
      ...w,
      items: { ...w.items, gem: { name: 'gem', description: 'A gem.', initialDescription: 'A gem glints in the dust.', portable: true, tags: [] } },
    };
    const s = stateWith(world, { room: 'yard' });
    for (const id of Object.keys(s.locations)) if (s.locations[id] === 'yard') s.locations[id] = null;
    // Newest is listed first in Infocom style: the bat, placed last, would otherwise lead.
    s.locations.gem = 'yard';
    s.placed = { ...s.placed, gem: 1, bat: 99 };
    s.locations.bat = 'yard';
    const lines = run(s, { action: 'look' }, world);
    expect(lines.indexOf('A gem glints in the dust.')).toBeLessThan(lines.indexOf('There is a bat here.'));
  });
});

describe('EXAMINE a closed container (5b)', () => {
  it('says it’s closed, not empty', () => {
    const world: World = { ...w, items: { ...w.items, box: { name: 'box', description: '', portable: true, tags: [], container: { openable: true }, contains: ['marble'] } } };
    const s = stateWith(world, { room: 'living' });
    s.locations.box = 'living';
    expect(run(s, { action: 'examine', target: 'box' }, world)).toEqual(['The box is closed.']);
  });
});

describe('opening a container touches it (V-OPEN’s TOUCHBIT) (5d)', () => {
  it('its first-seen sentence gives way to the plain listing', () => {
    const world: World = {
      ...w,
      items: { ...w.items, sack: { name: 'brown sack', description: '', portable: true, tags: [], initialDescription: 'On the table is a sack.', container: { openable: true, open: false } } },
    };
    const s = stateWith(world, { room: 'bedroom' });
    s.locations.sack = 'bedroom';
    expect(run(s, { action: 'look' }, world)).toContain('On the table is a sack.');
    run(s, { action: 'open', target: 'sack' }, world);
    const after = run(s, { action: 'look' }, world);
    expect(after).not.toContain('On the table is a sack.');
    expect(after).toContain('There is a brown sack here.');
  });
});

describe('touched things on a scenery surface read as if on the floor (Release 119) (5d)', () => {
  it('“There is a brown sack here.”, not “Sitting on the kitchen table is:”', () => {
    const world: World = {
      ...w,
      items: {
        ...w.items,
        table: { name: 'kitchen table', description: '', portable: false, tags: [], scenery: true, surface: true },
        sack: { name: 'brown sack', description: '', portable: true, tags: [], initialDescription: 'On the table is a sack.', container: { openable: true, open: true } },
      },
    };
    const s = stateWith(world, { room: 'bedroom' });
    s.locations.table = 'bedroom';
    s.locations.sack = 'table';
    s.itemState.sack = { moved: true, open: true };
    const lines = run(s, { action: 'look' }, world);
    expect(lines).toContain('There is a brown sack here.');
    expect(lines.join(' ')).not.toContain('Sitting on the kitchen table is:');
  });
});

describe('THROW X IN Y is PUT (Zork’s syntax) (5d)', () => {
  it('parses the preposition, and in Infocom style puts it in', () => {
    expect(fallbackParse('throw sceptre in boat')).toEqual({ action: 'throw', target: 'sceptre', indirect: 'boat', prep: 'in' });
    expect(fallbackParse('throw axe at troll')).toEqual({ action: 'throw', target: 'axe', indirect: 'troll' });
    const world: World = { ...w, items: { ...w.items, box: { name: 'box', description: '', portable: false, tags: [], container: { open: true } } } };
    const s = stateWith(world, { room: 'bedroom', carrying: ['note'] });
    s.locations.box = 'bedroom';
    expect(run(s, { action: 'throw', target: 'note', indirect: 'box', prep: 'in' }, world)).toEqual(['Done.']);
    expect(s.locations.note).toBe('box');
  });
});

describe('a lit light on the floor says so (5d)', () => {
  it('“There is a pair of candles here (providing light).”', () => {
    const world: World = { ...w, items: { ...w.items, candles: { name: 'pair of candles', article: 'a', description: '', portable: true, tags: [], light: true, switchable: true } } };
    const s = stateWith(world, { room: 'bedroom' });
    s.locations.candles = 'bedroom';
    s.itemState.candles = { on: true, moved: true };
    expect(run(s, { action: 'look' }, world)).toContain('There is a pair of candles here (providing light).');
  });
});

describe('a scenery container’s contents go a level deeper after floor items (PRINT-CONT’s LEVEL) (5d)', () => {
  it('the trophy case’s list is indented further once something else was listed', () => {
    const world: World = {
      ...w,
      items: {
        ...w.items,
        case: { name: 'trophy case', description: '', portable: false, tags: [], scenery: true, container: { open: true, transparent: true }, contentsHeading: 'Your collection of treasures consists of:' },
        gem: { name: 'gem', description: '', portable: true, tags: [] },
        sock: { name: 'sock', description: '', portable: true, tags: [] },
      },
    };
    const s = stateWith(world, { room: 'bedroom' });
    for (const id of Object.keys(s.locations)) if (s.locations[id] === 'bedroom') s.locations[id] = null;
    s.locations.case = 'bedroom';
    s.locations.gem = 'case';
    expect(run(s, { action: 'look' }, world)).toEqual(expect.arrayContaining(['Your collection of treasures consists of:', '  A gem']));
    s.locations.sock = 'bedroom';
    s.itemState.sock = { moved: true };
    const lines = run(s, { action: 'look' }, world);
    expect(lines).toContain('There is a sock here.');
    expect(lines).toEqual(expect.arrayContaining(['Your collection of treasures consists of:', '    A gem']));
  });
});

describe('a character who just arrived is listed before the room’s things (object order) (5d)', () => {
  it('moved in this turn: first', async () => {
    const { runSteps } = await import('../../src/engine/effects');
    const s = stateWith(w, { room: 'shed' });
    s.locations.note = 'shed';
    s.itemState.note = { moved: true };
    s.npcs = { guard: { room: null } };
    const { describeCurrentRoom } = await import('../../src/engine/engine');
    runSteps([{ moveNpc: 'guard', to: 'shed' }], w, s);
    // Described in the same turn he arrived (the thief rushing into his lair as you climb up).
    const lines = describeCurrentRoom(w, s);
    const guard = lines.findIndex((l) => l.startsWith('A guard'));
    const note = lines.indexOf('There is a note here.');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(note);
  });
});

describe('final review fixes (5d, brass)', () => {
  it('THROW X IN Y with no rule is a miss in brass (the intent server can read it as PUT)', () => {
    const s = stateWith(fixtureWorld, { room: 'bedroom', carrying: ['bat'] });
    const r = execute({ action: 'throw', target: 'bat', indirect: 'bed', prep: 'in' }, { world: fixtureWorld, state: s });
    expect(r.understood).toBe(false);
    expect(s.locations.bat).toBe('player');
  });
  it('turning off something that can’t be switched is a miss in brass', () => {
    const s = stateWith(fixtureWorld, { room: 'bedroom', carrying: ['bat'] });
    expect(execute({ action: 'turn_off', target: 'bat' }, { world: fixtureWorld, state: s }).understood).toBe(false);
  });
});

describe('READ’s automatic take (fast follow)', () => {
  it('runs the thing’s after-take rules, and leaves alone what’s in a container you carry', () => {
    const world: World = {
      ...w,
      events: { ...w.events, scored: [{ set: 'took_scroll' }] },
      items: {
        ...w.items,
        scroll: { name: 'scroll', description: '', text: 'Words.', portable: true, tags: [], after: { take: [{ then: 'scored' }] } },
        pouch: { name: 'pouch', description: '', portable: true, tags: [], container: { open: true } },
      },
    };
    const s = stateWith(world, { room: 'bedroom' });
    s.locations.scroll = 'bedroom';
    expect(run(s, { action: 'read', target: 'scroll' }, world)).toEqual(['(Taken)', 'Words.']);
    expect(s.flags.took_scroll).toBe(true);
    s.locations.pouch = 'player';
    s.locations.scroll = 'pouch';
    expect(run(s, { action: 'read', target: 'scroll' }, world)).toEqual(['Words.']);
    expect(s.locations.scroll).toBe('pouch');
  });
});

describe('ENTER a thing, Infocom style (V-THROUGH) (fast follow)', () => {
  it('a fixed thing: hit your head; a carried one: a contortion; anything else: a joke', () => {
    const s = stateWith(w, { room: 'bedroom', carrying: ['note'] });
    s.locations.tub = 'bedroom';
    expect(run(s, { action: 'enter', target: 'tub' })).toEqual(['You hit your head against the tub as you attempt this feat.']);
    expect(run(s, { action: 'enter', target: 'note' })).toEqual(['That would involve quite a contortion!']);
    s.locations.note = 'bedroom';
    expect(['A valiant attempt.', 'You can’t be serious.', 'An interesting idea...', 'What a concept!']).toContain(run(s, { action: 'enter', target: 'note' })[0]);
  });
});

describe('a character stays listed first until something else moves in (fast follow)', () => {
  it('first on the turn he arrives and after; a thing dropped later comes before him', async () => {
    const { runSteps } = await import('../../src/engine/effects');
    const { describeCurrentRoom } = await import('../../src/engine/engine');
    const s = stateWith(w, { room: 'shed', carrying: ['note'] });
    s.npcs = { guard: { room: null } };
    runSteps([{ moveNpc: 'guard', to: 'shed' }], w, s);
    run(s, { action: 'wait' });
    let lines = describeCurrentRoom(w, s);
    expect(lines.findIndex((l) => l.startsWith('A guard'))).toBeGreaterThan(-1);
    run(s, { action: 'drop', target: 'note' });
    lines = describeCurrentRoom(w, s);
    expect(lines.indexOf('There is a note here.')).toBeLessThan(lines.findIndex((l) => l.startsWith('A guard')));
    const s2 = stateWith(w, { room: 'shed' });
    s2.locations.note = 'shed';
    s2.itemState.note = { moved: true };
    s2.npcs = { guard: { room: null } };
    runSteps([{ moveNpc: 'guard', to: 'shed' }], w, s2);
    run(s2, { action: 'wait' });
    lines = describeCurrentRoom(w, s2);
    expect(lines.findIndex((l) => l.startsWith('A guard'))).toBeLessThan(lines.indexOf('There is a note here.'));
  });
});

describe('final review fixes (1.12.5): one sequence for things and characters', () => {
  it('a character who has wandered a lot is still listed after a thing put down later', async () => {
    const { runSteps } = await import('../../src/engine/effects');
    const { describeCurrentRoom } = await import('../../src/engine/engine');
    const s = stateWith(w, { room: 'shed', carrying: ['note'] });
    s.npcs = { guard: { room: null } };
    for (const r of ['yard', 'bedroom', 'yard', 'shed']) runSteps([{ moveNpc: 'guard', to: r }], w, s);
    run(s, { action: 'drop', target: 'note' });
    const lines = describeCurrentRoom(w, s);
    expect(lines.indexOf('There is a note here.')).toBeLessThan(lines.findIndex((l) => l.startsWith('A guard')));
  });
});

describe('READ’s automatic take fires onTake once (backlog clear-out)', () => {
  it('a second READ after a DROP doesn’t fire it again', () => {
    const world: World = {
      ...w,
      events: { ...w.events, first_touch: ['A chill runs down your spine.'] },
      items: { ...w.items, scroll: { name: 'scroll', description: '', text: 'Words.', portable: true, tags: [], onTake: 'first_touch' } },
    };
    const s = stateWith(world, { room: 'bedroom' });
    s.locations.scroll = 'bedroom';
    expect(run(s, { action: 'read', target: 'scroll' }, world)).toContain('A chill runs down your spine.');
    run(s, { action: 'drop', target: 'scroll' }, world);
    expect(run(s, { action: 'read', target: 'scroll' }, world)).not.toContain('A chill runs down your spine.');
  });
});

describe('EXAMINE a door (V-LOOK-INSIDE’s DOORBIT) (6a)', () => {
  it('closed, it says so; open, it can’t tell what’s beyond', () => {
    const world: World = { ...w, items: { ...w.items, hatch: { ...w.items.hatch, description: '' } } };
    const s = stateWith(world, { room: 'shed' });
    expect(run(s, { action: 'examine', target: 'hatch' }, world)).toEqual(['The hatch is closed.']);
    run(s, { action: 'open', target: 'hatch' }, world);
    expect(run(s, { action: 'examine', target: 'hatch' }, world)).toEqual(['The hatch is open, but I can’t tell what’s beyond it.']);
  });
});
