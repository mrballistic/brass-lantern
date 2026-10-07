import type { World } from '../../types/world';

/** Recipe: containers, surfaces and keys. See docs/guide/building-worlds/recipes.md. */
export const containers: World = {
  startRoom: 'pantry',
  rooms: {
    pantry: {
      name: 'Pantry',
      description: 'Narrow shelves, a smell of cinnamon.',
      exits: {},
      items: ['shelf', 'tin'],
      npcs: [],
      onEnter: [],
    },
  },
  // #region items
  items: {
    // A surface: what's on it is always in view and in reach.
    shelf: { name: 'shelf', description: 'A sagging pine shelf.', portable: false, tags: [], scenery: true, surface: true, contains: ['jar'] },
    // Transparent: you can see the key through the glass, but not take it until it's open.
    jar: {
      name: 'glass jar',
      aliases: ['jar'],
      description: 'A jar with a screw-top lid.',
      portable: true,
      tags: [],
      container: { openable: true, transparent: true },
      contains: ['key'],
    },
    key: { name: 'tin key', aliases: ['key'], description: 'A tiny key.', portable: true, tags: [] },
    // Locked, opened by the key, with room for two things.
    tin: {
      name: 'cookie tin',
      aliases: ['tin'],
      description: 'A dented tin with a keyhole.',
      portable: false,
      refusal: 'It’s wedged in tight.',
      tags: [],
      container: { openable: true, locked: true, key: 'key', capacity: 2, opened: 'The lid pops off with a sigh of cinnamon.' },
      contains: ['cookie'],
    },
    cookie: { name: 'cookie', description: 'Snickerdoodle.', portable: true, tags: [] },
  },
  // #endregion items
  npcs: {},
  dialogue: {},
  events: {},
  flagLabels: {},
};
