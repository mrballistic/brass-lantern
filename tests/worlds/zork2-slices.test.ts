// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildCarousel, buildLowRoom, buildStoppedCarousel, robotWorld } from './zork2-slices/robot';
import { sliceRun } from './slices';
import { normalize } from './zsession';

// Zork II slices (6a, Task 11): small native worlds played against the story file from a point
// mid-game, reply by reply.

const SEED = 1;

/** From the start to the Carousel Room: the lamp, the teapot filled at the ford. */
const TO_CAROUSEL = ['get lamp', 's', 's', 's', 'sw', 'light lamp', 's', 'se', 'in', 'get teapot', 'out', 'n', 'ne', 'fill teapot with water', 's', 'sw', 'sw'];
/** On to the Low Room and the robot: the riddle, the bucket up the well (the teapot's water lifts it), the Tea Room. */
const TO_ROBOT = [...TO_CAROUSEL, 'se', 'answer "a well"', 'e', 'e', 'get in bucket', 'pour water', 'get out of bucket', 'e', 'nw'];

/**
 * ROBOT-FCN acknowledges a walk, a take or a push with “Whirr, buzz, click!” or, one time in five,
 * “Buzz, click, whirr!”: the two sides' generators differ, so either counts as the other (but
 * there must be one on each side, in the same place).
 */
const same = (reply: string[]) => normalize(reply).replace(/"(?:whirr, buzz, click|buzz, click, whirr)!"/g, '"<ack>"');

function mismatches(commands: string[], native: string[][], original: string[][]): string[] {
  return commands.flatMap((c, i) => (same(native[i]) === same(original[i]) ? [] : [`> ${c}\n  native:   ${native[i].join(' / ')}\n  original: ${original[i].join(' / ')}`]));
}

describe('Zork II slices against the story file', () => {
  it('the robot: orders in the Low Room, the Machine Room and the Dingy Closet', async () => {
    const commands = [
      'robot, go west',
      'robot, go east',
      'look',
      'e',
      'robot, take paper',
      'robot, push button',
      'robot, push square button',
      'robot, push square button',
      'robot, push round button',
      'robot, push triangular button',
      'robot, go south',
      's',
      'robot, follow me',
      'robot, eat sphere',
      'robot, read sphere',
      'robot, open sphere',
      'take sphere',
      'look',
      'robot, lift cage',
      'look',
      'robot, take sphere',
      'robot, take sphere',
      'robot, give me the sphere',
      'robot, drop sphere',
      'give teapot to robot',
      'robot, drop teapot',
      'robot, drop teapot',
      'take sphere',
      'inventory',
      'robot, go west',
      'robot, go north',
      'look',
      'n',
      'w',
    ];
    const { native, original } = await sliceRun({ name: 'robot', story: 'zork2', prefix: TO_ROBOT, seed: SEED, world: robotWorld, build: buildLowRoom, commands, expect: 'Low Room' });
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);

  it('the carousel spinning: its whirring, and up and down are as ever', async () => {
    const commands = ['look', 'up', 'down'];
    const { native, original } = await sliceRun({ name: 'carousel', story: 'zork2', prefix: TO_CAROUSEL, seed: SEED, world: robotWorld, build: buildCarousel, commands, expect: 'disoriented' });
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);

  it('the carousel stopped by the robot: the box shows, and the passages go where they say', async () => {
    // The robot pushes the triangular button; the Low Room then spins (the seed sends the player
    // to the Tea Room), and the bucket goes back down when the teapot takes its water.
    const prefix = [...TO_ROBOT, 'robot, go east', 'e', 'robot, push triangular button', 'w', 'se', 'w', 'get in bucket', 'fill teapot', 'get out of bucket', 'w', 'w', 'nw'];
    const commands = ['look', 'se', 'nw', 'down', 'up', 'n', 's'];
    const { native, original } = await sliceRun({ name: 'stopped carousel', story: 'zork2', prefix, seed: SEED, world: robotWorld, build: buildStoppedCarousel, commands, expect: 'dented steel box' });
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);
});
