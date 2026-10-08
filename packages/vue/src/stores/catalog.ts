import type { Cartridge, WorldCartridge } from '@brass-lantern/engine';
import { readItem } from '../services/storage.ts';

/** One game's cartridges and the browser keys derived from its storage prefix. */
export interface Catalog {
  /** The cartridge last inserted, so a reload can go straight back to it. */
  lastCartridgeKey: string;
  saveKeyFor(c: WorldCartridge): string;
  transcriptKey(id: string): string;
  /** Is there a game in progress to come back to? */
  hasProgress(c: Cartridge): boolean;
  /** The cartridge to boot without a menu: the only one, or the last one played if it has progress. */
  autoBootCartridge(all?: Cartridge[]): Cartridge | null;
  /** Before the shelf is read: will boot resume a game? (Picks the short boot animation.) */
  willResume(): boolean;
  defaultWorldCartridge(): WorldCartridge | undefined;
  menuLines(all?: Cartridge[]): string[];
}

/** The menu's format column: native worlds, story files, and the player's own. */
function formatLabel(c: Cartridge): string {
  if (c.kind === 'world') return 'native';
  return c.local ? `${c.format}   yours` : c.format;
}

export function createCatalog({ cartridges, storagePrefix }: { cartridges: Cartridge[]; storagePrefix: string }): Catalog {
  const lastCartridgeKey = `${storagePrefix}:cartridge`;
  const saveKeyFor = (c: WorldCartridge): string => c.saveKey ?? `${storagePrefix}:save:${c.id}`;
  const transcriptKey = (id: string): string => `${storagePrefix}:z:${id}:transcript`;
  const hasProgress = (c: Cartridge): boolean =>
    readItem(c.kind === 'world' ? saveKeyFor(c) : transcriptKey(c.id)) !== null;

  function autoBootCartridge(all: Cartridge[] = cartridges): Cartridge | null {
    if (cartridges.length === 1) return cartridges[0];
    const last = all.find((c) => c.id === readItem(lastCartridgeKey));
    return last && hasProgress(last) ? last : null;
  }

  return {
    lastCartridgeKey,
    saveKeyFor,
    transcriptKey,
    hasProgress,
    autoBootCartridge,

    willResume() {
      const c = autoBootCartridge();
      if (c) return hasProgress(c);
      const last = readItem(lastCartridgeKey);
      return last !== null && last.startsWith('local-') && readItem(transcriptKey(last)) !== null;
    },

    defaultWorldCartridge: () => cartridges.find((c): c is WorldCartridge => c.kind === 'world'),

    menuLines(all: Cartridge[] = cartridges) {
      const width = Math.max(...all.map((c) => c.title.length));
      return [
        '═══════════════════════════════',
        'INSTALLED CARTRIDGES',
        '═══════════════════════════════',
        ...all.map((c, i) => `  ${i + 1}  ${c.title.padEnd(width)}   ${formatLabel(c)}`),
        '[Type a number to insert a cartridge. EJECT brings you back here.]',
        '[LOAD plays a Z-machine story file from your computer. It stays in this browser; nothing is uploaded.]',
        ...(all.some((c) => c.kind === 'zcode' && c.local) ? ['[REMOVE and a number takes one of yours off the shelf.]'] : []),
      ];
    },
  };
}
