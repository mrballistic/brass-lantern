import { describe, expect, it } from 'vitest';
import { cartridges } from '@/app.config';
import { saveKeyFor } from '@/cartridges';
import type { WorldCartridge } from '@/types/cartridge';

// The real config for this repo (not the fixture).
describe('app config', () => {
  it('keeps Snack Attack on the save key 1.0.0 used, so existing games still load', () => {
    const snack = cartridges.find((c) => c.id === 'snack-attack') as WorldCartridge;
    expect(saveKeyFor(snack)).toBe('brass-lantern:save');
  });
});
