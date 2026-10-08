import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../../src/engine/conditions';
import { execute } from '../../src/engine/engine';
import { isLit } from '../../src/engine/light';
import type { GameState } from '../../src/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (s: GameState, action: string, target?: string) => execute(target ? { action, target } : { action }, { world, state: s });
const cellar = (carrying: string[] = []) => stateWith(world, { room: 'cellar', carrying });

describe('darkness', () => {
  it('a dark room is lit only by a light that’s on and visible', () => {
    const s = cellar(['lamp']);
    expect(isLit(world, s)).toBe(false);
    s.itemState.lamp = { on: true };
    expect(isLit(world, s)).toBe(true);
    s.locations.jar = 'cellar';
    s.locations.lamp = 'jar';
    expect(isLit(world, s)).toBe(true); // through the transparent jar
    world.items.jar.container!.transparent = false;
    try {
      expect(isLit(world, s)).toBe(false); // shut in an opaque jar
    } finally {
      world.items.jar.container!.transparent = true;
    }
    s.locations.lamp = 'cellar';
    expect(isLit(world, s)).toBe(true); // a lit lamp on the floor
    expect(isLit(world, s, 'shed')).toBe(true); // a room that isn't dark
  });

  it('in the dark, LOOK shows the darkness line and nothing of the room', () => {
    expect(run(cellar(), 'look').lines).toEqual(['📍 Darkness', 'It is pitch black.']);
  });

  it('a dark-room TAKE of something really there is understood and changes nothing', () => {
    const s = cellar();
    const before = structuredClone(s);
    const r = run(s, 'take', 'barrel');
    expect(r.lines).toEqual(['It’s too dark to see.']);
    expect(r.understood).not.toBe(false);
    expect(s).toEqual(before); // takes no time either: no turn, no daemons
  });

  it('only real directions blunder; other phrasings in the dark go to the LLM as misses', () => {
    const s = cellar();
    const before = structuredClone(s);
    for (const target of ['upstairs', 'the living room', 'back', 'away']) {
      expect(run(s, 'go', target).understood).toBe(false);
    }
    expect(s).toEqual(before);
    expect(run(s, 'go', 'northwest').lines).toEqual(['You trip in the dark.']);
  });

  it('a dark room isn’t visited until you’ve seen it', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'shed', carrying: ['key', 'lamp'] });
    const go = (t: string) => execute({ action: 'go', target: t }, { world: w, state: s }).lines;
    go('down');
    go('up');
    s.itemState.lamp = { on: true };
    expect(go('down')).toContain('A damp cellar.');
  });

  it('inventory and carried things still work in the dark', () => {
    const s = cellar(['lamp']);
    expect(run(s, 'inventory').lines[0]).toBe('You are carrying:');
    expect(run(s, 'turn_on', 'lamp').lines[0]).toBe('The lamp is now on.');
  });

  it('light arriving or leaving says so, once', () => {
    const s = cellar(['lamp']);
    const on = run(s, 'turn_on', 'lamp').lines;
    expect(on).toContain('A damp cellar.');
    expect(on.filter((l) => l === 'A damp cellar.')).toHaveLength(1);
    expect(run(s, 'turn_off', 'lamp').lines).toEqual(['The lamp is now off.', 'It is now pitch black.']);
  });

  it('carrying a lit lamp into a dark room shows the room', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['lamp'] });
    s.itemState.lamp = { on: true };
    expect(run(s, 'go', 'down').lines).toContain('A damp cellar.');
  });

  it('blundering in the dark runs the world’s blunder steps; real exits still work', () => {
    const s = cellar(['key']); // the shed upstairs needs the key
    expect(run(s, 'go', 'north').lines).toEqual(['You trip in the dark.']);
    run(s, 'go', 'up');
    expect(s.currentRoom).toBe('shed');
  });

  it('lit:here and lit:ROOM are conditions', () => {
    const s = cellar();
    expect(evaluateCondition('lit:here', s, world)).toBe(false);
    expect(evaluateCondition('lit:shed', s, world)).toBe(true);
  });
});

describe('litIf (5a)', () => {
  it('lights every room while its condition holds', async () => {
    const { isLit } = await import('../../src/engine/model');
    const { fixtureWorld } = await import('../fixtures/world');
    const { stateWith } = await import('../helpers/state');
    const w = { ...fixtureWorld, darkness: { ...fixtureWorld.darkness, litIf: 'flag:dead' } };
    const s = stateWith(w, { room: 'cellar' });
    expect(isLit(w, s)).toBe(false);
    s.flags.dead = true;
    expect(isLit(w, s)).toBe(true);
  });
});

