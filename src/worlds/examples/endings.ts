import type { World } from '@/types/world';

/** Recipe: verbs of your own, and more than one way to end. See docs/guide/building-worlds/recipes.md. */
export const endings: World = {
  startRoom: 'garden',
  rooms: {
    garden: {
      name: 'Garden',
      description: 'An overgrown garden. A chapel stands to the east. Something glints in a flowerbed.',
      exits: { east: 'chapel' },
      items: ['spade', 'flowerbed'],
      npcs: [],
      onEnter: [],
      // DIG with no target asks the room.
      instead: { dig: [{ if: 'has:spade', then: 'treasure' }, { say: ['The soil is packed hard. You need a spade.'] }] },
    },
    chapel: {
      name: 'Chapel',
      description: 'Cool and quiet. The garden is west.',
      exits: { west: 'garden' },
      items: [],
      npcs: [],
      onEnter: [],
      instead: { pray: [{ then: 'blessing' }] },
    },
  },
  // #region verbs
  verbs: {
    dig: { words: ['dig', 'dig in'], target: 'optional', indirect: ['with'], reply: 'There’s nowhere to dig here.' },
    pray: { words: ['pray'], target: 'none', reply: 'Your prayer goes unanswered here.' },
  },
  // #endregion verbs
  items: {
    spade: { name: 'spade', description: 'A rusty spade.', portable: true, tags: [] },
    flowerbed: {
      name: 'flowerbed',
      aliases: ['bed', 'flowers', 'soil'],
      description: 'Something glints in the soil.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { dig: [{ if: 'has:spade', then: 'treasure' }] },
    },
  },
  // #region endings
  events: {
    treasure: ['You dig. Your spade rings on a strongbox full of coins.', { score: 50 }, { end: 'rich' }],
    blessing: ['A warm calm settles over you.', { score: 10 }, { end: 'peace' }],
  },
  scoring: [],
  maxScore: 50,
  endings: {
    rich: { lines: ['✨ You are rich, and the garden is a mess.'], score: true, footer: ['Type RESTART to try another ending.'] },
    peace: { lines: ['✨ You leave lighter than you came.'], score: true, footer: ['Type RESTART to try another ending.'] },
  },
  // #endregion endings
  npcs: {},
  dialogue: {},
  flagLabels: {},
};
