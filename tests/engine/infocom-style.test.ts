import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute } from '@/engine/engine';
import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

// A small Infocom-style world: Zork's conventions for listings, score and doors.
const world: World = {
  ...fixtureWorld,
  style: 'infocom',
  maxScore: 350,
  scoring: [{ flag: 'paid', points: 30 }],
  ranks: [
    { min: 0, title: 'Beginner' },
    { min: 26, title: 'Amateur Adventurer' },
  ],
  rooms: {
    ...fixtureWorld.rooms,
    kitchen: {
      name: 'Kitchen',
      description: 'A kitchen.',
      exits: { east: { to: 'yard', door: 'window', denial: 'Nope.' } },
      items: ['table'],
      npcs: [],
      onEnter: [],
      scenery: ['window'],
    },
  },
  items: {
    ...fixtureWorld.items,
    window: {
      name: 'kitchen window',
      description: 'A window.',
      portable: false,
      tags: [],
      door: true,
      container: { openable: true, opened: 'With great effort, you open the window.', closed: 'The window closes.' },
    },
    table: { name: 'kitchen table', description: 'A table.', portable: false, tags: [], scenery: true, surface: true, contains: ['sack', 'cup'] },
    sack: {
      name: 'brown sack',
      description: 'A sack.',
      portable: true,
      tags: [],
      initialDescription: 'On the table is a brown sack.',
      container: { openable: true },
      contains: ['lunch', 'garlic'],
    },
    cup: { name: 'cup', description: 'A cup.', portable: true, tags: [] },
    lunch: { name: 'lunch', description: 'Lunch.', portable: true, tags: [] },
    garlic: { name: 'clove of garlic', description: 'Garlic.', portable: true, tags: [] },
    torch: { name: 'torch', description: 'A torch.', portable: true, tags: [], switchable: true, light: true },
  },
};

const run = (s: GameState, action: string, target?: string) => execute(target ? { action, target } : { action }, { world, state: s });

describe('Infocom style', () => {
  it('a scenery surface shows what’s on it as if on the floor; untouched things with a first-seen sentence use it', () => {
    const lines = describeCurrentRoom(world, stateWith(world, { room: 'kitchen' }));
    expect(lines).toContain('On the table is a brown sack.');
    // Release 119 describes what's on the kitchen table as if it were on the floor (5d).
    expect(lines).toContain('There is a cup here.');
    expect(lines.join('\n')).not.toContain('Sitting on the kitchen table is:');
    expect(lines.join('\n')).not.toContain('There is a kitchen table here.');
  });

  it('lists with Zork’s serial comma and plain “a”', () => {
    const s = stateWith(world, { room: 'kitchen', carrying: ['sack'] });
    expect(run(s, 'open', 'sack').lines).toEqual(['Opening the brown sack reveals a clove of garlic, and a lunch.']);
  });

  it('doors use their own open and close lines, and a closed door is always “closed”', () => {
    const s = stateWith(world, { room: 'kitchen' });
    expect(run(s, 'go', 'east').lines).toEqual(['The kitchen window is closed.']);
    expect(run(s, 'open', 'window').lines).toEqual(['With great effort, you open the window.']);
    expect(run(s, 'close', 'window').lines).toEqual(['The window closes.']);
  });

  it('scores the way Zork does', () => {
    const s = stateWith(world, { room: 'kitchen' });
    run(s, 'look');
    expect(run(s, 'score').lines).toEqual([
      'Your score is 0 (total of 350 points), in 1 move.',
      'This gives you the rank of Beginner.',
    ]);
    s.flags.paid = true;
    // SCORE takes no time: Zork's main loop doesn't run the clock for it.
    expect(run(s, 'score').lines[0]).toBe('Your score is 30 (total of 350 points), in 1 move.');
    expect(s.turns).toBe(1);
  });

  it('SCORE runs no daemons or fuses (Zork’s CLOCKER skips it)', () => {
    const ticking: World = { ...world, daemons: [{ if: 'in:kitchen', then: ['Tick.'] }] };
    const s = stateWith(ticking, { room: 'kitchen' });
    const r = execute({ action: 'score' }, { world: ticking, state: s });
    expect(r.lines).not.toContain('Tick.');
    expect(r.free).toBe(true);
    expect(execute({ action: 'look' }, { world: ticking, state: s }).lines).toContain('Tick.');
  });

  it('a lit light source says so in the inventory', () => {
    const s = stateWith(world, { room: 'kitchen', carrying: ['torch'] });
    run(s, 'turn_on', 'torch');
    expect(run(s, 'inventory').lines).toEqual(['You are carrying:', '  A torch (providing light)']);
  });

  it('a bad direction is just “You can’t go that way.”', () => {
    const s = stateWith(world, { room: 'kitchen' });
    expect(run(s, 'go', 'north').lines).toEqual(['You can’t go that way.']);
  });

  it('arrival events come before the room description, as Zork’s M-ENTER does', () => {
    const s = stateWith(world, { room: 'bedroom' });
    const lines = execute({ action: 'go', target: 'west' }, { world, state: s }).lines;
    expect(lines.indexOf('You smell coffee.')).toBeLessThan(lines.indexOf('📍 Living Room'));
  });

  it('an arrival that moves you on (or kills you) doesn’t describe the room you left', () => {
    const w: World = {
      ...world,
      rooms: { ...world.rooms, living: { ...world.rooms.living, onEnter: [{ if: 'in:living', then: 'whisked' }] } },
      events: { ...world.events, whisked: ['A gust carries you back.', { go: 'bedroom' }] },
    };
    const s = stateWith(w, { room: 'bedroom' });
    const lines = execute({ action: 'go', target: 'west' }, { world: w, state: s }).lines;
    expect(lines).toContain('A gust carries you back.');
    expect(lines).not.toContain('📍 Living Room');
    expect(s.currentRoom).toBe('bedroom');
  });
});
