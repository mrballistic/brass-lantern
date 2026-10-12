import type { World } from '@brass-lantern/engine';

const world = {
  startRoom: 'hall',
  rooms: { hall: { name: 'Hall', description: 'A hall.', descriptionScript: 'boom', exits: {}, items: [], npcs: [], onEnter: [] } },
  items: {},
  npcs: {},
  events: {},
  dialogue: {},
  flagLabels: {},
  scripts: {
    boom: () => {
      throw new Error('kaboom');
    },
  },
} as unknown as World;
export default world;
