import { describe, expect, it } from 'vitest';
import type { World } from '../../../src/types/world';
import { containers } from '../../../src/worlds/examples/containers';
import { darkness } from '../../../src/worlds/examples/darkness';
import { echo } from '../../../src/worlds/examples/echo';
import { raft } from '../../../src/worlds/examples/raft';
import { endings } from '../../../src/worlds/examples/endings';
import { fortune } from '../../../src/worlds/examples/fortune';
import { guard } from '../../../src/worlds/examples/guard';
import { timers } from '../../../src/worlds/examples/timers';
import { topics } from '../../../src/worlds/examples/topics';
import { workshop } from '../../../src/worlds/examples/workshop';
import { twoRooms } from '../../../src/worlds/examples/two-rooms';
import { wanderer } from '../../../src/worlds/examples/wanderer';
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
  ['the workshop recipe', workshop],
];

describe('the example worlds', () => {
  it.each(examples)('%s has no broken references', (_name, world) => {
    expect(auditWorld(world)).toEqual([]);
  });
});
