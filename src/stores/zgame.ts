import { defineStore } from 'pinia';
import type { OutputLine } from '@/types/game';
import type { ZCodeCartridge } from '@/types/cartridge';
import type { StatusLine } from '@/zmachine/types';
import { storagePrefix } from '@/app.config';
import { transcriptKey } from '@/cartridges';
import { makeLine } from '@/engine/output';
import { track } from '@/services/analytics';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { ZMachineSession, type SessionEvents } from '@/zmachine/session';

const MAX_TRANSCRIPT = 500;

interface RunningSession {
  start(): void;
  submit(text: string): void;
}

export interface ZGameDeps {
  fetchStory(url: string): Promise<Uint8Array>;
  createSession(story: Uint8Array, dialog: LocalStorageDialog, events: SessionEvents): RunningSession;
}

const defaultDeps: ZGameDeps = {
  async fetchStory(url) {
    const res = await fetch(`${import.meta.env.BASE_URL}${url}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },
  createSession: (story, dialog, events) => new ZMachineSession(story, dialog, events),
};

// Live objects stay out of Pinia state: they aren't serializable, and the
// store only ever runs one game at a time.
let deps: ZGameDeps = defaultDeps;
let session: RunningSession | null = null;
let story: Uint8Array | null = null;

function loadTranscript(id: string): OutputLine[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(transcriptKey(id)) ?? '[]');
    return Array.isArray(value) ? (value as OutputLine[]) : [];
  } catch {
    return [];
  }
}

function saveTranscript(id: string, lines: OutputLine[]): void {
  try {
    window.localStorage.setItem(transcriptKey(id), JSON.stringify(lines.slice(-MAX_TRANSCRIPT)));
  } catch {
    // A full or blocked localStorage costs the transcript, not the game.
  }
}

function clearTranscript(id: string): void {
  try {
    window.localStorage.removeItem(transcriptKey(id));
  } catch {
    // Nothing to do.
  }
}

const ENDED = '[The story has ended. Type PLAY to start again.]';

export const useZGameStore = defineStore('zgame', {
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
      session = null;
      story = null;
      this.$patch({ cartridgeId: cart.id, output: [], status: null, waiting: false, exited: false, restored: false, failed: false });

      const transcript = loadTranscript(cart.id);
      if (transcript.length > 0) {
        this.output = transcript;
        this.restored = true;
        this.appendLine('[Session restored. LOOK to look around.]');
      }

      try {
        story = await deps.fetchStory(cart.story);
      } catch {
        this.failed = true;
        this.appendLine('[This cartridge wouldn’t load. Check your connection and reload, or type EJECT.]');
        return;
      }
      this.boot();
      track(this.restored ? 'session_resumed' : 'game_start', { cartridge: cart.id });
    },

    /** Start (or restart) the story. Resumes from the autosave if there is one. */
    boot(): void {
      if (!story) return;
      const dialog = new LocalStorageDialog(storagePrefix);
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

    appendLine(text: string): void {
      this.output.push(makeLine(text));
    },
  },
});
