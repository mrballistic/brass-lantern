import { parentPort } from 'node:worker_threads';
import type { World } from '@brass-lantern/engine';

// Posts to the server before the real answer: the runner must not take it for a result.
parentPort?.postMessage(42);

const world: World = { startRoom: 'hall', rooms: { hall: { name: 'Hall', description: 'A hall.', exits: {}, items: [], npcs: [], onEnter: [] } }, items: {}, npcs: {}, events: {}, dialogue: {}, flagLabels: {} };
export default world;
