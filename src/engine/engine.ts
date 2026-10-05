import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { describeRoom } from './describe';
import { ok, type EngineResult } from './result';
import { enterRoom, handleGo, handleIdle } from './verbs/movement';
import {
  handleDrop, handleExamine, handleInstall, handleInventory, handleLook, handleSmash,
  handleSnooze, handleTake, handleUse, handleWear,
} from './verbs/objects';
import { handleGive, handleTalk } from './verbs/people';
import { handleHelp, handleHint, handleScore, handleUnknown, scoreLines } from './verbs/meta';

export type { EngineResult } from './result';
export { visibleItemsIn } from './model';

export interface EngineDeps {
  world: World;
  state: GameState;
}

export function initialState(world: World): GameState {
  return {
    currentRoom: world.startRoom,
    inventory: [],
    flags: {},
    moveCount: 0,
    gameOver: false,
    itemsRemoved: {},
    itemsAdded: {},
    firedEvents: [],
    misses: 0,
    turns: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export function execute(action: ParsedAction, deps: EngineDeps): EngineResult {
  const { world, state } = deps;

  if (state.gameOver && action.action !== 'restart' && action.action !== 'help') {
    return ok(['The game has ended. Type RESTART to play again.']);
  }

  const result = dispatch(action, world, state);
  if (result.understood === false || state.gameOver) return result;

  // Misses don't count as turns: they must not mutate state (see EngineResult).
  state.turns = (state.turns ?? 0) + 1;
  const interruptions = ambientLines(world, state);
  if (interruptions.length === 0) return result;
  return { ...result, lines: [...result.lines, ...interruptions], mutated: true };
}

function ambientLines(world: World, state: GameState): string[] {
  const turns = state.turns ?? 0;
  const out: string[] = [];
  for (const a of world.ambient ?? []) {
    if (a.every <= 0 || a.lines.length === 0) continue;
    if (turns % a.every !== 0 || !evaluateCondition(a.if, state)) continue;
    out.push(a.lines[(turns / a.every - 1) % a.lines.length]);
  }
  return out;
}

function dispatch(action: ParsedAction, world: World, state: GameState): EngineResult {
  switch (action.action) {
    case 'go':
      return handleGo(action.target, world, state);
    case 'look':
      return handleLook(world, state);
    case 'take':
      return handleTake(action.target, world, state);
    case 'drop':
      return handleDrop(action.target, world, state);
    case 'examine':
      return handleExamine(action.target, world, state);
    case 'use':
      return handleUse(action.target, action.indirect, world, state);
    case 'wear':
      return handleWear(action.target, world, state);
    case 'talk':
      return handleTalk(action.target, world, state);
    case 'give':
      return handleGive(action.target, action.indirect, world, state);
    case 'inventory':
      return handleInventory(world, state);
    case 'smash':
      return handleSmash(action.target, world, state);
    case 'snooze':
      return handleSnooze(world, state);
    case 'install':
      return handleInstall(action.target, world, state);
    case 'hint':
      return handleHint(world, state);
    case 'score':
      return handleScore(world, state);
    case 'help':
      return handleHelp();
    case 'sit':
    case 'wait':
      return handleIdle(action.action, world, state);
    case 'quit':
      return ok([world.quit ?? 'There is no quitting. Type RESTART to start over.']);
    case 'restart':
      // RESTART is handled at the store layer (it clears persistence). Engine just signals.
      return ok(['[RESTART]']);
    case 'save':
    case 'load':
      // Handled at the store/persistence layer.
      return ok([`[${action.action.toUpperCase()}]`]);
    default:
      return handleUnknown(world, state);
  }
}

/** Compose the opening: intro lines + first room description. */
export function openingLines(world: World, state: GameState): string[] {
  const lines = [...(world.events.intro ?? [])];
  lines.push(...describeRoom(state.currentRoom, world, state));
  return lines;
}

export function describeCurrentRoom(world: World, state: GameState): string[] {
  return describeRoom(state.currentRoom, world, state);
}

/** Re-export internal helpers for test access. */
export const __test = { enterRoom, scoreLines };
