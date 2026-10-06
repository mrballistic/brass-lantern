import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { describeRoom } from './describe';
import { AskSignal, initialLocations, isLit, matchItem, setResolveById, takeActed, visibleItems } from './model';
import { whatQuestion, whichQuestion } from './ask';
import { darknessFalls, tooDark } from './light';
import { beginTurn, runSteps, setEffectHooks, turnHalted } from './effects';
import { seedFor } from './rng';
import { afterTurn } from './time';
import { die } from './death';
import { runEnding } from './endings';
import { ok, type EngineResult } from './result';
import { enterRoom, handleClimb, handleEnter, handleGo, handleIdle } from './verbs/movement';
import {
  ALL, handleDrop, handleExamine, handleInventory, handleLook, handleSmash, handleTake, handleUse, handleWear,
} from './verbs/objects';
import { withRules } from './rules';
import { handleWorldVerb } from './verbs/world-verbs';
import { handleAll } from './verbs/all';
import { handleClose, handleLock, handleOpen, handlePut, handleSearch, handleTakeFrom, handleUnlock } from './verbs/containers';
import { handleRead, handleSwitch } from './verbs/objects';
import { handleGive, handleTalk } from './verbs/people';
import { handleAttack, handleThrow } from './verbs/attack';
import { setCommand } from './scripts';
import { diagnoseLines } from './combat';
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

setEffectHooks({
  go: (room, world, state) => enterRoom(room, world, state),
  die: (cause, world, state) => die(cause, world, state, enterRoom),
  end: (id, world, state) => runEnding(id, world, state),
});

export function execute(action: ParsedAction, deps: EngineDeps): EngineResult {
  const { world, state } = deps;

  if (state.gameOver && action.action !== 'restart' && action.action !== 'help') {
    return ok(['The game has ended. Type RESTART to play again.']);
  }

  beginTurn(state);
  setCommand(state, null);
  const pendingFuses = new Set(Object.keys(state.fuses ?? {}));
  const roomBefore = state.currentRoom;
  const litBefore = isLit(world, state);
  let result: EngineResult;
  takeActed(state);
  setResolveById(state, Boolean(action.byId));
  try {
    result = dispatch(action, world, state);
  } catch (e) {
    if (!(e instanceof AskSignal)) throw e;
    result = askResult(e.ask, action, world, state);
  } finally {
    setResolveById(state, false);
  }
  result = { ...result, acted: takeActed(state) };
  // You can't find things in the dark: an understood refusal, so the LLM isn't asked to re-guess.
  if (result.understood === false && action.target && action.action !== 'go' && !isLit(world, state)) {
    // Like a parser failure in Zork: no time passes.
    result = { ...ok([tooDark(world)]), free: true };
  }
  if (result.understood === false || state.gameOver || result.free) return result;

  // Misses don't count as turns: they must not mutate state (see EngineResult).
  state.turns = (state.turns ?? 0) + 1;
  state.moveCount += 1;
  const before = JSON.stringify([state.vars, state.fuses, state.flags, state.locations, state.itemState, state.currentRoom, state.player, state.npcs, state.rng]);
  // A death this turn ends it: no timers or daemons after the resurrection.
  const later = turnHalted(state) ? [] : afterTurn(world, state, pendingFuses);
  // Light arriving or leaving while the player stays put.
  if (state.currentRoom === roomBefore && !state.gameOver) {
    const litNow = isLit(world, state);
    if (litNow && !litBefore) {
      if (!state.visited.includes(state.currentRoom)) state.visited.push(state.currentRoom);
      later.push(...describeRoom(state.currentRoom, world, state));
    }
    if (!litNow && litBefore) later.push(darknessFalls(world));
  }
  const changed = before !== JSON.stringify([state.vars, state.fuses, state.flags, state.locations, state.itemState, state.currentRoom, state.player, state.npcs, state.rng]);
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
    case 'verbose':
    case 'brief':
    case 'superbrief':
      return setVerbosity(action.action, world, state);
    case 'look':
      return handleLook(world, state);
    case 'take':
      // ALL applies the rules item by item.
      if (action.target && ALL.test(action.target)) return handleAll(action, world, state);
      if (action.target && action.indirect) {
        const { target, indirect } = action;
        return withRules('take', action, world, state, () => handleTakeFrom(target, indirect, world, state));
      }
      return withRules('take', action, world, state, () => handleTake(action.target, world, state));
    case 'drop':
      if (action.target && ALL.test(action.target)) return handleAll(action, world, state);
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
      if (action.target && ALL.test(action.target)) return handleAll(action, world, state);
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
    case 'attack':
      return handleAttack(action, world, state, () => dispatch({ ...action, action: 'smash' }, world, state));
    case 'throw':
      return handleThrow(action, world, state);
    case 'diagnose':
      return ok(diagnoseLines(world, state));
    case 'hint':
      return handleHint(world, state);
    case 'score':
      return handleScore(world, state);
    case 'script':
    case 'unscript':
      return { lines: [], mutated: false, free: true, script: action.action === 'script' ? 'start' : 'stop' };
    case 'version':
      return { lines: [], mutated: false, free: true, version: true };
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

const VERBOSITY_REPLY = {
  infocom: { verbose: 'Maximum verbosity.', brief: 'Brief descriptions.', superbrief: 'Superbrief descriptions.' },
  brass: { verbose: '[Full descriptions.]', brief: '[Brief descriptions.]', superbrief: '[Room names only.]' },
} as const;

function setVerbosity(mode: 'verbose' | 'brief' | 'superbrief', world: World, state: GameState): EngineResult {
  state.verbosity = mode;
  return { ...ok([VERBOSITY_REPLY[world.style === 'infocom' ? 'infocom' : 'brass'][mode]], true), free: true };
}

/** A question back to the player: understood, changes nothing, takes no time. */
function askResult(ask: AskSignal['ask'], action: ParsedAction, world: World, state: GameState): EngineResult {
  if (ask.kind === 'which') {
    return { lines: [whichQuestion(world, ask.word, ask.candidates)], mutated: false, free: true, ask: { ...ask, action } };
  }
  const named = action.target ? matchItem(action.target, visibleItems(world, state), world) : null;
  const targetName = named ? world.items[named]?.name : action.target;
  return { lines: [whatQuestion(action, ask.slot, targetName)], mutated: false, free: true, ask: { ...ask, action } };
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
