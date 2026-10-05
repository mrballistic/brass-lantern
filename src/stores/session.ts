import { computed } from 'vue';
import { autoBootCartridge } from '@/cartridges';
import { makeLine } from '@/engine/output';
import { cookiesCommand } from '@/services/cookies';
import type { Cartridge } from '@/types/cartridge';
import { useCartridgeStore } from './cartridges';
import { useGameStore } from './game';
import { useZGameStore } from './zgame';

export type SessionMode = 'menu' | 'world' | 'zcode';

/**
 * One interface for the terminal, whatever is running: the cartridge menu,
 * a native world, or a Z-machine story.
 */
export function useSession() {
  const carts = useCartridgeStore();
  const game = useGameStore();
  const zgame = useZGameStore();

  const mode = computed<SessionMode>(() => carts.active?.kind ?? 'menu');
  const output = computed(() =>
    mode.value === 'world' ? game.output : mode.value === 'zcode' ? zgame.output : carts.output,
  );
  const isParsing = computed(() => mode.value === 'world' && game.isParsing);
  const restored = computed(() =>
    mode.value === 'world' ? game.restored : mode.value === 'zcode' ? zgame.restored : false,
  );
  const status = computed(() =>
    mode.value === 'world' ? `MOVES: ${game.moveCount}` : mode.value === 'zcode' ? zgame.headerStatus : '',
  );
  const title = computed(() => (carts.hasMenu ? (carts.active?.title ?? '') : ''));

  async function start(c: Cartridge): Promise<void> {
    carts.insert(c);
    if (c.kind === 'world') game.initialize(c);
    else await zgame.initialize(c);
  }

  /** After the boot animation: resume or boot the obvious cartridge, or show the menu. */
  async function boot(): Promise<void> {
    const c = autoBootCartridge();
    if (c) await start(c);
    else carts.showMenu();
  }

  async function submit(raw: string): Promise<void> {
    const input = raw.trim();
    const lower = input.toLowerCase();
    if (lower === 'eject' && carts.hasMenu && mode.value !== 'menu') {
      carts.eject();
      return;
    }
    if (mode.value === 'world') {
      await game.submit(input);
      return;
    }
    const lines = mode.value === 'zcode' ? zgame.output : carts.output;
    if (lower === 'cookies' || lower === 'privacy') {
      lines.push(makeLine(`> ${input}`), makeLine(cookiesCommand()));
      return;
    }
    if (mode.value === 'zcode') {
      zgame.submit(input);
      return;
    }
    const chosen = carts.choose(input);
    if (chosen) await start(chosen);
  }

  return { mode, output, isParsing, restored, status, title, boot, start, submit };
}
