import { evaluateCondition } from '@/engine/conditions';
import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import { execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { auditWorld } from '../helpers/audit';
import { fixtureWorld } from '../fixtures/world';

// Followers (6a): characters that move with the player (Zork II's dragon and
// princess, Zork III's Dungeon Master).
const w: World = {
  ...fixtureWorld,
  rooms: {
    ...fixtureWorld.rooms,
    bedroom: { ...fixtureWorld.rooms.bedroom, npcs: ['dog', 'cat'] },
  },
  npcs: {
    ...fixtureWorld.npcs,
    dog: { name: 'dog', description: 'A dog wags its tail.', follows: 'flag:leash', followLine: 'The dog trots after you.' },
    cat: { name: 'cat', description: 'A cat sits here.', follows: 'flag:leash' },
  },
  events: {
    ...fixtureWorld.events,
    shove: [{ go: 'living' }],
  },
};

const run = (s: GameState, input: string, world: World = w) => execute(fallbackParse(input, world.verbs)!, { world, state: s });

describe('followers (6a)', () => {
  it('follows on GO, says so after the room, and lists after what is already there', () => {
    const s = stateWith(w, { room: 'bedroom', flags: ['leash'] });
    const r = run(s, 'go west');
    expect(s.currentRoom).toBe('living');
    expect(s.npcs?.dog?.room).toBe('living');
    const lines = r.lines;
    expect(lines.indexOf('The dog trots after you.')).toBeGreaterThan(lines.findIndex((l) => l.includes('Living Room')));
    // A line only the brass style prints for a follower without its own.
    expect(lines).toContain('Cat follows you.');
    expect(lines.at(-2)).toBe('The dog trots after you.');
    expect(lines.at(-1)).toBe('Cat follows you.');
  });

  it('stays put when its condition fails, or when it was not in the room you left', () => {
    const s = stateWith(w, { room: 'bedroom' });
    run(s, 'go west');
    expect(s.npcs?.dog?.room).toBeUndefined();
    const t = stateWith(w, { room: 'living', flags: ['leash'] });
    run(t, 'go east');
    expect(t.npcs?.dog).toBeUndefined();
  });

  it('a dead or hidden follower stays behind', () => {
    const s = stateWith(w, { room: 'bedroom', flags: ['leash'] });
    s.npcs = { dog: { strength: 0 }, cat: { hidden: true } };
    run(s, 'go west');
    expect(s.npcs.dog.room).toBeUndefined();
    expect(s.npcs.cat.room).toBeUndefined();
  });

  it('the condition sees the new room', () => {
    const v: World = { ...w, npcs: { ...w.npcs, dog: { ...w.npcs.dog, follows: 'in:living' }, cat: { ...w.npcs.cat, follows: 'in:bedroom' } } };
    const s = stateWith(v, { room: 'bedroom' });
    run(s, 'go west', v);
    expect(s.npcs?.dog?.room).toBe('living');
    expect(s.npcs?.cat?.room).toBeUndefined();
  });

  it('a refused move moves no one: a closed door, a requires, an exit condition, no exit', () => {
    const v: World = { ...w, rooms: { ...w.rooms, shed: { ...w.rooms.shed, npcs: ['dog'] }, yard: { ...w.rooms.yard, npcs: [] } } };
    const s = stateWith(v, { room: 'shed', flags: ['leash'] });
    run(s, 'go up', v);
    expect(s.currentRoom).toBe('shed');
    expect(s.npcs?.dog?.room).toBeUndefined();
    const t = stateWith(v, { room: 'yard', flags: ['leash'] });
    t.npcs = { dog: { room: 'yard' } };
    run(t, 'go north', v);
    expect(t.currentRoom).toBe('yard');
    expect(t.npcs.dog.room).toBe('yard');
    const u = stateWith(v, { room: 'living', flags: ['leash'] });
    u.npcs = { dog: { room: 'living' } };
    run(u, 'go south', v);
    expect(u.npcs.dog.room).toBe('living');
    const x = stateWith(v, { room: 'living', flags: ['leash'] });
    x.npcs = { dog: { room: 'living' } };
    run(x, 'go north', v);
    expect(x.npcs.dog.room).toBe('living');
  });

  it('goes through an open door, ENTER and CLIMB too', () => {
    const v: World = { ...w, rooms: { ...w.rooms, shed: { ...w.rooms.shed, npcs: [] } } };
    const s = stateWith(v, { room: 'shed', flags: ['leash'] });
    s.npcs = { dog: { room: 'shed' } };
    s.itemState.hatch = { open: true };
    run(s, 'go up', v);
    expect(s.npcs.dog.room).toBe('loft');
    const t = stateWith(v, { room: 'yard', flags: ['leash'] });
    t.npcs = { dog: { room: 'yard' } };
    run(t, 'enter', v);
    expect(t.npcs.dog.room).toBe('living');
    const c = stateWith(v, { room: 'shed', flags: ['leash'] });
    c.npcs = { dog: { room: 'shed' } };
    c.itemState.hatch = { open: true };
    run(c, 'climb up', v);
    expect(c.currentRoom).toBe('loft');
    expect(c.npcs.dog.room).toBe('loft');
  });

  it('a scripted { go } and a death respawn leave it behind', () => {
    const s = stateWith(w, { room: 'bedroom', flags: ['leash'] });
    runSteps([{ run: 'shove' }], w, s);
    expect(s.currentRoom).toBe('living');
    expect(s.npcs?.dog?.room).toBeUndefined();
    const d = stateWith(w, { room: 'living', flags: ['leash'] });
    d.npcs = { dog: { room: 'living' } };
    runSteps([{ run: 'fall_down' }], w, d);
    expect(d.currentRoom).toBe('bedroom');
    expect(d.npcs.dog.room).toBe('living');
  });

  it('{ follow } and { unfollow } work without a follows condition', () => {
    const v: World = { ...w, npcs: { ...w.npcs, dog: { name: 'dog', description: 'A dog wags its tail.' } } };
    const s = stateWith(v, { room: 'bedroom' });
    run(s, 'go west', v);
    expect(s.npcs?.dog).toBeUndefined();
    const t = stateWith(v, { room: 'bedroom' });
    runSteps([{ follow: 'dog' }], v, t);
    // Kept in the character's state (an optional field: saves stay format 2.0), not a flag.
    expect(t.npcs?.dog?.following).toBe(true);
    expect(t.flags.following_dog).toBeUndefined();
    run(t, 'go west', v);
    expect(t.npcs?.dog?.room).toBe('living');
    runSteps([{ unfollow: 'dog' }], v, t);
    expect(t.npcs?.dog?.following).toBe(false);
    run(t, 'go east', v);
    expect(t.npcs?.dog?.room).toBe('living');
  });

  it('following:NPC reads the character’s state, and a flag of that name means nothing', () => {
    const flagged = stateWith(w, { room: 'bedroom', flags: ['following_dog'] });
    expect(evaluateCondition('following:dog', flagged, w)).toBe(false);
    const s = stateWith(w, { room: 'bedroom' });
    runSteps([{ follow: 'dog' }], w, s);
    const v: World = { ...w, events: { ...w.events, ask: [{ if: 'following:dog', then: ['Heel.'], else: ['Stay.'] }] } };
    expect(runSteps([{ run: 'ask' }], v, s)).toEqual(['Heel.']);
    runSteps([{ unfollow: 'dog' }], v, s);
    expect(runSteps([{ run: 'ask' }], v, s)).toEqual(['Stay.']);
  });

  it('the audit refuses unknown characters in follow, unfollow and following:', () => {
    const bad: World = { ...w, events: { ...w.events, x: [{ follow: 'ghost' }, { unfollow: 'ghost' }, { if: 'following:ghost', then: [] }] } };
    const problems = auditWorld(bad).join('\n');
    expect(problems).toContain('follow names no character “ghost”');
    expect(problems).toContain('unfollow names no character “ghost”');
    expect(problems).toContain('names no character “ghost”');
    expect(auditWorld(w)).toEqual([]);
  });

  it('arrives on the placing sequence, in original order, so it lists as the newest arrival (Infocom)', () => {
    const v: World = { ...w, style: 'infocom', rooms: { ...w.rooms, living: { ...w.rooms.living, npcs: ['neighbor'] } } };
    const s = stateWith(v, { room: 'bedroom', flags: ['leash'] });
    run(s, 'go west', v);
    // Dog (listed first in the bedroom) is stamped before cat, both after everything already placed.
    expect(s.npcs!.dog.seq!).toBeLessThan(s.npcs!.cat.seq!);
    expect(s.npcs!.dog.seq!).toBeGreaterThan(Math.max(...Object.values(s.placed ?? {})));
    // As Zork's MOVE does, characters who just arrived are listed ahead of the room's older contents.
    expect(run(s, 'look', v).lines).toEqual([
      '📍 Living Room',
      'A living room with a table by the door.',
      'A cat sits here.',
      'A dog wags its tail.',
      'A wallet lies by the door.',
      'There is a rusty key here.',
      'There is a loud shirt here.',
      'There is a brass key here.',
      'Your neighbor, leaning on the fence.',
    ]);
  });

  it('Infocom style prints a follow line only when the world gives one', () => {
    const v: World = { ...w, style: 'infocom' };
    const s = stateWith(v, { room: 'bedroom', flags: ['leash'] });
    const r = run(s, 'go west', v);
    expect(r.lines).toContain('The dog trots after you.');
    expect(r.lines).not.toContain('Cat follows you.');
    expect(s.npcs?.cat?.room).toBe('living');
  });
});
