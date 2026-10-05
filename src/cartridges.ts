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
export function autoBootCartridge(): Cartridge | null {
  if (cartridges.length === 1) return cartridges[0];
  const last = cartridges.find((c) => c.id === stored(LAST_CARTRIDGE_KEY));
  return last && hasProgress(last) ? last : null;
}

export function defaultWorldCartridge(): WorldCartridge | undefined {
  return cartridges.find((c): c is WorldCartridge => c.kind === 'world');
}

export function menuLines(): string[] {
  const width = Math.max(...cartridges.map((c) => c.title.length));
  return [
    '═══════════════════════════════',
    'INSTALLED CARTRIDGES',
    '═══════════════════════════════',
    ...cartridges.map((c, i) => `  ${i + 1}  ${c.title.padEnd(width)}   ${c.kind === 'world' ? 'native' : c.format}`),
    '[Type a number to insert a cartridge. EJECT brings you back here.]',
  ];
}
