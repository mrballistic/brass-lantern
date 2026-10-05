import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { runSteps } from '@/engine/effects';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('endings', () => {
  it('end plays the ending, the score and the footer, and ends the game', () => {
    const w: World = { ...world, endings: { escape: { lines: ['You escape.'], score: true, footer: ['The end.'] } } };
    const s = stateWith(w);
    const lines = runSteps([{ end: 'escape' }, 'not printed'], w, s);
    expect(lines[0]).toBe('You escape.');
    expect(lines.some((l) => l.startsWith('[Score:'))).toBe(true);
    expect(lines.at(-1)).toBe('The end.');
    expect(lines).not.toContain('not printed');
    expect(s.gameOver).toBe(true);
  });

  it('an ending without a score skips it', () => {
    const w: World = { ...world, endings: { quiet: { lines: ['Fade out.'] } } };
    expect(runSteps([{ end: 'quiet' }], w, stateWith(w))).toEqual(['Fade out.']);
  });

  it('the finale still plays exactly as before', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['bat'] });
    const r = execute({ action: 'smash', target: 'crate' }, { world, state: s });
    expect(r.lines).toEqual([
      '💥 The crate splinters.',
      '[Flag set: Crate broken]',
      '“The neighbor glares.”',
      '[Score: 20 of 40, in 0 moves.]',
      '[Rank: Novice]',
      'Type RESTART to play again.',
    ]);
    expect(s.gameOver).toBe(true);
  });
});
