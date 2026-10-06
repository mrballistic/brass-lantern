import { toRaw } from 'vue';
import { defineStore } from 'pinia';
import type { GameState, OutputLine, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import type { WorldCartridge } from '@/types/cartridge';
import { defaultWorldCartridge, saveKeyFor } from '@/cartridges';
import { appName } from '@/app.config';
import { cookiesCommand } from '@/services/cookies';
import {
  captureLine,
  execute,
  initialState,
  openingLines,
  describeCurrentRoom,
  visibleItemsIn,
} from '@/engine/engine';
import { inventoryOf, isLit, npcsSeen } from '@/engine/model';
import { scriptLines, statusText } from '@/engine/verbs/meta';
import { migrateSave } from '@/engine/migrate';
import { fallbackParse, splitCommands } from '@/engine/parser';
import { interpret, newConversation, remember, resolvePronouns } from '@/engine/conversation';
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
let cartridgeId = initialCartridge?.id ?? 'game';
/** Where the transcript started in the output, while SCRIPT is on. */
let scriptFrom: number | null = null;

/** This line's UNDO snapshot, taken before it runs and kept if it changes anything. */
let line: { snapshot: { state: GameState; outputLength: number }; changed: boolean } = {
  snapshot: { state: freshGame(), outputLength: 0 },
  changed: false,
};

function beginLine(game: GameState, outputLength: number): void {
  line = { snapshot: { state: structuredClone(toRaw(game)), outputLength }, changed: false };
}

/** Saves a transcript as a file. Tests swap it out with setDownload. */
export function defaultDownload(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

let download = defaultDownload;

export function setDownload(fn: (filename: string, text: string) => void): void {
  download = fn;
}
/** Save names: lowercase letters, digits, spaces (or _) and -, at most 32. */
function saveName(raw: string): string {
  return raw
    .toLowerCase()
    // The LLM names things in snake_case: my_game is the typed my game.
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)
    .trim();
}

let persistence = createPersistenceService(initialCartridge ? saveKeyFor(initialCartridge) : undefined);
// Between-command state (questions, pronouns, AGAIN, OOPS, UNDO). Not saved.
let conversation = newConversation();
const UNDO_LIMIT = 50;

interface State {
  game: GameState;
  output: OutputLine[];
  isParsing: boolean;
  restored: boolean;
  /** game_completed already reported for the current game. */
  gameOverTracked: boolean;
}


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
  }),

  getters: {
    moveCount: (s) => s.game.moveCount,
    /** The header's status text for this world's style. */
    headerStatus: (s) => statusText(world, s.game),
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
      cartridgeId = cartridge.id;
      scriptFrom = null;
      persistence = createPersistenceService(saveKeyFor(cartridge));
      conversation = newConversation();
      this.$patch({ game: freshGame(), output: [], isParsing: false, restored: false, gameOverTracked: false });
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

    /** SCRIPT starts a transcript; UNSCRIPT, or SCRIPT again, downloads it. */
    transcript(which: 'start' | 'stop'): void {
      if (which === 'start' && scriptFrom === null) {
        scriptFrom = this.output.length;
        this.appendLines(scriptLines(world, 'start'));
        return;
      }
      if (scriptFrom === null) {
        this.appendSystem('[There’s no transcript running. Type SCRIPT to start one.]');
        return;
      }
      this.appendLines(scriptLines(world, 'stop'));
      download(`${cartridgeId}-transcript.txt`, this.output.slice(scriptFrom).map((l) => l.text).join('\n'));
      scriptFrom = null;
    },

    /** SAVE [name]. No usable name asks for one. */
    saveAs(raw: string | undefined): void {
      if (!persistence.isAvailable()) {
        this.appendSystem('Local terminal memory is unavailable in this browser mode. Progress will not persist across sessions.');
        return;
      }
      const name = saveName(raw ?? '');
      if (!name) {
        conversation.prompt = 'save';
        this.appendSystem('Save as? Type a name, or CANCEL.');
        return;
      }
      persistence.saveNamed(name, this.game, this.output);
      this.appendSystem(`Saved as ${name}.`);
    },

    /** RESTORE [name]. No name lists the saves and asks which. */
    restoreFrom(raw: string | undefined): void {
      const names = persistence.listNamed();
      const name = raw === undefined ? '' : saveName(raw);
      if (!name) {
        if (names.length === 0) {
          this.appendSystem('[There are no saved games yet.]');
          return;
        }
        conversation.prompt = 'restore';
        this.appendSystem(`Restore which save? ${names.join(', ')}. Or CANCEL.`);
        return;
      }
      const loaded = migrateSave(world, persistence.loadNamed(name));
      if (!loaded) {
        this.appendSystem(`[There’s no save called “${raw!.trim()}”.]`);
        return;
      }
      this.game = loaded.gameState;
      this.gameOverTracked = loaded.gameState.gameOver;
      // Another timeline: its undo history, question and pronouns don't apply.
      conversation = newConversation();
      this.appendSystem(`Restored ${name}.`);
      this.appendLines(describeCurrentRoom(world, this.game));
      this.persist();
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

      // Where the screen and the game stood before this line, for UNDO.
      beginLine(this.game, this.output.length);
      const movesBefore = this.game.moveCount;
      this.appendInput(input);

      // SAVE or RESTORE asked for a name: this line is the answer.
      const prompt = conversation.prompt;
      conversation.prompt = null;
      if (prompt) {
        if (input.toLowerCase() === 'cancel') this.appendSystem('[Cancelled.]');
        else if (prompt === 'save') this.saveAs(input);
        else this.restoreFrom(input);
        return;
      }

      // "get key and wallet", "take wallet then go outside": each piece runs
      // on its own, so each gets the LLM fallback if it misses.
      for (const [i, command] of splitCommands(input, world.verbs).entries()) {
        // Store commands (RESTART above all) work even after the game has ended.
        if (this.storeCommand(command)) {
          if (conversation.prompt) break;
          continue;
        }
        // Once the game is over, one command hears that it has ended; the rest of the line is dropped.
        if (this.game.gameOver && i > 0) break;
        try {
          // A room or the world can take input before it's parsed; taking it ends the line.
          const captured = conversation.pending ? null : captureLine(world, this.game, command);
          if (captured) {
            if (captured.mutated) line.changed = true;
            this.applyResult(captured);
            break;
          }
          await this.runCommand(command);
        } catch (error) {
          // The engine rolled the turn back; say so, and drop the rest of the line.
          console.error('Command failed:', error);
          this.appendSystem('[Something went wrong with that command. Nothing changed.]');
          break;
        }
        // A question stops the line, as in Zork: the next line answers it.
        if (conversation.pending) break;
      }
      this.endLine();
      // MOVES counts turns that changed nothing else, too.
      if (this.game.moveCount !== movesBefore) this.persist();
    },

    /** The one UNDO snapshot for a line, kept if any piece of it changed the game. */
    endLine(): void {
      if (!line.changed) return;
      conversation.history.push(line.snapshot);
      if (conversation.history.length > UNDO_LIMIT) conversation.history.shift();
      line.changed = false;
    },

    /**
     * Commands the store handles itself, not the engine: saves, UNDO, RESTART,
     * COOKIES. Returns false for anything else.
     */
    storeCommand(command: string): boolean {
      const lower = command.trim().toLowerCase();
      const saveOrRestore = lower.match(/^(save|restore)(?:\s+(.+))?$/);
      const isStore = Boolean(saveOrRestore) || ['load', 'undo', 'restart', 'cookies', 'privacy'].includes(lower);
      if (!isStore) return false;
      // A store command answers no question, and UNDO and the rest act on the line so far.
      conversation.pending = null;
      this.endLine();
      if (saveOrRestore) {
        const [, verb, name] = saveOrRestore;
        if (verb === 'save') this.saveAs(name);
        else this.restoreFrom(name);
      } else if (lower === 'load') this.loadAutosave();
      else if (lower === 'undo') this.undo();
      else if (lower === 'restart') this.restartGame();
      else this.appendSystem(cookiesCommand());
      beginLine(this.game, this.output.length);
      return true;
    },

    /** LOAD: back to the autosave. */
    loadAutosave(): void {
      const loaded = migrateSave(world, persistence.loadRaw());
      if (!loaded) {
        this.appendSystem('No saved game found.');
        return;
      }
      this.game = loaded.gameState;
      this.gameOverTracked = loaded.gameState.gameOver;
      this.output = loaded.outputHistory;
      // Another timeline: its undo history, question and pronouns don't apply.
      conversation = newConversation();
      if (scriptFrom !== null) scriptFrom = Math.min(scriptFrom, this.output.length);
      this.appendSystem('[Session restored from local terminal memory]');
      this.appendLines(describeCurrentRoom(world, this.game));
    },

    /**
     * One command. The regex parser handles canonical commands with zero
     * latency. When it can't parse the input, or parses it into something
     * the engine can't act on ("insert disk", "dance"), the LLM gets a chance
     * to read the intent. Misses never mutate state, so trying the regex
     * reading first is safe.
     */
    async runCommand(input: string): Promise<void> {
      const step = interpret(input, conversation, world, this.game);
      if ('reply' in step) {
        this.appendLines(step.reply);
        return;
      }
      // An answer to a question (or AGAIN) runs as is: never via the intent server.
      if ('run' in step) {
        this.applyResult(this.execute(step.run));
        return;
      }
      if (step.note) this.appendLines(step.note);
      const parsed = fallbackParse(step.parse, world.verbs);
      if (parsed) {
        const result = this.execute(resolvePronouns(parsed, conversation));
        if (result.understood !== false) {
          this.applyResult(result, step.parse);
          return;
        }
        const retry = await this.reinterpret(step.parse, parsed);
        this.applyResult(retry ?? result, step.parse);
        return;
      }

      const retry = await this.reinterpret(step.parse, null);
      this.applyResult(retry ?? this.execute({ action: 'unknown' }), step.parse);
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
          !isLit(world, this.game),
          npcsSeen(world, this.game, this.game.currentRoom),
        );
        // The intent server names things by ID, so they resolve by ID first.
        const action = { ...(await parseIntentRemote(input, ctx)), byId: true };
        if (action.action === 'unknown') return null;
        // “Take that back”, “save this as cellar”: the store's own commands.
        if (['undo', 'load', 'restart'].includes(action.action)) {
          this.storeCommand(action.action);
          return { lines: [], mutated: false };
        }
        if (action.action === 'save' || action.action === 'restore') {
          if (action.action === 'save') this.saveAs(action.target);
          else this.restoreFrom(action.target);
          return { lines: [], mutated: false };
        }
        if (action.action === 'again') {
          const step = interpret('again', conversation, world, this.game);
          return 'run' in step ? this.execute(step.run) : { lines: 'reply' in step ? step.reply : [], mutated: false };
        }
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
      // The line's snapshot is kept for UNDO if any piece changes something.
      if (result.mutated) line.changed = true;
      remember(conversation, action, result);
      return result;
    },

    /** Takes back the last turn that changed something: the game and the screen. */
    undo(): void {
      const snapshot = conversation.history.pop();
      if (!snapshot) {
        this.appendSystem('[Nothing to undo.]');
        return;
      }
      this.game = snapshot.state;
      this.gameOverTracked = snapshot.state.gameOver;
      this.output = this.output.slice(0, snapshot.outputLength);
      conversation.pending = null;
      if (scriptFrom !== null) scriptFrom = Math.min(scriptFrom, this.output.length);
      this.appendSystem(world.style === 'infocom' ? 'Undone.' : '[Previous turn undone.]');
      this.persist();
    },

    applyResult(result: EngineResult, input?: string): void {
      // OOPS can fix the last line nobody understood.
      if (input !== undefined) conversation.lastUnknown = result.understood === false ? input : null;
      this.appendLines(result.lines);
      if (result.script) this.transcript(result.script);
      if (result.version) this.appendLines([`[${appName} v${__APP_VERSION__}]`, world.title ?? '', ...(world.credits ?? [])]);
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
      conversation = newConversation();
      if (scriptFrom !== null) scriptFrom = 0;
      persistence.clear();
      this.game = freshGame();
      this.gameOverTracked = false;
      this.output = [];
      this.appendLines(openingLines(world, this.game));
      this.persist();
    },
  },
});
