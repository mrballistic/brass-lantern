import type { World } from '../../types/world';

/**
 * The smallest complete game: two rooms, a locked door, a hidden key and a
 * way to win. Built step by step in docs/guide/building-worlds/two-rooms.md;
 * tests/worlds/examples.test.ts plays it.
 */
export const twoRooms: World = {
  // #region rooms
  startRoom: 'porch',
  rooms: {
    porch: {
      name: 'Front Porch',
      description: 'A creaky porch in front of an old house. A doormat lies at your feet.',
      exits: {
        north: { to: 'hall', door: 'front_door' },
        in: { to: 'hall', door: 'front_door' },
      },
      listExits: ['north'],
      items: ['doormat'],
      npcs: [],
      onEnter: [],
      scenery: ['front_door'],
    },
    hall: {
      name: 'Hall',
      description: 'A dusty hall that smells of old books. The front door is south.',
      exits: {
        south: { to: 'porch', door: 'front_door' },
        out: { to: 'porch', door: 'front_door' },
      },
      listExits: ['south'],
      items: ['side_table'],
      npcs: [],
      onEnter: [],
      scenery: ['front_door'],
    },
  },
  // #endregion rooms

  // #region items
  items: {
    doormat: {
      name: 'doormat',
      aliases: ['mat'],
      description: 'WELCOME, it says, unconvincingly.',
      portable: false,
      refusal: 'It’s nailed down. Somebody really wanted you welcome.',
      tags: [],
      scenery: true,
      instead: { examine: [{ if: '!flag:found_key', then: 'find_key' }] },
    },
    key: { name: 'brass key', aliases: ['key'], description: 'Small, brass, a little green.', portable: true, tags: [] },
    front_door: {
      name: 'front door',
      aliases: ['door'],
      description: 'Solid oak, painted red a long time ago.',
      portable: false,
      tags: [],
      door: true,
      container: { openable: true, locked: true, key: 'key' },
    },
    side_table: {
      name: 'side table',
      aliases: ['table'],
      description: 'A spindly side table.',
      portable: false,
      tags: [],
      scenery: true,
      surface: true,
      contains: ['letter'],
    },
    letter: {
      name: 'letter',
      aliases: ['envelope', 'note'],
      description: 'An envelope with your name on it, in your own handwriting.',
      portable: true,
      tags: [],
      instead: { read: [{ then: 'read_letter' }] },
    },
  },
  // #endregion items

  // #region events
  npcs: {},
  dialogue: {},
  flagLabels: {},
  events: {
    intro: ['You’re back at the old house at last. You’re sure you left the key somewhere obvious.'],
    find_key: ['You lift a corner of the mat. Underneath: a brass key.', { set: 'found_key' }, { move: 'key', to: 'porch' }],
    read_letter: ['“Dear me,” it begins. “If you’re reading this, you remembered the mat. Welcome home.”', { end: 'home' }],
  },
  endings: {
    home: { lines: ['✨ You’re home.'], footer: ['Type RESTART to play again.'] },
  },
  // #endregion events
};
