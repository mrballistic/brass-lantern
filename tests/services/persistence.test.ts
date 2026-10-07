// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPersistenceService } from '@/services/persistence';
import {
  SAVE_VERSION,
  type GameState,
  type OutputLine,
  type SavedState,
} from '@/types/game';

const SAVE_KEY = 'test:save';

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentRoom: 'cubicle',
    locations: {},
    itemState: {},
    visited: ['cubicle'],
    flags: {},
    moveCount: 0,
    gameOver: false,
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
      const svc = createPersistenceService(SAVE_KEY);
      expect(svc.isAvailable()).toBe(true);
    });

    it('save() writes a SavedState payload under the canonical key', () => {
      const svc = createPersistenceService(SAVE_KEY);
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
      const svc = createPersistenceService(SAVE_KEY);
      const state = makeGameState();
      const history: OutputLine[] = Array.from({ length: 600 }, (_, i) => makeOutputLine(i));

      svc.save(state, history);
      const loaded = svc.loadRaw() as SavedState | null;

      expect(loaded).not.toBeNull();
      expect(loaded?.outputHistory).toHaveLength(500);
      // Most recent entries retained: indices 100..599
      expect(loaded?.outputHistory[0].id).toBe('line-100');
      expect(loaded?.outputHistory[499].id).toBe('line-599');
    });

    it('loadRaw() returns null when no save exists', () => {
      const svc = createPersistenceService(SAVE_KEY);
      expect(svc.loadRaw()).toBeNull();
    });

    it('loadRaw() round-trips a saved SavedState', () => {
      const svc = createPersistenceService(SAVE_KEY);
      const state = makeGameState({
        currentRoom: 'breakroom',
        locations: { stapler: 'player', report: null, memo: 'lobby' },
        flags: { metBob: true },
        moveCount: 7,
        gameOver: false,
        firedEvents: ['intro'],
      });
      const history = [makeOutputLine(1), makeOutputLine(2)];

      svc.save(state, history);
      const loaded = svc.loadRaw() as SavedState | null;

      expect(loaded).not.toBeNull();
      expect(loaded?.gameState).toEqual(state);
      expect(loaded?.outputHistory).toEqual(history);
      expect(loaded?.version).toBe(SAVE_VERSION);
    });


    it('loadRaw() returns null on malformed JSON', () => {
      const svc = createPersistenceService(SAVE_KEY);
      window.localStorage.setItem(SAVE_KEY, '{ not valid json');
      expect(svc.loadRaw()).toBeNull();
    });

    it('loadRaw() returns an older save as stored, for migrateSave to convert', () => {
      const svc = createPersistenceService(SAVE_KEY);
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: '1.0', gameState: { currentRoom: 'x' } }));
      expect(svc.loadRaw()).toEqual({ version: '1.0', gameState: { currentRoom: 'x' } });
    });




    it('named saves live beside the autosave, and list in order', () => {
      const svc = createPersistenceService(SAVE_KEY);
      svc.saveNamed('zeta', makeGameState(), []);
      svc.saveNamed('alpha', makeGameState({ currentRoom: 'lobby' }), []);
      svc.save(makeGameState(), []);
      expect(svc.listNamed()).toEqual(['alpha', 'zeta']);
      expect((svc.loadNamed('alpha') as { gameState: { currentRoom: string } }).gameState.currentRoom).toBe('lobby');
      expect(svc.loadNamed('missing')).toBeNull();
    });

    it('clear() removes the save key', () => {
      const svc = createPersistenceService(SAVE_KEY);
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

      const svc = createPersistenceService(SAVE_KEY);
      // Probe ran during construction without throwing.
      expect(svc.isAvailable()).toBe(true);

      // Save should NOT propagate the error.
      expect(() => svc.save(makeGameState(), [])).not.toThrow();

      spy.mockRestore();
    });

    it('clear() swallows errors thrown by removeItem', () => {
      const svc = createPersistenceService(SAVE_KEY);
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

      const svc = createPersistenceService(SAVE_KEY);
      expect(svc.isAvailable()).toBe(false);

      // save() is a no-op — no throw, no write.
      expect(() => svc.save(makeGameState(), [])).not.toThrow();

      // loadRaw() returns null without throwing.
      expect(svc.loadRaw()).toBeNull();

      // clear() is a no-op without throwing.
      expect(() => svc.clear()).not.toThrow();
    });
  });
});
