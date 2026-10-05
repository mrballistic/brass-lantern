import type { GameState, OutputLine, SavedState } from '@/types/game';
import { SAVE_KEY, SAVE_VERSION } from '@/types/game';

const MAX_HISTORY_LINES = 500;

export interface PersistenceService {
  save(state: GameState, outputHistory: OutputLine[]): void;
  /** The stored payload as parsed JSON, in whatever version it was saved; see migrateSave. */
  loadRaw(): unknown;
  clear(): void;
  isAvailable(): boolean;
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

export function createPersistenceService(key: string = SAVE_KEY): PersistenceService {
  const storage = detectStorage();

  return {
    isAvailable: () => storage !== null,

    save(state, outputHistory) {
      if (!storage) return;
      const capped = outputHistory.slice(-MAX_HISTORY_LINES);
      const payload: SavedState = {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        gameState: state,
        outputHistory: capped,
      };
      try {
        storage.setItem(key, JSON.stringify(payload));
      } catch {
        // Silent — quota exceeded or other storage failure should not break gameplay.
      }
    },

    loadRaw() {
      if (!storage) return null;
      try {
        const raw = storage.getItem(key);
        return raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        return null;
      }
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
