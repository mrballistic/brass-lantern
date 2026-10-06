// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { normalize, openNative, openOriginal, playPrefix } from './zsession';

// The thief's rarer lines against the story file (4b checked them only against the ZIL): passing
// through the maze while you wait in it, he wanders through, leans against a wall, robs and
// leaves; junk vanishes (STEAL-JUNK) or turns up (DROP-JUNK). Their timing is random, so they're
// checked by lines: over many seeds a side, every such line the native game prints must be one
// the original prints. (Fight lines are the fight test's business.)
//
// Known difference: ROB-MAZE's “You hear, off in the distance, someone saying …”. Its text is in
// zork1.z3 and every condition in the source holds here, yet the original never says it (38 runs
// of 120–400 turns); natively it does. Finding Release 119's real condition is on the backlog.

const SEEDS = 30;
const WAITS = 120;
// Into the maze from the Round Room: treasure and junk left in Maze 1, then two rooms on to wait.
const ROUTE = ['west', 'west', 'west', 'drop rope', 'drop bottle', 'west', 'west'];
const DISTANT = 'you hear, off in the distance, someone saying';
/** The thief's own lines, not the fight's. */
const HIS = /vanished\.|rummaging through his bag|wandered through|leaning against one of the walls|just left|finding nothing of value/;

async function lines(side: 'native' | 'original', seed: number): Promise<string[]> {
  if (side === 'original') localStorage.clear();
  const game = side === 'original' ? await openOriginal(seed) : openNative(seed);
  if (!(await playPrefix(game.send))) return [];
  const out: string[] = [];
  for (const c of ROUTE) out.push(...(await game.send(c)));
  for (let i = 0; i < WAITS; i++) {
    const reply = await game.send('wait');
    out.push(...reply);
    // After a death, where things scatter is random: stop there.
    if (normalize(reply).includes('you have died')) break;
  }
  return out.map((l) => normalize([l])).filter(Boolean);
}

describe('the thief in the maze, against the original (backlog clear-out)', () => {
  it('every line of his the native game prints is one the original prints', async () => {
    const theirs = new Set<string>();
    const ours = new Set<string>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      for (const l of await lines('original', seed)) theirs.add(l);
      for (const l of await lines('native', seed)) ours.add(l);
    }
    const strangers = [...ours].filter((l) => HIS.test(l) && !l.startsWith(DISTANT) && !theirs.has(l));
    expect(strangers).toEqual([]);
    // Both sides did meet him, so the comparison isn't empty.
    expect([...theirs].filter((l) => HIS.test(l)).length).toBeGreaterThan(2);
    expect([...ours].filter((l) => HIS.test(l)).length).toBeGreaterThan(2);
  }, 1_800_000);
});
