import { SAVE_VERSION, type GameState, type OutputLine, type SavedState } from '@brass-lantern/engine';

const MAX_HISTORY_LINES = 500;

export interface PersistenceService {
  save(state: GameState, outputHistory: OutputLine[]): void;
  /** The stored payload as parsed JSON, in whatever version it was saved; see migrateSave. */
  loadRaw(): unknown;
  clear(): void;
  isAvailable(): boolean;
  /**
   * A named save, stored beside the autosave under `<key>:named:<name>`. Its own
   * namespace: one cartridge's save key can be a prefix of another's.
   */
  saveNamed(name: string, state: GameState, outputHistory: OutputLine[]): void;
  loadNamed(name: string): unknown;
  /** The names of the named saves, sorted. */
  listNamed(): string[];
}

function detectStorage(): Storage | null {
  try {
    const testKey = '__storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Saves under `key` (a cartridge's save key) in localStorage. */
export function createPersistenceService(key: string): PersistenceService {
  const storage = detectStorage();

  function write(at: string, state: GameState, outputHistory: OutputLine[]): void {
    if (!storage) return;
    const capped = outputHistory.slice(-MAX_HISTORY_LINES);
    const payload: SavedState = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      gameState: state,
      outputHistory: capped,
    };
    try {
      storage.setItem(at, JSON.stringify(payload));
    } catch {
      // Silent — quota exceeded or other storage failure should not break gameplay.
    }
  }

  function read(at: string): unknown {
    if (!storage) return null;
    try {
      const raw = storage.getItem(at);
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  return {
    isAvailable: () => storage !== null,

    save: (state, outputHistory) => write(key, state, outputHistory),

    loadRaw: () => read(key),

    saveNamed: (name, state, outputHistory) => write(`${key}:named:${name}`, state, outputHistory),

    loadNamed: (name) => read(`${key}:named:${name}`),

    listNamed() {
      if (!storage) return [];
      const prefix = `${key}:named:`;
      const names: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(prefix)) names.push(k.slice(prefix.length));
      }
      return names.sort();
    },

    clear() {
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        // Silent — non-fatal.
      }
    },
  };
}
