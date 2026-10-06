// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { openNative, openOriginal, playPrefix, THIEF } from './zsession';

// Stage 4b promised the thief's timing would converge on the original's once every room
// existed (he walks the rooms in story order). With the whole map built, this measures it:
// many seeds on each side wait in the Round Room after PREFIX until he first shows.

const SEEDS = 40;
const LIMIT = 200;

/** Turns of WAIT in the Round Room until his first line, or null if he doesn't show within LIMIT. */
async function firstThief(side: 'native' | 'original', seed: number): Promise<number | null> {
  if (side === 'original') localStorage.clear();
  const game = side === 'original' ? await openOriginal(seed) : openNative(seed);
  const seen = await playPrefix(game.send);
  // He turned up during the opening, or the troll won: not a clean measurement.
  if (!seen || seen.some((r) => THIEF.test(r.join(' ')))) return null;
  for (let t = 1; t <= LIMIT; t++) if (THIEF.test((await game.send('wait')).join(' '))) return t;
  return null;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('the thief turns up as often as in the original (5d)', () => {
  it('first-arrival medians agree within 25%', async () => {
    const runs = async (side: 'native' | 'original') => {
      const out: number[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        const t = await firstThief(side, seed);
        if (t !== null) out.push(t);
      }
      return out;
    };
    const native = await runs('native');
    const original = await runs('original');
    console.log(`thief first arrival: native median ${median(native)} of ${native.length}, original median ${median(original)} of ${original.length}`);
    expect(native.length).toBeGreaterThan(SEEDS / 2);
    expect(original.length).toBeGreaterThan(SEEDS / 2);
    expect(Math.abs(median(native) - median(original)) / median(original)).toBeLessThanOrEqual(0.25);
  }, 1_800_000);
});
