import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '@/engine/conditions';
import { execute } from '@/engine/engine';
import { isLit } from '@/engine/light';
import type { GameState } from '@/types/game';
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
    const { isLit } = await import('@/engine/model');
    const { fixtureWorld } = await import('../fixtures/world');
    const { stateWith } = await import('../helpers/state');
    const w = { ...fixtureWorld, darkness: { ...fixtureWorld.darkness, litIf: 'flag:dead' } };
    const s = stateWith(w, { room: 'cellar' });
    expect(isLit(w, s)).toBe(false);
    s.flags.dead = true;
    expect(isLit(w, s)).toBe(true);
  });
});