describe('dark moves (5b)', () => {
  const darkShed = async () => {
    const { fixtureWorld } = await import('../fixtures/world');
    return {
      ...fixtureWorld,
      rooms: { ...fixtureWorld.rooms, shed: { ...fixtureWorld.rooms.shed, dark: true, requires: undefined } },
      darkness: { ...fixtureWorld.darkness, stumble: { chance: 100, then: [{ die: 'Grue.' }] } },
    };
  };
  it('unlit to unlit may kill', async () => {
    const world = await darkShed();
    const { stateWith } = await import('../helpers/state');
    const { execute } = await import('../../src/engine/engine');
    const s = stateWith(world, { room: 'shed' });
    expect(execute({ action: 'go', target: 'down' }, { world, state: s }).lines[0]).toBe('Grue.');
  });
  it('never with a light, never from a lit room', async () => {
    const world = await darkShed();
    const { stateWith } = await import('../helpers/state');
    const { execute } = await import('../../src/engine/engine');
    const lit = stateWith(world, { room: 'shed', carrying: ['lamp'] });
    lit.itemState.lamp = { on: true };
    expect(execute({ action: 'go', target: 'down' }, { world, state: lit }).lines[0]).not.toBe('Grue.');
    const fromLit = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'go', target: 'north' }, { world, state: fromLit }).lines[0]).not.toBe('Grue.');
  });
});

describe('arriving in the dark (5d)', () => {
  it('darkness.arrive is said on entering an unlit room, before the darkness line; not with a light', async () => {
    const { fixtureWorld } = await import('../fixtures/world');
    const { stateWith } = await import('../helpers/state');
    const { execute } = await import('../../src/engine/engine');
    const world = { ...fixtureWorld, darkness: { ...fixtureWorld.darkness, arrive: 'You have moved into a dark place.' } };
    const s = stateWith(world, { room: 'shed' });
    const lines = execute({ action: 'go', target: 'down' }, { world, state: s }).lines;
    expect(lines[0]).toBe('You have moved into a dark place.');
    expect(lines).toContain('It is pitch black.');
    const lit = stateWith(world, { room: 'shed', carrying: ['lamp'] });
    lit.itemState.lamp = { on: true };
    expect(execute({ action: 'go', target: 'down' }, { world, state: lit }).lines).not.toContain('You have moved into a dark place.');
  });
});

describe('EXAMINE in the dark, and LIGHT a burning thing', () => {
  const crowded = { ...world, rooms: { ...world.rooms, cellar: { ...world.rooms.cellar, npcs: ['neighbor'] } } };
  const exec = (w: typeof world, s: GameState, action: string, target: string) => execute({ action, target }, { world: w, state: s });

  it('EXAMINE a character in the dark gives the darkness reply', () => {
    const s = stateWith(crowded, { room: 'cellar' });
    const before = structuredClone(s);
    const r = exec(crowded, s, 'examine', 'neighbor');
    expect(r.lines.join(' ')).toMatch(/too dark/i);
    expect(s).toEqual(before);
  });

  it('and still describes them with a light', () => {
    const s = stateWith(crowded, { room: 'cellar', carrying: ['lamp'] });
    s.itemState.lamp = { on: true };
    expect(exec(crowded, s, 'examine', 'neighbor').lines.join(' ')).toContain('Your neighbor');
  });

  it('LIGHT a burning thing with no switch', () => {
    const w = { ...world, items: { ...world.items, torch: { name: 'torch', description: 'A torch.', portable: true, tags: [], flaming: true } } };
    const s = stateWith(w, { carrying: ['torch'] });
    expect(exec(w, s, 'turn_on', 'torch').lines.join(' ')).toBe('It’s already lit.');
  });

  it('LIGHT still says you can’t on a plain thing', () => {
    const w = { ...world, items: { ...world.items, rock: { name: 'rock', description: 'A rock.', portable: true, tags: [] } } };
    const s = stateWith(w, { carrying: ['rock'] });
    expect(exec(w, s, 'turn_on', 'rock').lines.join(' ')).toContain('can’t turn that on');
  });
});
