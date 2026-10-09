import type { World } from '@brass-lantern/engine';

/** Recipe: a raft on a pond. See docs/guide/building-worlds/recipes.md. */
export const raft: World = {
  startRoom: 'bank',
  style: 'infocom',
  rooms: {
    bank: {
      name: 'Pond Bank',
      description: 'A muddy bank. A pond stretches east.',
      exits: { east: 'pond' },
      items: ['raft'],
      npcs: [],
      onEnter: [],
    },
    // #region pond
    pond: {
      name: 'Pond',
      description: 'The middle of the pond. Lily pads drift by. An island lies to the east, the bank to the west.',
      // Only something that floats goes here.
      water: true,
      exits: { west: 'bank', east: 'island' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    // #endregion pond
    island: {
      name: 'Island',
      description: 'A tiny island with one tree. The pond is west.',
      exits: { west: 'pond' },
      items: ['pinecone'],
      npcs: [],
      onEnter: [],
    },
  },
  items: {
    // #region raft
    raft: {
      name: 'raft',
      description: 'A raft of lashed logs.',
      portable: false,
      tags: [],
      vehicle: { travels: 'water' },
      container: { open: true },
    },
    // #endregion raft
    pinecone: { name: 'pine cone', aliases: ['cone', 'pinecone'], description: 'A fine pine cone.', portable: true, tags: [] },
  },
  npcs: {},
  events: {},
  dialogue: {},
  flagLabels: {},
};
