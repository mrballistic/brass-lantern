import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cartridges, storagePrefix } from '@/app.config';
import { createCatalog } from '@/stores/catalog';
import type { WorldCartridge, ZCodeCartridge } from '@/types/cartridge';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { localStorageSaveStore } from '@/zmachine/save-store';
import { ZMachineSession } from '@/zmachine/session';

const stories = cartridges.filter((c): c is ZCodeCartridge => c.kind === 'zcode');

// The real config for this repo (not the fixture).
describe('app config', () => {
  it('keeps Snack Attack on the save key 1.0.0 used, so existing games still load', () => {
    const snack = cartridges.find((c) => c.id === 'snack-attack') as WorldCartridge;
    expect(createCatalog({ cartridges, storagePrefix }).saveKeyFor(snack)).toBe('brass-lantern:save');
  });

  it('offers the Zork trilogy, and Zork I rebuilt natively', () => {
    expect(stories.map((c) => c.title)).toEqual(['ZORK I', 'ZORK II', 'ZORK III']);
    expect(cartridges.find((c) => c.id === 'zork1-native')?.kind).toBe('world');
  });

  it.each(stories)('$title: the story file and its license ship, and it boots', async (cart) => {
    const path = resolve(import.meta.dirname, '../public', cart.story);
    const bytes = new Uint8Array(readFileSync(path));
    // The header's first byte is the Z-machine version the menu advertises.
    expect(cart.format).toBe(`Z-machine v${bytes[0]}`);
    expect(readFileSync(resolve(path, '..', `LICENSE-${cart.id}.txt`), 'utf8')).toMatch(/^MIT License/);

    const lines: string[] = [];
    let waiting = false;
    new ZMachineSession(bytes, new LocalStorageDialog(localStorageSaveStore(`boot-${cart.id}:`)), {
      onLines: (l) => lines.push(...l),
      onStatus: () => {},
      onWaiting: () => {
        waiting = true;
      },
      onExit: () => {},
      onError: (m) => {
        throw new Error(m);
      },
    }).start();
    const start = Date.now();
    while (!waiting && Date.now() - start < 4000) await new Promise((r) => setTimeout(r, 5));
    expect(lines.join('\n')).toContain(`${cart.title}:`);
  });
});
