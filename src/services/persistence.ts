import type { GameState, OutputLine, SavedState } from '@/types/game';
import { SAVE_KEY, SAVE_VERSION } from '@/types/game';

const MAX_HISTORY_LINES = 500;

export interface PersistenceService {
  save(state: GameState, outputHistory: OutputLine[]): void;
  load(): SavedState | null;
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

export function createPersistenceService(): PersistenceService {
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
        storage.setItem(SAVE_KEY, JSON.stringify(payload));
      } catch {
        // Silent — quota exceeded or other storage failure should not break gameplay.
      }
    },

    load() {
      if (!storage) return null;
      try {
        const raw = storage.getItem(SAVE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedState;
        if (parsed.version !== SAVE_VERSION) return null;
        if (!parsed.gameState || typeof parsed.gameState.currentRoom !== 'string') return null;
        if (!Array.isArray(parsed.outputHistory)) parsed.outputHistory = [];
        return parsed;
      } catch {
        return null;
      }
    },

    clear() {
      if (!storage) return;
      try {
        storage.removeItem(SAVE_KEY);
      } catch {
        // Silent — non-fatal.
      }
    },
  };
}
