import { defineStore } from 'pinia';
import { cartridges } from '@/app.config';
import { LAST_CARTRIDGE_KEY, menuLines } from '@/cartridges';
import { makeLine } from '@/engine/output';
import type { Cartridge } from '@/types/cartridge';
import type { OutputLine } from '@/types/game';

/** Which cartridge is inserted, and the menu shown when none is. */
export const useCartridgeStore = defineStore('cartridges', {
  state: () => ({
    activeId: null as string | null,
    output: [] as OutputLine[],
  }),

  getters: {
    active: (s): Cartridge | null => cartridges.find((c) => c.id === s.activeId) ?? null,
    /** Single-cartridge builds have no menu: no EJECT, and no title in the header. */
    hasMenu: (): boolean => cartridges.length > 1,
  },

  actions: {
    showMenu(): void {
      this.activeId = null;
      this.output = menuLines().map((l) => makeLine(l));
    },

    insert(c: Cartridge): void {
      this.activeId = c.id;
      try {
        window.localStorage.setItem(LAST_CARTRIDGE_KEY, c.id);
      } catch {
        // Only costs the resume-on-reload.
      }
    },

    /** The player typed something at the menu. Returns the chosen cartridge, if any. */
    choose(input: string): Cartridge | null {
      this.output.push(makeLine(`> ${input}`));
      const c = /^\d+$/.test(input) ? cartridges[Number(input) - 1] : undefined;
      if (!c) {
        this.output.push(makeLine(`[Type a number from 1 to ${cartridges.length}.]`));
        return null;
      }
      this.insert(c);
      return c;
    },

    eject(): void {
      try {
        window.localStorage.removeItem(LAST_CARTRIDGE_KEY);
      } catch {
        // Nothing to do.
      }
      this.showMenu();
    },
  },
});
