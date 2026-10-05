import { describe, expect, it } from 'vitest';
import { nextRandom } from '@/engine/rng';
import type { GameState } from '@/types/game';

const s = (rng: number) => ({ rng }) as unknown as GameState;

describe('rng', () => {
  it('the same seed gives the same sequence, and advances the state', () => {
    const a = s(42);
    const b = s(42);
    const seqA = [nextRandom(a), nextRandom(a), nextRandom(a)];
    expect([nextRandom(b), nextRandom(b), nextRandom(b)]).toEqual(seqA);
    expect(a.rng).not.toBe(42);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});
