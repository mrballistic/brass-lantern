import type { World } from '@brass-lantern/engine';

const world: World = { startRoom: 'hall', rooms: { hall: { name: 'Hall', description: 'A hall.', exits: { north: 'nowhere' }, items: [], npcs: [], onEnter: [] } }, items: {}, npcs: {}, events: {}, dialogue: {}, flagLabels: {} };
export default world;
