import type { World } from '@brass-lantern/engine';

const world: World = {
  startRoom: 'hall',
  rooms: { hall: { name: 'Hall', description: 'A hall.', exits: {}, items: ['key', 'rusty_key'], npcs: [], onEnter: [] } },
  items: {
    key: { name: 'brass key', aliases: ['key'], description: 'A brass key.', portable: true, tags: [] },
    rusty_key: { name: 'rusty key', aliases: ['key'], description: 'A rusty key.', portable: true, tags: [] },
  },
  npcs: {},
  events: {},
  dialogue: {},
  flagLabels: {},
};
export default world;
