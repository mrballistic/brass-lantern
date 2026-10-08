import type { GameState, ParsedAction } from '../types/game.ts';
import type { World } from '../types/world.ts';
import { interpret, newConversation, remember, resolvePronouns, type Conversation } from './conversation.ts';
import { captureLine, execute, initialState, openingLines } from './engine.ts';
import { TOO_LONG_REPLY, cleanInput, fallbackParse, splitCommands } from './parser.ts';
import type { EngineResult } from './result.ts';
import { ENGINE_VERSION } from '../version.ts';

/** What one line of input produced. `awaiting` is true while the game waits for an answer to a question (its text is the last of `lines`). */
export interface EngineReply {
  lines: string[];
  gameOver: boolean;
  awaiting: boolean;
}

/** What one command did: its lines, whether a capture took it, whether it changed the game, and what a UI should add (a transcript, the version). */
export interface TurnResult {
  lines: string[];
  captured: boolean;
  mutated: boolean;
  /** SCRIPT or UNSCRIPT: the UI starts or stops a transcript. */
  script?: 'start' | 'stop';
  /** VERSION: the UI adds its version lines. */
  version?: boolean;
}

/**
 * One command through the engine, minus the LLM: captures, questions, AGAIN, OOPS and pronouns.
 * The headless counterpart of the game store's per-command step.
 */
export function runTurn(world: World, state: GameState, conv: Conversation, c: string): TurnResult {
  const run = (action: ParsedAction): EngineResult => {
    const result = execute(action, { world, state });
    if (result.stopLine) conv.stopLine = result.stopLine;
    remember(conv, action, result);
    return result;
  };
  const turn = (result: EngineResult, lines = result.lines): TurnResult => ({
    lines,
    captured: false,
    mutated: Boolean(result.mutated),
    ...(result.script ? { script: result.script } : {}),
    ...(result.version ? { version: true } : {}),
  });
  if (!conv.pending) {
    const captured = captureLine(world, state, c);
    if (captured) return { lines: captured.lines, captured: true, mutated: Boolean(captured.mutated) };
  }
  const step = interpret(c, conv, world, state);
  if ('reply' in step) return { lines: step.reply, captured: false, mutated: false };
  if ('run' in step) return turn(run(step.run));
  const parsed = fallbackParse(step.parse, world.verbs);
  const result = run(parsed ? resolvePronouns(parsed, conv) : { action: 'unknown' });
  conv.lastUnknown = result.understood === false ? step.parse : null;
  return turn(result, [...(step.note ?? []), ...result.lines]);
}

/** How many turns UNDO can take back, as in the game store. */
const UNDO_LIMIT = 50;

/** A game made by `createGame`. `state` is the game now: RESTART and UNDO replace it. */
export interface Game {
  readonly state: GameState;
  /** The lines the game opened with. */
  readonly opening: string[];
  send(line: string): EngineReply;
}

/**
 * A game with no browser and no LLM: feed it lines, read the replies.
 *
 * It handles RESTART (a fresh game from the same seed) and UNDO (one turn at a
 * time, as the game store does) itself. SAVE, RESTORE, LOAD, SCRIPT and
 * UNSCRIPT say they aren't available here and change nothing; a host that
 * wants them handles those words before calling `send`.
 */
export function createGame(world: World, options: { seed?: number } = {}): Game {
  const fresh = (): GameState => {
    const s = initialState(world);
    if (options.seed !== undefined) s.rng = options.seed;
    return s;
  };
  let state = fresh();
  const opening = [...openingLines(world, state)];
  let conv = newConversation();

  /** This line's UNDO snapshot, kept if any piece of the line changes the game. */
  const snapshotLine = () => ({ snapshot: { state: structuredClone(state), outputLength: 0 }, changed: false });
  let line = snapshotLine();
  const beginLine = () => {
    line = snapshotLine();
  };
  const endLine = () => {
    if (!line.changed) return;
    conv.history.push(line.snapshot);
    if (conv.history.length > UNDO_LIMIT) conv.history.shift();
    line.changed = false;
  };

  /** The words a UI handles itself. Returns their reply, or null for anything else. */
  function hostCommand(command: string): string[] | null {
    const lower = command.trim().toLowerCase();
    // Like the Vue store, RESTART and UNDO save the line so far first: UNDO then undoes it, RESTART discards it.
    if (lower === 'restart') {
      endLine();
      state = fresh();
      conv = newConversation();
      return [...openingLines(world, state)];
    }
    if (lower === 'undo') {
      endLine();
      const snapshot = conv.history.pop();
      if (!snapshot) return ['[Nothing to undo.]'];
      state = snapshot.state;
      conv.pending = null;
      return [world.style === 'infocom' ? 'Undone.' : '[Previous turn undone.]'];
    }
    if (/^save(?:\s+.+)?$/.test(lower)) return ['[Saving isn’t available here.]'];
    if (/^restore(?:\s+.+)?$/.test(lower) || lower === 'load') return ['[Restoring isn’t available here.]'];
    return null;
  }

  function versionLines(): string[] {
    return [`[Brass Lantern ${ENGINE_VERSION}]`, world.title ?? '', ...(world.credits ?? [])].filter((l) => l.length > 0);
  }

  function send(input: string): EngineReply {
    // A line over the cap is answered before anything runs (no UNDO step, no turn).
    if (cleanInput(input) === null) return { lines: [TOO_LONG_REPLY], gameOver: state.gameOver, awaiting: Boolean(conv.pending) };
    const pieces = splitCommands(input, world.verbs);
    const lines: string[] = [];
    beginLine();
    for (const [i, command] of pieces.entries()) {
      // RESTART, UNDO and the rest work even after the game has ended.
      const hosted = hostCommand(command);
      if (hosted) {
        // They answer no question, and UNDO acts on the line so far.
        conv.pending = null;
        endLine();
        lines.push(...hosted);
        beginLine();
        continue;
      }
      // Once the game is over, one command hears that it has ended; the rest of the line is dropped.
      if (state.gameOver && i > 0) break;
      conv.stopLine = undefined;
      let turn: TurnResult;
      try {
        turn = runTurn(world, state, conv, command);
      } catch (error) {
        // The engine rolled the turn back; say so, and drop the rest of the line.
        console.error('Command failed:', error);
        conv.pending = null;
        conv.stopLine = undefined;
        lines.push('[Something went wrong with that command. Nothing changed.]');
        break;
      }
      if (turn.mutated) line.changed = true;
      lines.push(...turn.lines);
      if (turn.script) lines.push('[Transcripts aren’t available here.]');
      if (turn.version) lines.push(...versionLines());
      if (turn.captured) break;
      // The turn dropped the rest of the line (Zork's P-CONT): its message only if something was left.
      const stop = conv.stopLine;
      conv.stopLine = undefined;
      if (stop) {
        if (typeof stop === 'string' && i < pieces.length - 1) lines.push(stop);
        break;
      }
      // A question stops the line: the next one answers it.
      if (conv.pending) break;
    }
    endLine();
    return { lines, gameOver: state.gameOver, awaiting: Boolean(conv.pending) };
  }

  return {
    get state() {
      return state;
    },
    opening,
    send,
  };
}
