import { describe, expect, it } from 'vitest';
import type { World } from '@/types/world';
import { containers } from '@/worlds/examples/containers';
import { darkness } from '@/worlds/examples/darkness';
import { echo } from '@/worlds/examples/echo';
import { raft } from '@/worlds/examples/raft';
import { endings } from '@/worlds/examples/endings';
import { fortune } from '@/worlds/examples/fortune';
import { guard } from '@/worlds/examples/guard';
import { timers } from '@/worlds/examples/timers';
import { topics } from '@/worlds/examples/topics';
import { twoRooms } from '@/worlds/examples/two-rooms';
import { wanderer } from '@/worlds/examples/wanderer';
import { auditWorld } from '../../helpers/audit';

const examples: Array<[string, World]> = [
  ['the two-room game', twoRooms],
  ['the containers recipe', containers],
  ['the darkness recipe', darkness],
  ['the timers recipe', timers],
  ['the endings recipe', endings],
  ['the guard recipe', guard],
  ['the scripts recipe', fortune],
  ['the topics recipe', topics],
  ['the wanderer recipe', wanderer],
  ['the echo recipe', echo],
  ['the raft recipe', raft],
];

describe('the example worlds', () => {
  it.each(examples)('%s has no broken references', (_name, world) => {
    expect(auditWorld(world)).toEqual([]);
  });
});
