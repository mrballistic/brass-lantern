import { defineStore } from 'pinia';
import { cartridges, storagePrefix } from '@/app.config';
import { LAST_CARTRIDGE_KEY, menuLines } from '@/cartridges';
import { makeLine } from '@/engine/output';
import type { Cartridge, ZCodeCartridge } from '@/types/cartridge';
import type { OutputLine } from '@/types/game';
import { IndexedDbShelf } from '@/zmachine/shelf';
import type { LoadedStory } from '@/zmachine/storyfile';

// Stories the player loaded live on a shelf in IndexedDB. One the browser
// wouldn't store is kept in memory instead, playable until the next reload.
let shelf: IndexedDbShelf | null = null;
const unstored = new Map<string, Uint8Array>();

/** Swap the shelf (tests use a fresh database each). */
export function useShelf(s: IndexedDbShelf): void {
  shelf = s;
  unstored.clear();
}

function theShelf(): IndexedDbShelf {
  shelf ??= new IndexedDbShelf(`${storagePrefix}:stories`);
  return shelf;
}

/** A loaded story's bytes, from memory or the shelf. */
export async function localStoryBytes(id: string): Promise<Uint8Array | null> {
  return unstored.get(id) ?? (await theShelf().get(id));
}

const asCartridge = (s: { id: string; title: string; format: string }): ZCodeCartridge => ({
  kind: 'zcode',
  id: s.id,
  title: s.title,
  format: s.format,
  story: '',
  local: true,
});

/** Which cartridge is inserted, and the menu shown when none is. */
export const useCartridgeStore = defineStore('cartridges', {
  state: () => ({
    activeId: null as string | null,
    output: [] as OutputLine[],
    /** Stories the player loaded, after the built-in cartridges in the menu. */
    local: [] as ZCodeCartridge[],
  }),

  getters: {
    all: (s): Cartridge[] => [...cartridges, ...s.local],
    active(): Cartridge | null {
      return this.all.find((c) => c.id === this.activeId) ?? null;
    },
    /** Single-cartridge builds have no menu: no EJECT, no LOAD, and no title in the header. */
    hasMenu: (): boolean => cartridges.length > 1,
  },

  actions: {
    /** Reads the shelf. Only menu builds have one. */
    async loadShelf(): Promise<void> {
      if (!this.hasMenu) return;
      this.local = (await theShelf().list()).map(asCartridge);
    },

    showMenu(): void {
      this.activeId = null;
      this.output = menuLines(this.all).map((l) => makeLine(l));
    },

    insert(c: Cartridge): void {
      this.activeId = c.id;
      try {
        window.localStorage.setItem(LAST_CARTRIDGE_KEY, c.id);
      } catch {
        // Only costs the resume-on-reload.
      }
    },

    /** Puts a story the player loaded on the shelf. Returns its cartridge, and whether the browser kept it. */
    async addLocal(story: LoadedStory): Promise<{ cartridge: ZCodeCartridge; stored: boolean }> {
      const existing = this.local.find((c) => c.id === story.id);
      if (existing) return { cartridge: existing, stored: !unstored.has(story.id) };
      let stored = true;
      try {
        await theShelf().put(story);
      } catch {
        stored = false;
        unstored.set(story.id, story.bytes);
      }
      const cartridge = asCartridge(story);
      this.local.push(cartridge);
      return { cartridge, stored };
    },

    /** The player typed something at the menu. Returns the chosen cartridge, if any. */
    choose(input: string): Cartridge | null {
      this.output.push(makeLine(`> ${input}`));
      const c = /^\d+$/.test(input) ? this.all[Number(input) - 1] : undefined;
      if (!c) {
        this.output.push(makeLine(`[Type a number from 1 to ${this.all.length}.]`));
        return null;
      }
      this.insert(c);
      return c;
    },

    /** REMOVE <n> at the menu. Saved games and the autosave stay, so loading it again picks up. */
    async remove(input: string, n: number): Promise<void> {
      this.output.push(makeLine(`> ${input}`));
      const say = (text: string) => this.output.push(makeLine(text));
      if (this.local.length === 0) return void say('[There’s nothing on your shelf to remove.]');
      const c = this.all[n - 1];
      if (!c || c.kind !== 'zcode' || !c.local) {
        const first = cartridges.length + 1;
        const last = this.all.length;
        return void say(`[Only stories you loaded can be removed: REMOVE ${first === last ? first : `${first}–${last}`}.]`);
      }
      await theShelf().remove(c.id);
      unstored.delete(c.id);
      this.local = this.local.filter((l) => l.id !== c.id);
      this.showMenu();
      say(`[Removed ${c.title}. Its saved games stay, in case you load it again.]`);
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
