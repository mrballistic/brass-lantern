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
  it('a scenery surface shows what’s on it; untouched things with a first-seen sentence use it', () => {
    const lines = describeCurrentRoom(world, stateWith(world, { room: 'kitchen' }));
    expect(lines).toContain('On the table is a brown sack.');
    expect(lines).toContain('Sitting on the kitchen table is:');
    expect(lines).toContain('  A cup');
    expect(lines.join('\n')).not.toContain('There is a kitchen table here.');
  });

  it('lists with Zork’s serial comma and plain “a”', () => {
    const s = stateWith(world, { room: 'kitchen', carrying: ['sack'] });
    expect(run(s, 'open', 'sack').lines).toEqual(['Opening the brown sack reveals a lunch, and a clove of garlic.']);
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
    expect(run(s, 'score').lines[0]).toBe('Your score is 30 (total of 350 points), in 2 moves.');
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
});
