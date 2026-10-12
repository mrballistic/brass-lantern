import { Console } from 'node:console';
import type { World } from '@brass-lantern/engine';

// Writes to stdout every way a world might: none of it may reach the protocol.
process.stdout.write('NOISE raw\n');
console.log('NOISE console');
new Console(process.stdout).log('NOISE own console');

const world: World = { startRoom: 'hall', rooms: { hall: { name: 'Hall', description: 'A hall.', exits: {}, items: [], npcs: [], onEnter: [] } }, items: {}, npcs: {}, events: {}, dialogue: {}, flagLabels: {} };
export default world;
