import type { World } from '@brass-lantern/engine';

// Throws after loading, outside any call the server awaits.
setTimeout(() => {
  throw new Error('later');
}, 0);
void Promise.reject(new Error('rejected'));

const world: World = { startRoom: 'hall', rooms: { hall: { name: 'Hall', description: 'A hall.', exits: {}, items: [], npcs: [], onEnter: [] } }, items: {}, npcs: {}, events: {}, dialogue: {}, flagLabels: {} };
export default world;
