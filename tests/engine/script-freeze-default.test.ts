import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

// No store import here: the freeze comes from tests/setup.ts alone.
const world: World = {
  ...fixtureWorld,
  scripts: {
    meddle: (ctx) => {
      (ctx.state as { currentRoom: string }).currentRoom = 'yard';
      return [];
    },
  },
};

describe('script freeze in tests', () => {
  it('is on for every test, so a script that assigns to state throws', () => {
    const s = stateWith(world);
    expect(() => runSteps([{ script: 'meddle' }], world, s)).toThrow();
    expect(s.currentRoom).not.toBe('yard');
  });
});
