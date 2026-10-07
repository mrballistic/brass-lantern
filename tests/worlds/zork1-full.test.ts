// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { currentScore } from '@/engine/score';
import { zork1 } from '@/worlds/zork1';
import { normalize, openNative, playCommands } from './zsession';
import { CHAPTERS } from './zork1-full';

// The whole of Zork I, natively, from the first move to the barrow (stage 5d). Fights are sync
// points, and the thief's dice are ours, so a pinned seed is one where the run gets through.

const SEED = 7;
const ALL = CHAPTERS.flatMap((c) => c.commands);

describe('the whole of Zork I, natively (5d)', () => {
  it('wins: every treasure in the case, 350 points, the whisper, the map, the barrow', async () => {
    const game = openNative(SEED);
    const replies = await playCommands(game.send, ALL);
    expect(replies, `seed ${SEED} no longer gets through (re-pin it)`).not.toBeNull();
    const text = normalize((replies ?? []).flat());
    const treasures = Object.keys(zork1.items).filter((id) => (zork1.items[id].treasure ?? 0) > 0);
    // The torch is the one treasure in the case that's lit; the rest just sit there.
    for (const id of treasures) expect(game.state.locations[id], id).toBe('trophy_case');
    expect(currentScore(zork1, game.state)).toBe(350);
    expect(text).toContain(normalize(['An almost inaudible voice whispers in your ear, “Look to your treasures for the final secret.”']));
    expect(text).toContain('one of these paths, leading southwest, is marked');
    expect(text).toContain('inside the barrow');
    expect(text).toContain('your score is 350 (total of 350 points)');
    expect(game.state.gameOver).toBe(true);
  }, 120_000);
});
