import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setScriptFreeze } from '@brass-lantern/engine';
import { createGameStore } from '../../src/stores/game';
import { fixtureOptions } from '../fixtures/world';

// devChecks replaces the build-time import.meta.env.DEV: a library build would
// have frozen it at the library's build, so the app passes its own.
vi.mock('@brass-lantern/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@brass-lantern/engine')>()),
  setScriptFreeze: vi.fn(),
}));

describe('devChecks', () => {
  beforeEach(() => vi.mocked(setScriptFreeze).mockClear());

  it('turns the engine’s script freeze on', () => {
    createGameStore({ ...fixtureOptions, storagePrefix: 'dev-on', devChecks: true });
    expect(setScriptFreeze).toHaveBeenCalledWith(true);
  });

  it('leaves it alone by default, and when false (it never turns the freeze off)', () => {
    createGameStore({ ...fixtureOptions, storagePrefix: 'dev-default' });
    createGameStore({ ...fixtureOptions, storagePrefix: 'dev-off', devChecks: false });
    expect(setScriptFreeze).not.toHaveBeenCalled();
  });
});
