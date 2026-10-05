import { cartridges, storagePrefix } from '@/app.config';
import type { Cartridge, WorldCartridge } from '@/types/cartridge';

/** The cartridge last inserted, so a reload can go straight back to it. */
export const LAST_CARTRIDGE_KEY = `${storagePrefix}:cartridge`;

export function saveKeyFor(c: WorldCartridge): string {
  return c.saveKey ?? `${storagePrefix}:save:${c.id}`;
}

export function transcriptKey(id: string): string {
  return `${storagePrefix}:z:${id}:transcript`;
}

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Is there a game in progress to come back to? */
export function hasProgress(c: Cartridge): boolean {
  return stored(c.kind === 'world' ? saveKeyFor(c) : transcriptKey(c.id)) !== null;
}

/** The cartridge to boot without a menu: the only one, or the last one played if it has progress. */
export function autoBootCartridge(all: Cartridge[] = cartridges): Cartridge | null {
  if (cartridges.length === 1) return cartridges[0];
  const last = all.find((c) => c.id === stored(LAST_CARTRIDGE_KEY));
  return last && hasProgress(last) ? last : null;
}

/** Before the shelf is read: will boot resume a game? (Picks the short boot animation.) */
export function willResume(): boolean {
  const c = autoBootCartridge();
  if (c) return hasProgress(c);
  const last = stored(LAST_CARTRIDGE_KEY);
  return last !== null && last.startsWith('local-') && stored(transcriptKey(last)) !== null;
}

export function defaultWorldCartridge(): WorldCartridge | undefined {
  return cartridges.find((c): c is WorldCartridge => c.kind === 'world');
}

export function menuLines(all: Cartridge[] = cartridges): string[] {
  const width = Math.max(...all.map((c) => c.title.length));
  const format = (c: Cartridge) => (c.kind === 'world' ? 'native' : c.local ? `${c.format}   yours` : c.format);
  return [
    '═══════════════════════════════',
    'INSTALLED CARTRIDGES',
    '═══════════════════════════════',
    ...all.map((c, i) => `  ${i + 1}  ${c.title.padEnd(width)}   ${format(c)}`),
    '[Type a number to insert a cartridge. EJECT brings you back here.]',
    '[LOAD plays a Z-machine story file from your computer. It stays in this browser; nothing is uploaded.]',
    ...(all.some((c) => c.kind === 'zcode' && c.local) ? ['[REMOVE and a number takes one of yours off the shelf.]'] : []),
  ];
}
