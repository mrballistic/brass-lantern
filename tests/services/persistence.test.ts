import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPersistenceService } from '@/services/persistence';
import {
  SAVE_KEY,
  SAVE_VERSION,
  type GameState,
  type OutputLine,
  type SavedState,
} from '@/types/game';

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentRoom: 'cubicle',
    inventory: [],
    flags: {},
    moveCount: 0,
    gameOver: false,
    itemsRemoved: {},
    itemsAdded: {},
    firedEvents: [],
    ...overrides,
  };
}

function makeOutputLine(i: number): OutputLine {
  return {
    id: `line-${i}`,
    text: `line ${i}`,
    timestamp: 1000 + i,
    type: 'prose',
  };
}

describe('persistence service', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  describe('with localStorage available', () => {
    it('isAvailable() returns true under happy-dom', () => {
      const svc = createPersistenceService();
      expect(svc.isAvailable()).toBe(true);
    });

    it('save() writes a SavedState payload under the canonical key', () => {
      const svc = createPersistenceService();
      const state = makeGameState({ currentRoom: 'lobby', moveCount: 3 });
      const history: OutputLine[] = [makeOutputLine(0), makeOutputLine(1)];

      svc.save(state, history);

      const raw = window.localStorage.getItem(SAVE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string) as SavedState;
      expect(parsed.version).toBe(SAVE_VERSION);
      expect(typeof parsed.savedAt).toBe('string');
      expect(parsed.gameState).toEqual(state);
      expect(parsed.outputHistory).toEqual(history);
    });

    it('save() caps output history to the most recent 500 lines', () => {
      const svc = createPersistenceService();
      const state = makeGameState();
      const history: OutputLine[] = Array.from({ length: 600 }, (_, i) => makeOutputLine(i));

      svc.save(state, history);
      const loaded = svc.load();

      expect(loaded).not.toBeNull();
      expect(loaded?.outputHistory).toHaveLength(500);
      // Most recent entries retained: indices 100..599
      expect(loaded?.outputHistory[0].id).toBe('line-100');
      expect(loaded?.outputHistory[499].id).toBe('line-599');
    });

    it('load() returns null when no save exists', () => {
      const svc = createPersistenceService();
      expect(svc.load()).toBeNull();
    });

    it('load() round-trips a saved SavedState', () => {
      const svc = createPersistenceService();
      const state = makeGameState({
        currentRoom: 'breakroom',
        inventory: ['stapler'],
        flags: { metBob: true },
        moveCount: 7,
        gameOver: false,
        itemsRemoved: { cubicle: ['report'] },
        itemsAdded: { lobby: ['memo'] },
        firedEvents: ['intro'],
      });
      const history = [makeOutputLine(1), makeOutputLine(2)];

      svc.save(state, history);
      const loaded = svc.load();

      expect(loaded).not.toBeNull();
      expect(loaded?.gameState).toEqual(state);
      expect(loaded?.outputHistory).toEqual(history);
      expect(loaded?.version).toBe(SAVE_VERSION);
    });

    it('load() returns null on version mismatch', () => {
      const svc = createPersistenceService();
      const payload: SavedState = {
        version: '0.9',
        savedAt: new Date().toISOString(),
        gameState: makeGameState(),
        outputHistory: [],
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));

      expect(svc.load()).toBeNull();
    });

    it('load() returns null on malformed JSON', () => {
      const svc = createPersistenceService();
      window.localStorage.setItem(SAVE_KEY, '{ not valid json');
      expect(svc.load()).toBeNull();
    });

    it('load() returns null when gameState.currentRoom is missing', () => {
      const svc = createPersistenceService();
      const bogus = {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        gameState: { inventory: [], flags: {}, moveCount: 0 },
        outputHistory: [],
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(bogus));

      expect(svc.load()).toBeNull();
    });

    it('load() returns null when gameState itself is missing', () => {
      const svc = createPersistenceService();
      const bogus = {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        outputHistory: [],
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(bogus));

      expect(svc.load()).toBeNull();
    });

    it('load() coerces a non-array outputHistory to an empty array', () => {
      const svc = createPersistenceService();
      const bogus = {
        version: SAVE_VERSION,
        savedAt: new Date().toISOString(),
        gameState: makeGameState(),
        outputHistory: 'not-an-array',
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(bogus));

      const loaded = svc.load();
      expect(loaded).not.toBeNull();
      expect(loaded?.outputHistory).toEqual([]);
    });

    it('clear() removes the save key', () => {
      const svc = createPersistenceService();
      svc.save(makeGameState(), []);
      expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull();

      svc.clear();
      expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
    });

    it('save() swallows quota-exceeded errors thrown by setItem', () => {
      // Probe call (with __storage_probe__) succeeds; the actual save throws.
      const realSetItem = window.localStorage.setItem.bind(window.localStorage);
      const spy = vi
        .spyOn(window.localStorage, 'setItem')
        .mockImplementation((key: string, value: string) => {
          if (key === SAVE_KEY) {
            throw new Error('QuotaExceededError');
          }
          realSetItem(key, value);
        });

      const svc = createPersistenceService();
      // Probe ran during construction without throwing.
      expect(svc.isAvailable()).toBe(true);

      // Save should NOT propagate the error.
      expect(() => svc.save(makeGameState(), [])).not.toThrow();

      spy.mockRestore();
    });

    it('clear() swallows errors thrown by removeItem', () => {
      const svc = createPersistenceService();
      const spy = vi
        .spyOn(window.localStorage, 'removeItem')
        .mockImplementation(() => {
          throw new Error('removeItem failure');
        });

      expect(() => svc.clear()).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('with localStorage unavailable', () => {
    it('isAvailable() returns false, save/load/clear are no-ops', () => {
      // Stub setItem to throw on the probe so detectStorage() returns null.
      const throwingStorage: Storage = {
        length: 0,
        clear: () => {
          throw new Error('unavailable');
        },
        getItem: () => {
          throw new Error('unavailable');
        },
        key: () => {
          throw new Error('unavailable');
        },
        removeItem: () => {
          throw new Error('unavailable');
        },
        setItem: () => {
          throw new Error('unavailable');
        },
      };

      vi.stubGlobal(
        'window',
        new Proxy(window, {
          get(target, prop, receiver) {
            if (prop === 'localStorage') return throwingStorage;
            return Reflect.get(target, prop, receiver);
          },
        }),
      );

      const svc = createPersistenceService();
      expect(svc.isAvailable()).toBe(false);

      // save() is a no-op — no throw, no write.
      expect(() => svc.save(makeGameState(), [])).not.toThrow();

      // load() returns null without throwing.
      expect(svc.load()).toBeNull();

      // clear() is a no-op without throwing.
      expect(() => svc.clear()).not.toThrow();
    });
  });
});
