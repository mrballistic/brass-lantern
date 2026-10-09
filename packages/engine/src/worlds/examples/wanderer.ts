import type { EventStep, World } from '@brass-lantern/engine';

/** Recipe: a character who wanders and steals. See docs/guide/building-worlds/recipes.md. */
export const wanderer: World = {
  startRoom: 'hall',
  seed: 4,
  rooms: {
    hall: { name: 'Hall', description: 'A narrow hall. The kitchen is east, the garden south.', exits: { east: 'kitchen', south: 'garden' }, items: ['sock'], npcs: [], onEnter: [] },
    kitchen: { name: 'Kitchen', description: 'A warm kitchen. The hall is west.', exits: { west: 'hall' }, items: [], npcs: ['cat'], onEnter: [] },
    garden: { name: 'Garden', description: 'A small garden. The hall is north.', exits: { north: 'hall' }, items: [], npcs: [], onEnter: [] },
  },
  items: {
    sock: { name: 'sock', description: 'A single woolly sock.', portable: true, tags: [] },
  },
  npcs: {
    cat: { name: 'cat', description: 'A grey cat with opinions.', holds: [] },
  },
  // #region cat
  // The cat's turn: a daemon that runs a script after every turn the engine acts on.
  daemons: [{ if: 'alive:cat', then: [{ script: 'cat_turn' }] }],
  scripts: {
    cat_turn: (ctx) => {
      const rooms = ['hall', 'kitchen', 'garden'];
      const at = rooms.find((r) => ctx.npcIn('cat', r))!;
      // Half the time it stays put.
      if (ctx.roll(2) === 1) return [];
      const next = rooms[(rooms.indexOf(at) + 1) % rooms.length];
      const here = ctx.room();
      const steps: EventStep[] = [{ moveNpc: 'cat', to: next }];
      if (at === here) steps.push('The cat stalks off.');
      if (next === here) steps.push('The cat pads in.');
      // A sock on the floor where it arrives goes with it.
      if (ctx.children(next).includes('sock')) {
        steps.push({ move: 'sock', to: 'cat' });
        if (next === here) steps.push('The cat bats the sock away somewhere. It’s gone.');
      }
      return steps;
    },
  },
  // #endregion cat
  events: {},
  dialogue: {},
  flagLabels: {},
};
