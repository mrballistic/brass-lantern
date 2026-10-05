import { defineStore } from 'pinia';
import type { GameState, OutputLine, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import type { WorldCartridge } from '@/types/cartridge';
import { defaultWorldCartridge, saveKeyFor } from '@/cartridges';
import { cookiesCommand } from '@/services/cookies';
import {
  execute,
  initialState,
  openingLines,
  describeCurrentRoom,
  visibleItemsIn,
} from '@/engine/engine';
import { inventoryOf, isLit } from '@/engine/model';
import { migrateSave } from '@/engine/migrate';
import { fallbackParse, splitCommands } from '@/engine/parser';
import type { EngineResult } from '@/engine/engine';
import { buildContext, parseIntentRemote } from '@/engine/intent-client';
import { makeLine } from '@/engine/output';
import { createPersistenceService } from '@/services/persistence';
import { track } from '@/services/analytics';

/** Used before any world cartridge is inserted, e.g. in a Z-machine-only build. */
const EMPTY_WORLD: World = {
  startRoom: 'nowhere',
  rooms: { nowhere: { name: '', description: '', exits: {}, items: [], npcs: [], onEnter: [] } },
  items: {},
  npcs: {},
  events: {},
  dialogue: {},
  flagLabels: {},
};

const initialCartridge = defaultWorldCartridge();
let world: World = initialCartridge?.world ?? EMPTY_WORLD;
let persistence = createPersistenceService(initialCartridge ? saveKeyFor(initialCartridge) : undefined);

interface State {
  game: GameState;
  output: OutputLine[];
  isParsing: boolean;
  restored: boolean;
  /** game_completed already reported for the current game. */
  gameOverTracked: boolean;
  /** Most recent target the engine acted on, for "it" / "them". */
  lastTarget: string | null;
}

const PRONOUN = /^(?:it|them|that|this|him|her)$/i;

function sameAction(a: ParsedAction, b: ParsedAction): boolean {
  const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  return a.action === b.action && norm(a.target) === norm(b.target) && norm(a.indirect) === norm(b.indirect);
}

function freshGame(): GameState {
  return initialState(world);
}

export const useGameStore = defineStore('game', {
  state: (): State => ({
    game: freshGame(),
    output: [],
    isParsing: false,
    restored: false,
    gameOverTracked: false,
    lastTarget: null,
  }),

  getters: {
    moveCount: (s) => s.game.moveCount,
    gameOver: (s) => s.game.gameOver,
    persistenceAvailable: () => persistence.isAvailable(),
    world: () => world,
    currentRoom: (s) => world.rooms[s.game.currentRoom],
    // In the dark the player sees nothing in the room, and neither does the LLM.
    visibleItems: (s) => (isLit(world, s.game) ? visibleItemsIn(s.game.currentRoom, world, s.game) : []),
  },

  actions: {
    initialize(cartridge: WorldCartridge | undefined = defaultWorldCartridge()): void {
      if (!cartridge) throw new Error('There is no world cartridge to play.');
      world = cartridge.world;
      persistence = createPersistenceService(saveKeyFor(cartridge));
      this.$patch({ game: freshGame(), output: [], isParsing: false, restored: false, gameOverTracked: false, lastTarget: null });
      const saved = migrateSave(world, persistence.loadRaw());
      if (saved) {
        this.game = saved.gameState;
        this.gameOverTracked = saved.gameState.gameOver;
        this.output = saved.outputHistory;
        this.restored = true;
        this.appendSystem('[Session restored — type LOOK to re-orient]');
        track('session_resumed');
      } else {
        this.appendLines(openingLines(world, this.game));
        this.persist();
        track('game_start');
      }
    },

    appendLines(texts: string[]): void {
      for (const t of texts) {
        if (!t) continue;
        this.output.push(makeLine(t));
      }
    },

    appendSystem(text: string): void {
      this.output.push(makeLine(text));
    },

    appendInput(text: string): void {
      this.output.push(makeLine(`> ${text}`));
    },

    async submit(rawInput: string): Promise<void> {
      const input = rawInput.trim();
      if (!input) return;

      this.appendInput(input);

      // Meta commands handled by the store, not the engine.
      const lower = input.toLowerCase();
      if (lower === 'save') {
        this.persist();
        this.appendSystem(
          persistence.isAvailable()
            ? 'Progress saved to local terminal memory.'
            : 'Local terminal memory is unavailable in this browser mode. Progress will not persist across sessions.',
        );
        return;
      }
      if (lower === 'load') {
        const loaded = migrateSave(world, persistence.loadRaw());
        if (!loaded) {
          this.appendSystem('No saved game found.');
          return;
        }
        this.game = loaded.gameState;
        this.gameOverTracked = loaded.gameState.gameOver;
        this.output = loaded.outputHistory;
        this.appendSystem('[Session restored from local terminal memory]');
        this.appendLines(describeCurrentRoom(world, this.game));
        return;
      }
      if (lower === 'restart') {
        this.restartGame();
        return;
      }

      if (lower === 'cookies' || lower === 'privacy') {
        this.appendSystem(cookiesCommand());
        return;
      }

      // "get key and wallet", "take wallet then go outside": each piece runs
      // on its own, so each gets the LLM fallback if it misses.
      for (const command of splitCommands(input, world.verbs)) {
        if (this.game.gameOver) break;
        await this.runCommand(command);
      }
    },

    /**
     * One command. The regex parser handles canonical commands with zero
     * latency. When it can't parse the input, or parses it into something
     * the engine can't act on ("insert disk", "dance"), the LLM gets a chance
     * to read the intent. Misses never mutate state, so trying the regex
     * reading first is safe.
     */
    async runCommand(input: string): Promise<void> {
      const parsed = fallbackParse(input, world.verbs);
      if (parsed) {
        const result = this.execute(this.resolvePronoun(parsed));
        if (result.understood !== false) {
          this.applyResult(result);
          return;
        }
        const retry = await this.reinterpret(input, parsed);
        this.applyResult(retry ?? result);
        return;
      }

      const retry = await this.reinterpret(input, null);
      this.applyResult(retry ?? this.execute({ action: 'unknown' }));
    },

    /** "give it to gary" right after "take the stapler" means the stapler. */
    resolvePronoun(action: ParsedAction): ParsedAction {
      if (action.target && PRONOUN.test(action.target) && this.lastTarget) {
        return { ...action, target: this.lastTarget };
      }
      return action;
    },

    /**
     * Ask the LLM what the player meant. Returns the engine's result for that
     * reading, or null when the LLM has nothing better than `previous`.
     */
    async reinterpret(input: string, previous: ParsedAction | null): Promise<EngineResult | null> {
      this.isParsing = true;
      try {
        const ctx = buildContext(
          world.rooms[this.game.currentRoom],
          world,
          inventoryOf(world, this.game),
          this.visibleItems,
        );
        const action = await parseIntentRemote(input, ctx);
        if (action.action === 'unknown') return null;
        if (previous && sameAction(action, previous)) return null;
        const result = this.execute(action);
        // If the LLM's reading misses too, the literal reading's reply is clearer.
        if (previous && result.understood === false) return null;
        return result;
      } finally {
        this.isParsing = false;
      }
    },

    execute(action: ParsedAction): EngineResult {
      const result = execute(action, { world, state: this.game });
      if (result.understood !== false && action.target && !PRONOUN.test(action.target)) {
        this.lastTarget = action.target;
      }
      return result;
    },

    applyResult(result: EngineResult): void {
      this.appendLines(result.lines);
      if (result.mutated) this.persist();
      // Fire game_completed exactly once per game, on the transition.
      if (!this.gameOverTracked && this.game.gameOver) {
        this.gameOverTracked = true;
        track('game_completed', { move_count: this.game.moveCount });
      }
    },

    runAction(action: ParsedAction): void {
      this.applyResult(this.execute(action));
    },

    persist(): void {
      persistence.save(this.game, this.output);
    },

    restartGame(): void {
      persistence.clear();
      this.game = freshGame();
      this.gameOverTracked = false;
      this.output = [];
      this.appendLines(openingLines(world, this.game));
      this.persist();
    },
  },
});
