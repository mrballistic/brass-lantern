// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { chapterProblems, chapterRun, requireRuns } from './zsession';
import { CHAPTERS } from './zork1-full';

// The whole of Zork I against the original, chapter by chapter (stage 5d). For chapter k both
// sides replay chapters 1..k and compare chapter k's replies; fights are sync points and aren't
// compared. Each chapter has a seed pair on which the two sides agree; `'lines'` would mean the
// chapter is compared as line sets (none needs it).

const CHAPTER_SEEDS: Record<string, { native: number; original: number } | 'lines'> = {
  house: { native: 1, original: 3 },
  temple: { native: 1, original: 1 },
  maze: { native: 1, original: 1 },
  dam: { native: 3, original: 5 },
  atlantis: { native: 3, original: 1 },
  river: { native: 1, original: 1 },
  thief: { native: 13, original: 1 },
  mine: { native: 7, original: 1 },
  end: { native: 7, original: 1 },
};

describe('the chapter harness (5d)', () => {
  it('reports a missing run by the chapter’s name, never passing quietly', () => {
    expect(() => requireRuns('dam', null, [['x']])).toThrow(/dam/);
    expect(() => requireRuns('dam', [['x']], null)).toThrow(/dam/);
  });
  it('exact chapters compare reply by reply; line-set chapters need every native line in the original', () => {
    expect(chapterProblems(['look', '@fight troll with sword'], [['A'], ['blow']], [['A'], ['other blow']], 'exact')).toEqual([]);
    expect(chapterProblems(['look'], [['A']], [['B']], 'exact')).not.toEqual([]);
    expect(chapterProblems(['look', 'wait'], [['B'], ['A']], [['A'], ['B']], 'lines')).toEqual([]);
    expect(chapterProblems(['look'], [['C']], [['A']], 'lines')).toEqual(['native line not in the original: c']);
  });
});

describe('the whole of Zork I against the original, by chapter (5d)', () => {
  CHAPTERS.forEach((chapter, k) => {
    const seeds = CHAPTER_SEEDS[chapter.name];
    const lines = seeds === 'lines';
    it(`${chapter.name}${lines ? ' (line sets)' : ''}`, async () => {
      const pair = lines ? { native: 1, original: 1 } : seeds;
      const original = await chapterRun('original', CHAPTERS, k, pair.original);
      const native = await chapterRun('native', CHAPTERS, k, pair.native);
      const [n, o] = requireRuns(chapter.name, native, original);
      expect(chapterProblems(chapter.commands, n, o, lines ? 'lines' : 'exact')).toEqual([]);
    }, 120_000);
  });
});
