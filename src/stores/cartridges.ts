import { defineStore } from 'pinia';
import { makeLine } from '@/engine/output';
import type { GameOptions } from '@/options';
import type { Cartridge, ZCodeCartridge } from '@/types/cartridge';
import type { OutputLine } from '@/types/game';
import { IndexedDbShelf } from '@/zmachine/shelf';
import type { LoadedStory } from '@/zmachine/storyfile';
import { createCatalog } from './catalog';

/**
 * One game's shelf: the stories the player loaded, in IndexedDB. One the browser
 * wouldn't store is kept in memory instead, playable until the next reload.
 */
export interface LocalShelf {
  shelf(): IndexedDbShelf;
  /** Swap the shelf (tests use a fresh database each). */
  use(s: IndexedDbShelf): void;
  /** Stories kept in memory only. */
  unstored: Map<string, Uint8Array>;
  /** A loaded story's bytes, from memory or the shelf. */
  storyBytes(id: string): Promise<Uint8Array | null>;
}

export function createLocalShelf(storagePrefix: string): LocalShelf {
  let shelf: IndexedDbShelf | null = null;
  const unstored = new Map<string, Uint8Array>();
  const theShelf = (): IndexedDbShelf => (shelf ??= new IndexedDbShelf(`${storagePrefix}:stories`));
  return {
    shelf: theShelf,
    use(s) {
      shelf = s;
      unstored.clear();
    },
    unstored,
    storyBytes: async (id) => unstored.get(id) ?? (await theShelf().get(id)),
  };
}

const asCartridge = (s: { id: string; title: string; format: string }): ZCodeCartridge => ({
  kind: 'zcode',
  id: s.id,
  title: s.title,
  format: s.format,
  story: '',
  local: true,
});

/** Which cartridge is inserted, and the menu shown when none is: one game's, by its storage prefix. */
export function createCartridgeStore(options: GameOptions, local: LocalShelf) {
  const { cartridges } = options;
  const catalog = createCatalog(options);
  const { unstored } = local;
  const theShelf = local.shelf;

  return defineStore(`${options.storagePrefix}:cartridges`, {
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
        this.output = catalog.menuLines(this.all).map((l) => makeLine(l));
      },

      insert(c: Cartridge): void {
        this.activeId = c.id;
        try {
          window.localStorage.setItem(catalog.lastCartridgeKey, c.id);
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
          window.localStorage.removeItem(catalog.lastCartridgeKey);
        } catch {
          // Nothing to do.
        }
        this.showMenu();
      },
    },
  });
}
