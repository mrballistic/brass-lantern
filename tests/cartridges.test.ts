import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app.config', async () => {
  const { fixtureWorld } = await import('./fixtures/world');
  return {
    appName: 'TEST TERMINAL',
    storagePrefix: 'test',
    cartridges: [
      { kind: 'world', id: 'house', title: 'TEST HOUSE', world: fixtureWorld },
      { kind: 'zcode', id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' },
    ],
  };
});

const {
  autoBootCartridge,
  defaultWorldCartridge,
  hasProgress,
  LAST_CARTRIDGE_KEY,
  menuLines,
  saveKeyFor,
  transcriptKey,
} = await import('@/cartridges');
const { cartridges } = await import('@/app.config');

describe('cartridges', () => {
  beforeEach(() => localStorage.clear());

  it('derives storage keys', () => {
    expect(saveKeyFor(cartridges[0] as never)).toBe('test:save:house');
    expect(saveKeyFor({ ...(cartridges[0] as never), saveKey: 'custom' })).toBe('custom');
    expect(transcriptKey('story')).toBe('test:z:story:transcript');
  });

  it('knows which cartridges have a game in progress', () => {
    expect(hasProgress(cartridges[0])).toBe(false);
    localStorage.setItem('test:save:house', '{}');
    expect(hasProgress(cartridges[0])).toBe(true);
    localStorage.setItem('test:z:story:transcript', '[]');
    expect(hasProgress(cartridges[1])).toBe(true);
  });

  it('boots straight into the last cartridge only if it has progress', () => {
    expect(autoBootCartridge()).toBeNull();
    localStorage.setItem(LAST_CARTRIDGE_KEY, 'story');
    expect(autoBootCartridge()).toBeNull();
    localStorage.setItem('test:z:story:transcript', '[]');
    expect(autoBootCartridge()?.id).toBe('story');
    localStorage.setItem(LAST_CARTRIDGE_KEY, 'gone');
    expect(autoBootCartridge()).toBeNull();
  });

  it('finds the first native world', () => {
    expect(defaultWorldCartridge()?.id).toBe('house');
  });

  it('lists the cartridges as a numbered menu', () => {
    expect(menuLines()).toEqual([
      '═══════════════════════════════',
      'INSTALLED CARTRIDGES',
      '═══════════════════════════════',
      '  1  TEST HOUSE   native',
      '  2  A STORY      Z-machine v3',
      '[Type a number to insert a cartridge. EJECT brings you back here.]',
    ]);
  });
});
