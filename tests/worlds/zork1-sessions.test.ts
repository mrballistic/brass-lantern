// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { compare, nativeRun, originalRun, prefixed } from './zsession';
import { BANK_SESSIONS, BOAT_SESSIONS, DAM_SESSIONS, DOME_SESSIONS, GRUE_SESSIONS, MINE_SESSIONS, LOUD_SESSIONS, RAINBOW_SESSIONS, RIVER_SESSIONS, TEMPLE_SESSIONS } from './zork1-sessions';

// Scripted sessions: each puzzle chain runs in native Zork I and in the real story
// file, both seeded, and the replies are compared line by line.

beforeEach(() => localStorage.clear());

describe('the seeded original', () => {
  it('replays exactly from the same seed, and differs across seeds', async () => {
    const commands = ['north', 'east', 'open window', 'west', 'west', 'take sword', 'take lamp', 'move rug', 'open trap door', 'turn on lamp', 'down', 'north', 'kill troll with sword', 'kill troll with sword', 'kill troll with sword'];
    const a = await originalRun(commands, 7);
    const b = await originalRun(commands, 7);
    expect(b).toEqual(a);
    const others = await Promise.all([8, 9, 10, 11].map((s) => originalRun(commands, s)));
    expect(others.some((o) => JSON.stringify(o) !== JSON.stringify(a))).toBe(true);
  });

  it('runs the prefix to the Round Room on both sides', async () => {
    expect((await prefixed('original', ['look'], 3))?.[0].join(' ')).toMatch(/Round Room/);
    expect((await prefixed('native', ['look'], 3))?.[0].join(' ')).toMatch(/Round Room/);
  });

  it('compare reports nothing for equal replies', () => {
    const r = nativeRun(['look'], 1);
    expect(compare(r, r, ['look'])).toEqual([]);
  });
});

/** Runs a session on both sides from their pinned seeds and requires every reply to match. */
async function session(name: string, commands: string[], seeds: { native: number; original: number }) {
  const original = await prefixed('original', commands, seeds.original);
  const native = await prefixed('native', commands, seeds.native);
  if (!original || !native) throw new Error(`${name}: a pinned seed no longer gets through (re-run findSeed): original ${Boolean(original)}, native ${Boolean(native)}`);
  expect(compare(native, original, commands)).toEqual([]);
}

// Seeds found with findSeed, one per side (tests/zz/seeds.test.ts while developing). A content change
// that moves the thief can need new ones; the failure says so.
const SEEDS: Record<string, { native: number; original: number }> = {
  grue: { native: 1, original: 1 },
  slide: { native: 1, original: 1 },
  'upper-rooms': { native: 1, original: 1 },
  garlic: { native: 1, original: 1 },
  rainbow: { native: 19, original: 1 },
  'jump-falls': { native: 7, original: 1 },
  'rainbow-death': { native: 7, original: 1 },
  cliffs: { native: 9, original: 1 },
  dig: { native: 9, original: 1 },
  collapse: { native: 10, original: 1 },
  buoy: { native: 9, original: 1 },
  shore: { native: 9, original: 1 },
  downriver: { native: 9, original: 1 },
  landings: { native: 9, original: 1 },
  stream: { native: 4, original: 1 },
  'wrong-launch': { native: 4, original: 1 },
  inflate: { native: 7, original: 1 },
  board: { native: 4, original: 1 },
  puncture: { native: 37, original: 1 },
  exorcism: { native: 6, original: 1 },
  'read-first': { native: 1, original: 1 },
  tension: { native: 1, original: 1 },
  'hot-bell': { native: 1, original: 1 },
  candles: { native: 2, original: 1 },
  coffin: { native: 1, original: 1 },
  ghost: { native: 2, original: 1 },
  dam: { native: 9, original: 1 },
  leak: { native: 4, original: 1 },
  flood: { native: 2, original: 1 },
  refill: { native: 4, original: 1 },
  water: { native: 1, original: 1 },
  echo: { native: 1, original: 1 },
  thrown: { native: 1, original: 1 },
  quiet: { native: 59, original: 1 },
  mirror: { native: 1, original: 1 },
  'mirror-break': { native: 1, original: 1 },
  dome: { native: 1, original: 1 },
  untie: { native: 1, original: 1 },
  leap: { native: 1, original: 1 },
  atlantis: { native: 4, original: 1 },
  passages: { native: 1, original: 1 },
};

const GROUPS: Array<[string, Record<string, string[]>]> = [
  ['the dam and the reservoir', DAM_SESSIONS],
  ['the Loud Room', LOUD_SESSIONS],
  ['the mirrors, the caves, Atlantis and the dome', DOME_SESSIONS],
  ['the temple and Hades', TEMPLE_SESSIONS],
  ['the boat', BOAT_SESSIONS],
  ['the river and the stream', RIVER_SESSIONS],
  ['the river banks', BANK_SESSIONS],
  ['the rainbow and the canyon', RAINBOW_SESSIONS],
  ['a grue in the dark', GRUE_SESSIONS],
  ['the upper coal mine', MINE_SESSIONS],
];

for (const [title, sessions] of GROUPS) {
  describe(`5a sessions: ${title}`, () => {
    for (const [name, commands] of Object.entries(sessions)) it(name, () => session(name, commands, SEEDS[name]), 120_000);
  });
}
