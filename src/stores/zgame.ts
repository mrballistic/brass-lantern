import { defineStore } from 'pinia';
import type { OutputLine } from '@/types/game';
import type { ZCodeCartridge } from '@/types/cartridge';
import type { StatusLine } from '@/zmachine/types';
import { makeLine } from '@/engine/output';
import { reportEvent, type GameOptions } from '@/options';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { localStorageSaveStore } from '@/zmachine/save-store';
import { createCatalog } from './catalog';
import type { LocalShelf } from './cartridges';
import type { SessionEvents } from '@/zmachine/session';

const MAX_TRANSCRIPT = 500;

interface RunningSession {
  start(): void;
  submit(text: string): void;
}

export interface ZGameDeps {
  fetchStory(url: string): Promise<Uint8Array>;
  /** A story the player loaded, from the shelf. */
  loadLocal(id: string): Promise<Uint8Array>;
  createSession(story: Uint8Array, dialog: LocalStorageDialog, events: SessionEvents): RunningSession;
}

// The interpreter (ifvms + glkapi) is loaded only when a story cartridge
// starts, so native-only builds don't download it.
let SessionClass: typeof import('@/zmachine/session').ZMachineSession | null = null;

async function loadInterpreter(): Promise<void> {
  SessionClass = (await import('@/zmachine/session')).ZMachineSession;
}

const ENDED = '[The story has ended. Type PLAY to start again.]';

/** The store for one game's Z-machine stories, by its storage prefix (see createGameStore). */
export function createZGameStore(options: GameOptions, local: LocalShelf) {
  const catalog = createCatalog(options);

  const defaultDeps: ZGameDeps = {
    async fetchStory(url) {
      const [res] = await Promise.all([
        // A stalled connection fails after 20s instead of hanging forever.
        fetch(`${import.meta.env.BASE_URL}${url}`, { signal: AbortSignal.timeout(20_000) }),
        loadInterpreter(),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async loadLocal(id) {
      const [bytes] = await Promise.all([local.storyBytes(id), loadInterpreter()]);
      if (!bytes) throw new Error('Not on the shelf');
      return bytes;
    },
    createSession: (story, dialog, events) => {
      if (!SessionClass) throw new Error('The interpreter isn’t loaded.');
      return new SessionClass(story, dialog, events);
    },
  };

  // Live objects stay out of Pinia state: they aren't serializable, and the
  // store only ever runs one game at a time.
  let deps: ZGameDeps = defaultDeps;
  let session: RunningSession | null = null;
  let story: Uint8Array | null = null;
  // Bumped by every initialize() and stop(), so a download that finishes after
  // the player has moved on (EJECT, or another cartridge) boots nothing.
  let generation = 0;

  function loadTranscript(id: string): OutputLine[] {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(catalog.transcriptKey(id)) ?? '[]');
      return Array.isArray(value) ? (value as OutputLine[]) : [];
    } catch {
      return [];
    }
  }

  function saveTranscript(id: string, lines: OutputLine[]): void {
    try {
      window.localStorage.setItem(catalog.transcriptKey(id), JSON.stringify(lines.slice(-MAX_TRANSCRIPT)));
    } catch {
      // A full or blocked localStorage costs the transcript, not the game.
    }
  }

  function clearTranscript(id: string): void {
    try {
      window.localStorage.removeItem(catalog.transcriptKey(id));
    } catch {
      // Nothing to do.
    }
  }

  return defineStore(`${options.storagePrefix}:zgame`, {
    state: () => ({
      cartridgeId: '',
      output: [] as OutputLine[],
      status: null as StatusLine | null,
      waiting: false,
      exited: false,
      restored: false,
      failed: false,
    }),

    getters: {
      headerStatus: (s): string => (s.status ? [s.status.location, s.status.detail].filter(Boolean).join('  ') : ''),
    },

    actions: {
      async initialize(cart: ZCodeCartridge, overrides: Partial<ZGameDeps> = {}): Promise<void> {
        deps = { ...defaultDeps, ...overrides };
        const mine = ++generation;
        session = null;
        story = null;
        this.$patch({ cartridgeId: cart.id, output: [], status: null, waiting: false, exited: false, restored: false, failed: false });

        const transcript = loadTranscript(cart.id);
        if (transcript.length > 0) {
          this.output = transcript;
          this.restored = true;
          this.appendLine('[Session restored. LOOK to look around.]');
        }

        this.appendLine('[Loading the cartridge…]');
        const loading = this.output[this.output.length - 1];
        let bytes: Uint8Array;
        try {
          bytes = cart.local ? await deps.loadLocal(cart.id) : await deps.fetchStory(cart.story);
        } catch {
          if (mine !== generation) return;
          this.removeLine(loading);
          this.failed = true;
          this.appendLine(
            cart.local
              ? '[This story isn’t in the browser any more. Type EJECT, then LOAD it again.]'
              : '[This cartridge wouldn’t load. Check your connection and reload, or type EJECT.]',
          );
          return;
        }
        if (mine !== generation) return;
        // Gone once loaded, so it never ends up in a saved transcript.
        this.removeLine(loading);
        story = bytes;
        this.boot();
        reportEvent(options, this.restored ? 'session_resumed' : 'game_start', { cartridge: cart.id });
      },

      /** Start (or restart) the story. Resumes from the autosave if there is one. */
      boot(): void {
        if (!story) return;
        const dialog = new LocalStorageDialog(localStorageSaveStore(`${options.storagePrefix}:`));
        session = deps.createSession(story, dialog, {
          onLines: (lines) => {
            for (const line of lines) this.appendLine(line);
          },
          onStatus: (status) => {
            this.status = status;
          },
          onWaiting: () => {
            this.waiting = true;
            saveTranscript(this.cartridgeId, this.output);
          },
          onExit: () => {
            this.exited = true;
            this.waiting = false;
            this.appendLine(ENDED);
            clearTranscript(this.cartridgeId);
          },
          onError: (message) => this.appendLine(`[The interpreter stopped: ${message}]`),
        });
        session.start();
      },

      /** The cartridge was ejected (or another inserted): drop the session and any pending start. */
      stop(): void {
        generation++;
        session = null;
        story = null;
      },

      submit(raw: string): void {
        const input = raw.trim();
        if (!input) return;
        this.output.push(makeLine(`> ${input}`));
        if (this.exited) {
          if (input.toLowerCase() === 'play') {
            this.exited = false;
            this.boot();
          } else {
            this.appendLine(ENDED);
          }
          return;
        }
        if (!session || !this.waiting) return;
        this.waiting = false;
        session.submit(input);
      },

      removeLine(line: OutputLine): void {
        const i = this.output.indexOf(line);
        if (i >= 0) this.output.splice(i, 1);
      },

      appendLine(text: string): void {
        this.output.push(makeLine(text));
      },
    },
  });
}
