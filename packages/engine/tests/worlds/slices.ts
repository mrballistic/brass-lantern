import { initialState } from '../../src/engine/engine';
import { newConversation } from '../../src/engine/conversation';
import type { GameState } from '../../src/types/game';
import type { World } from '../../src/types/world';
import { normalize, nativeTurn, openOriginal, type StoryName } from './zsession';

export interface SliceOptions {
  /** The slice's name, for error messages. */
  name: string;
  story: StoryName;
  /** Played in the original only, to reach the slice's start. */
  prefix: string[];
  seed: number;
  /** The small native world the slice is played in. */
  world: World;
  /** Places the player and things to match the original's state at the slice start. */
  build: (state: GameState) => void;
  commands: string[];
  /** A substring the original's reply to the last prefix command must contain (the slice's room, say). */
  expect?: string;
}

/** Plays `commands` from a point mid-game in the original, and from `build`'s state in a native world; the replies to `commands` only. */
export async function sliceRun(options: SliceOptions): Promise<{ native: string[][]; original: string[][] }> {
  const { name, story, prefix, seed, world, build, commands, expect } = options;
  localStorage.clear();
  const game = await openOriginal(seed, story);
  let last: string[] = [];
  for (const c of prefix) last = await game.send(c);
  if (expect !== undefined && !normalize(last).includes(normalize([expect]))) {
    throw new Error(`slice “${name}”: the prefix did not reach it (expected “${expect}”); the last reply was: ${last.join(' / ')}`);
  }
  const original: string[][] = [];
  for (const c of commands) original.push(await game.send(c));

  const state = initialState(world);
  state.rng = seed;
  build(state);
  const conv = newConversation();
  const native = commands.map((c) => nativeTurn(c, state, conv, world));
  return { native, original };
}
