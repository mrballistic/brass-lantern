// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { compare, nativeRun, originalRun, prefixed } from '../helpers/zsession';

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
