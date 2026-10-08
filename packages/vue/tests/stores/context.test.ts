// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { fixtureOptions } from '../fixtures/world';

// Count the catalogs a game builds: the context's one, shared by every store.
vi.mock('../../src/stores/catalog.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/stores/catalog.ts')>();
  return { ...real, createCatalog: vi.fn(real.createCatalog) };
});

const { createCatalog } = await import('../../src/stores/catalog.ts');
const { createGameContext } = await import('../../src/stores/context.ts');

describe('createGameContext', () => {
  it('builds one catalog per game and hands it to every store', () => {
    setActivePinia(createPinia());
    vi.mocked(createCatalog).mockClear();
    const ctx = createGameContext({ ...fixtureOptions, storagePrefix: 'one-catalog' });
    ctx.useGameStore().initialize();
    ctx.useZGameStore();
    ctx.useCartridgeStore();
    expect(createCatalog).toHaveBeenCalledTimes(1);
  });
});
