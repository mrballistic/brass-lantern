import type { World } from '@brass-lantern/engine';

// The room's description script never returns: the MCP server must time out, not freeze.
const world = {
  startRoom: 'hall',
  rooms: { hall: { name: 'Hall', description: 'A hall.', descriptionScript: 'spin', exits: {}, items: [], npcs: [], onEnter: [] } },
  items: {},
  npcs: {},
  events: {},
  dialogue: {},
  flagLabels: {},
  scripts: {
    spin: () => {
      for (;;) {
        // forever
      }
    },
  },
} as unknown as World;
export default world;
