import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { describeRoom } from './describe';
import { initialLocations } from './model';
import { runSteps, setEffectHooks } from './effects';
import { seedFor } from './rng';
import { afterTurn } from './time';
import { ok, type EngineResult } from './result';
import { enterRoom, handleClimb, handleEnter, handleGo, handleIdle } from './verbs/movement';
import {
  ALL, handleDrop, handleExamine, handleInventory, handleLook, handleSmash, handleTake, handleUse, handleWear,
} from './verbs/objects';
import { withRules } from './rules';
import { handleWorldVerb } from './verbs/world-verbs';
import { handleClose, handleLock, handleOpen, handlePut, handleSearch, handleTakeFrom, handleUnlock } from './verbs/containers';
import { handleRead, handleSwitch } from './verbs/objects';
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
    locations: initialLocations(world),
    itemState: {},
    visited: [world.startRoom],
    flags: {},
    vars: { ...(world.vars ?? {}) },
    rng: seedFor(world),
    moveCount: 0,
    gameOver: false,
    firedEvents: [],
    misses: 0,
    turns: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

setEffectHooks({ go: (room, world, state) => enterRoom(room, world, state) });

export function execute(action: ParsedAction, deps: EngineDeps): EngineResult {
  const { world, state } = deps;

  if (state.gameOver && action.action !== 'restart' && action.action !== 'help') {
    return ok(['The game has ended. Type RESTART to play again.']);
  }

  const pendingFuses = new Set(Object.keys(state.fuses ?? {}));
  const result = dispatch(action, world, state);
  if (result.understood === false || state.gameOver) return result;

  // Misses don't count as turns: they must not mutate state (see EngineResult).
  state.turns = (state.turns ?? 0) + 1;
  const before = JSON.stringify([state.vars, state.fuses, state.flags, state.locations, state.itemState, state.currentRoom]);
  const later = afterTurn(world, state, pendingFuses);
  const changed = before !== JSON.stringify([state.vars, state.fuses, state.flags, state.locations, state.itemState, state.currentRoom]);
  if (later.length === 0 && !changed) return result;
  return { ...result, lines: [...result.lines, ...later], mutated: true };
}


function dispatch(action: ParsedAction, world: World, state: GameState): EngineResult {
  switch (action.action) {
    case 'go':
      return handleGo(action.target, world, state);
    case 'read':
      return withRules('read', action, world, state, () => handleRead(action.target, world, state));
    case 'turn_on':
      return withRules('turn_on', action, world, state, () => handleSwitch(action.target, true, world, state));
    case 'turn_off':
      return withRules('turn_off', action, world, state, () => handleSwitch(action.target, false, world, state));
    case 'enter':
      return withRules('enter', action, world, state, () => handleEnter(action.target, world, state));
    case 'climb':
      return withRules('climb', action, world, state, () => handleClimb(action.target, world, state));
    case 'look':
      return handleLook(world, state);
    case 'take':
      // TAKE ALL applies the rules item by item.
      if (action.target && ALL.test(action.target)) return handleTake(action.target, world, state);
      if (action.target && action.indirect) {
        const { target, indirect } = action;
        return withRules('take', action, world, state, () => handleTakeFrom(target, indirect, world, state));
      }
      return withRules('take', action, world, state, () => handleTake(action.target, world, state));
    case 'drop':
      return withRules('drop', action, world, state, () => handleDrop(action.target, world, state));
    case 'examine':
      return withRules('examine', action, world, state, () => handleExamine(action.target, world, state));
    case 'use':
      return handleUse(action.target, action.indirect, world, state);
    case 'open':
      return withRules('open', action, world, state, () => handleOpen(action.target, world, state));
    case 'close':
      return withRules('close', action, world, state, () => handleClose(action.target, world, state));
    case 'lock':
      return withRules('lock', action, world, state, () => handleLock(action.target, action.indirect, world, state));
    case 'unlock':
      return withRules('unlock', action, world, state, () => handleUnlock(action.target, action.indirect, world, state));
    case 'put':
      return withRules('put', action, world, state, () => handlePut(action.target, action.indirect, world, state));
    case 'search':
      return withRules('search', action, world, state, () => handleSearch(action.target, world, state));
    case 'wear':
      return withRules('wear', action, world, state, () => handleWear(action.target, world, state));
    case 'talk':
      return handleTalk(action.target, world, state);
    case 'give':
      return withRules('give', action, world, state, () => handleGive(action.target, action.indirect, world, state));
    case 'inventory':
      return handleInventory(world, state);
    case 'smash':
      return withRules('smash', action, world, state, () => handleSmash(action.target, world, state));
    case 'hint':
      return handleHint(world, state);
    case 'score':
      return handleScore(world, state);
    case 'help':
      return handleHelp(world);
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
      return handleWorldVerb(action, world, state) ?? handleUnknown(world, state);
  }
}

/** Compose the opening: intro lines + first room description. */
export function openingLines(world: World, state: GameState): string[] {
  const lines = runSteps(world.events.intro ?? [], world, state);
  lines.push(...describeRoom(state.currentRoom, world, state, { first: true }));
  return lines;
}

export function describeCurrentRoom(world: World, state: GameState): string[] {
  return describeRoom(state.currentRoom, world, state);
}

/** Re-export internal helpers for test access. */
export const __test = { enterRoom, scoreLines };
