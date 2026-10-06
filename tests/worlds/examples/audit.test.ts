import { describe, expect, it } from 'vitest';
import type { World } from '@/types/world';
import { containers } from '@/worlds/examples/containers';
import { darkness } from '@/worlds/examples/darkness';
import { endings } from '@/worlds/examples/endings';
import { fortune } from '@/worlds/examples/fortune';
import { guard } from '@/worlds/examples/guard';
import { timers } from '@/worlds/examples/timers';
import { twoRooms } from '@/worlds/examples/two-rooms';
import { auditWorld } from '../../helpers/audit';

const examples: Array<[string, World]> = [
  ['the two-room game', twoRooms],
  ['the containers recipe', containers],
  ['the darkness recipe', darkness],
  ['the timers recipe', timers],
  ['the endings recipe', endings],
  ['the guard recipe', guard],
  ['the scripts recipe', fortune],
];

describe('the example worlds', () => {
  it.each(examples)('%s has no broken references', (_name, world) => {
    expect(auditWorld(world)).toEqual([]);
  });
});
