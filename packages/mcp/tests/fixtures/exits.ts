import type { World } from '@brass-lantern/engine';

// Ends the process at load: in a worker this ends only the worker.
process.exit(3);

const world: World = { startRoom: 'hall', rooms: { hall: { name: 'Hall', description: 'A hall.', exits: {}, items: [], npcs: [], onEnter: [] } }, items: {}, npcs: {}, events: {}, dialogue: {}, flagLabels: {} };
export default world;
