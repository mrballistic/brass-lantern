// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildCarousel, buildLowRoom, buildStoppedCarousel, robotWorld } from './zork2-slices/robot';
import { buildRiddle, buildTinyRoom, riddleWorld } from './zork2-slices/riddle';
import { balloonWorld, buildVolcanoBottom } from './zork2-slices/balloon';
import { sliceRun } from './slices';
import { normalize } from './zsession';

// Zork II slices (6a, Task 11): small native worlds played against the story file from a point
// mid-game, reply by reply.

const SEED = 1;

/** From the start to the Carousel Room: the lamp, the teapot filled at the ford. */
const TO_CAROUSEL = ['get lamp', 's', 's', 's', 'sw', 'light lamp', 's', 'se', 'in', 'get teapot', 'out', 'n', 'ne', 'fill teapot with water', 's', 'sw', 'sw'];
/** The same, picking up the Gazebo's place mat and letter opener, to the Riddle Room. */
const TO_RIDDLE = ['get lamp', 's', 's', 's', 'sw', 'light lamp', 's', 'se', 'in', 'get teapot', 'get mat', 'get opener', 'out', 'n', 'ne', 'fill teapot with water', 's', 'sw', 'sw', 'se'];
/** On, the riddle answered, round the spinning carousel (the seed's passages) to the Marble Hall, and up the ravine to the Tiny Room. */
const TO_TINY_ROOM = [...TO_RIDDLE, 'answer "a well"', 'd', 'n', 'd', 'n', 'n', 'n', 'n', 'n', 'ne', 'n', 'n', 'n', 'u'];
/** On to the Low Room and the robot: the riddle, the bucket up the well (the teapot's water lifts it), the Tea Room. */
const TO_ROBOT = [...TO_CAROUSEL, 'se', 'answer "a well"', 'e', 'e', 'get in bucket', 'pour water', 'get out of bucket', 'e', 'nw'];
/**
 * To the Volcano Bottom: the sword, the Gazebo's matchbook and newspaper, the spinning carousel
 * (the seed's passage) to the Cool Room, and the dragon, angered three times, following you into
 * the Ice Room, where it melts the glacier and the way west opens.
 */
const TO_VOLCANO = [
  'get lamp', 'get sword', 's', 's', 's', 'sw', 'light lamp', 's', 'se', 'in', 'get matchbook', 'get newspaper', 'out', 's', 's', 'w', 'nw',
  'n', 'n', 'hit dragon with sword', 's', 'hit dragon with sword', 's', 'hit dragon with sword', 'w', 'w', 's',
];

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

  it('the riddle: wrong answers, the right one, and the stone door', async () => {
    const commands = [
      'examine door',
      'open door',
      'e',
      'close door',
      'answer',
      'answer "a hole"',
      'say "the deep well"',
      'examine riddle',
      'answer "a well" then look',
      'look',
      'answer "a well"',
      'answer "a hole"',
      'open door',
      'close door',
      'examine door',
      'e',
      'w',
    ];
    const { native, original } = await sliceRun({ name: 'riddle', story: 'zork2', prefix: TO_RIDDLE, seed: SEED, world: riddleWorld, build: buildRiddle, commands, expect: 'Riddle Room' });
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);

  it('the oak door: the mat slid under it, the key pushed out onto it, the mat pulled back', async () => {
    const commands = [
      'look',
      'examine door',
      'look under door',
      'look in keyhole',
      'put opener in keyhole',
      'open lid',
      'look',
      'n',
      'put mat under door',
      'look',
      'look under door',
      'put opener in keyhole',
      'look',
      'close lid',
      'pull mat',
      'look',
      'take key',
      'unlock door with key',
      'take opener',
      'unlock door with key',
      'open door',
      'n',
      'take sphere',
      's',
      'take mat',
      'close door',
      'n',
    ];
    const { native, original } = await sliceRun({ name: 'oak door', story: 'zork2', prefix: TO_TINY_ROOM, seed: SEED, world: riddleWorld, build: buildTinyRoom, commands, expect: 'Tiny Room' });
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);

  it('the balloon: boarding, burning the newspaper, rising and falling on its clock, landing, tying up, and away', async () => {
    const commands = [
      'look',
      'examine basket',
      'examine receptacle',
      'get in basket',
      'look',
      'up',
      'n',
      'open receptacle',
      'put newspaper in receptacle',
      'look',
      'take wire',
      'examine bag',
      'open bag',
      'light match',
      'burn newspaper with match',
      'look',
      'take newspaper',
      'read label',
      'get out of basket',
      'wait',
      'west',
      'tie wire to hook',
      'look',
      'down',
      'get out of basket',
      'look',
      'get in basket',
      'untie wire',
      'look',
      'look',
      'close receptacle',
      'look',
      'wait',
      'open receptacle',
      'wait',
      'wait',
      'land',
      'wait',
      'land',
      'tie wire to hook',
      'get out of basket',
      'look',
      'untie wire',
      'look',
      'look',
      'wait',
      'look',
    ];
    const { native, original } = await sliceRun({ name: 'balloon', story: 'zork2', prefix: TO_VOLCANO, seed: SEED, world: balloonWorld, build: buildVolcanoBottom, commands, expect: 'Volcano Bottom' });
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);

  it('the balloon burned out: tied to the Narrow Ledge, the newspaper burns away, and untied it falls and breaks', async () => {
    // A seed whose Wizard stays away through the long wait (the carousel still sends you to the Cool Room).
    const commands = [
      'get in basket',
      'open receptacle',
      'put newspaper in receptacle',
      'light match',
      'burn newspaper with match',
      'wait',
      'wait',
      'west',
      'tie wire to hook',
      ...Array<string>(34).fill('wait'),
      'look',
      'untie wire',
      'look',
      'wait',
      'wait',
      'wait',
      'look',
      'examine balloon',
      'get in balloon',
    ];
    const { native, original } = await sliceRun({ name: 'balloon burned out', story: 'zork2', prefix: TO_VOLCANO, seed: 27, world: balloonWorld, build: buildVolcanoBottom, commands, expect: 'Volcano Bottom' });
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);
});
