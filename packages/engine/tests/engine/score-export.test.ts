import { describe, expect, it } from 'vitest';
import { createGame, currentScore } from '../../src/index';
import { tutorial } from '../../src/worlds/tutorial';

describe('currentScore (package entry)', () => {
  it('is 0 for a fresh game and 50 after the tutorial’s winning run', () => {
    const game = createGame(tutorial, { seed: 1 });
    expect(currentScore(tutorial, game.state)).toBe(0);
    for (const c of ['open drawer', 'take stapler', 'north', 'take mug and give mug to gary', 'talk to gary', 'north', 'smash machine with stapler']) game.send(c);
    expect(currentScore(tutorial, game.state)).toBe(50);
  });
});
