import type { GameState, ParsedAction } from '@/types/game';
import type { EventStep, World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { describeRoom } from './describe';
import { AskSignal, initialLocations, inventoryOf, isLit, matchItem, matchNpc, needObject, pickItem, restoreState, setResolveById, snapshotState, takeActed, visibleItems } from './model';
import { whatQuestion, whichQuestion } from './ask';
import { darknessFalls, tooDark } from './light';
import { beginTick, beginTurn, darkLineSaid, lineStop, runConditional, runSteps, setEffectHooks, turnFree, turnHalted } from './effects';
import { seedFor } from './rng';
import { afterTurn, fuseFired } from './time';
import { die } from './death';
import { runEnding } from './endings';
import { miss, ok, type EngineResult } from './result';
import { enterRoom, handleClimb, handleEnter, handleGo, handleIdle, vehicleRefusal } from './verbs/movement';
import {
  ALL, handleDrop, handleExamine, handleInventory, handleLook, handleRead, handleSmash, handleSwitch, handleTake, handleUse, handleWear, notHeld,
} from './verbs/objects';
import { withRules } from './rules';
import { handleWorldVerb } from './verbs/world-verbs';
import { handleAll } from './verbs/all';
import { handleClose, handleLock, handleOpen, handlePut, handleSearch, handleTakeFrom, handleUnlock } from './verbs/containers';
import { handleGive, handleTalk } from './verbs/people';
import { handleAttack, handleThrow } from './verbs/attack';
import { handleBurn, handleNoEffect } from './verbs/burn';
import { handleBoard, handleDisembark } from './verbs/vehicle';
import { handleAsk, handleOrder } from './verbs/talk';
import { scriptSteps, setCommand } from './scripts';
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
  // A scripted move meets GOTO's vehicle checks too (Zork's PRAY in the boat).
  go: (room, world, state, opts) => {
    const refused = vehicleRefusal(room, world, state);
    return refused ? [refused] : enterRoom(room, world, state, opts);
  },
  enter: (room, world, state) => enterRoom(room, world, state),
  die: (cause, world, state) => die(cause, world, state, enterRoom),
  end: (id, world, state) => runEnding(id, world, state),
  look: (world, state) => handleLook(world, state).lines,
});

/** The player's room's end routines (Zork's M-END): after the action, before the clock. */
function roomEnd(world: World, state: GameState): string[] {
  // Aboard, the vehicle's end routine runs instead of the room's (Zork's M-END goes to the vehicle).
  const owner = state.aboard ? world.items[state.aboard] : world.rooms[state.currentRoom];
  return runConditional(owner?.onEnd ?? [], world, state);
}

// The steps a capture returned, waiting for execute() to run them as a turn.
const pendingCapture = new WeakMap<GameState, EventStep[]>();

/**
 * A room's or the world's capture taking a piece of input (Zork's Loud Room,
 * a spirit's limits): a raw line before it's parsed, or a parsed command. The
 * room's goes first. Returns the steps of the capture that takes it, or null
 * when none does; a capture that declines changes nothing.
 */
function firstCapture(world: World, state: GameState, line: string | undefined, action?: ParsedAction): EventStep[] | null {
  for (const capture of [world.rooms[state.currentRoom]?.capture, world.capture]) {
    if (!capture || (capture.if && !evaluateCondition(capture.if, state, world))) continue;
    const rng = state.rng;
    const steps = scriptSteps(capture.script, undefined, world, state, line, action);
    if (steps.length > 0) return steps;
    state.rng = rng;
  }
  return null;
}

/** Runs a capture's steps as a turn of their own. */
function runCapture(steps: EventStep[], target: string | undefined, deps: EngineDeps): EngineResult {
  pendingCapture.set(deps.state, steps);
  return execute({ action: 'capture', target }, deps);
}

export function captureLine(world: World, state: GameState, line: string): EngineResult | null {
  return guarded(state, () => {
    if (state.gameOver) return null;
    const steps = firstCapture(world, state, line);
    return steps ? runCapture(steps, line, { world, state }) : null;
  });
}

/** What a turn can change, as one string: equal before and after means nothing changed. */
function stateKey(state: GameState): string {
  return JSON.stringify([state.vars, state.fuses, state.flags, state.locations, state.itemState, state.currentRoom, state.player, state.npcs, state.rng, state.aboard ?? null, state.visited, state.gameOver ?? false, state.firedEvents, state.placed ?? null, state.verbosity ?? null]);
}

/** States inside a turn, so only the outermost call takes a snapshot. */
const inTurn = new WeakSet<GameState>();

/**
 * Runs a turn so that a script that throws leaves the state as it found it (the seed too):
 * the error still surfaces, but never a half-applied turn.
 */
function guarded<T>(state: GameState, turn: () => T): T {
  if (inTurn.has(state)) return turn();
  const before = snapshotState(state);
  inTurn.add(state);
  try {
    return turn();
  } catch (e) {
    restoreState(state, before);
    pendingCapture.delete(state);
    throw e;
  } finally {
    inTurn.delete(state);
  }
}

export function execute(action: ParsedAction, deps: EngineDeps): EngineResult {
  const result = guarded(deps.state, () => executeTurn(action, deps));
  // The rest of the line is dropped by a step, or (Infocom style) by a refused move.
  const stop = lineStop(deps.state) ?? (result.fatal && deps.world.style === 'infocom' ? true : undefined);
  return stop && result.understood !== false ? { ...result, stopLine: stop } : result;
}

function executeTurn(action: ParsedAction, deps: EngineDeps): EngineResult {
  const { world, state } = deps;

  if (state.gameOver && action.action !== 'restart' && action.action !== 'help') {
    return ok(['The game has ended. Type RESTART to play again.']);
  }
  // Aboard, bare EXIT is getting out (V-EXIT), not walking out; captures see it as that.
  if (action.action === 'go' && action.exit && state.aboard) return execute({ action: 'disembark', target: state.aboard, byId: true }, deps);
  // A capture sees parsed commands too (`ctx.action`), however they arrived: a spirit can't take things by AGAIN.
  if (action.action !== 'capture') {
    const steps = firstCapture(world, state, undefined, action);
    if (steps) return runCapture(steps, action.target, deps);
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
  if (turnFree(state) && result.understood !== false) result = { ...result, free: true };
  // You can't find things in the dark: an understood refusal, so the LLM isn't asked to re-guess.
  // Not an order: “ok, light the lamp” parses as one, and the LLM must still get to read it.
  if (result.understood === false && action.target && action.action !== 'go' && action.action !== 'order' && !isLit(world, state)) {
    // Like a parser failure in Zork: no time passes.
    result = { ...ok([tooDark(world)]), free: true };
  }
  if (result.understood === false || state.gameOver || result.free) return result;
  // No clock, but M-END still runs (Zork's main loop: the end routine for every verb, CLOCKER not for these).
  if (result.clockless) {
    const before = stateKey(state);
    const end = turnHalted(state) ? [] : roomEnd(world, state);
    return end.length === 0 && before === stateKey(state) ? result : { ...result, lines: [...result.lines, ...end], mutated: true };
  }

  // Misses don't count as turns: they must not mutate state (see EngineResult).
  state.turns = (state.turns ?? 0) + 1;
  state.moveCount += 1;
  const before = stateKey(state);
  // Zork's WAIT runs the clock inside the action, up to `wait.turns` times; the room's
  // end routine (M-END) then follows it. Anything else: end routine, then one tick.
  const waiting = action.action === 'wait' && Boolean(world.wait);
  const later: string[] = [];
  // A mark left by a turn that threw doesn't count for this one.
  fuseFired(state);
  // A refused move skips the room's end routine in Infocom style (V-WALK's RFATAL).
  if (!waiting && !turnHalted(state) && !(result.fatal && world.style === 'infocom')) later.push(...roomEnd(world, state));
  // A death this turn ends it: no timers or daemons after the resurrection.
  for (let tick = 0; tick < (waiting ? world.wait!.turns : 1) && !turnHalted(state) && !state.gameOver; tick++) {
    if (tick > 0) {
      state.turns = (state.turns ?? 0) + 1;
      state.moveCount += 1;
      beginTick(state);
    }
    const fuses = Object.keys(state.fuses ?? {});
    const out = afterTurn(world, state, tick === 0 ? pendingFuses : new Set(fuses));
    later.push(...out);
    // A tick that did something (Zork: an interrupt returned true) ends the wait; a cancelled timer doesn't.
    if (fuseFired(state) || out.length > 0) break;
  }
  if (waiting && !turnHalted(state) && !state.gameOver) later.push(...roomEnd(world, state));
  // Light arriving or leaving while the player stays put.
  if (state.currentRoom === roomBefore && !state.gameOver) {
    const litNow = isLit(world, state);
    if (litNow && !litBefore) {
      if (!state.visited.includes(state.currentRoom)) state.visited.push(state.currentRoom);
      later.push(...describeRoom(state.currentRoom, world, state));
    }
    if (!litNow && litBefore && !darkLineSaid(state)) later.push(darknessFalls(world));
  }
  const changed = before !== stateKey(state);
  if (later.length === 0 && !changed) return result;
  return { ...result, lines: [...result.lines, ...later], mutated: true };
}

function dispatch(action: ParsedAction, world: World, state: GameState): EngineResult {
  switch (action.action) {
    case 'go':
      return withRules('go', action, world, state, () => handleGo(action.target, world, state));
    case 'read':
      return withRules('read', action, world, state, () => handleRead(action.target, world, state));
    // PUSH X north, PUSH X TO Y (Zork's V-PUSH-TO); plain PUSH X is USE.
    case 'push':
      if (!action.target) needObject();
      if (!pickItem(action.target, visibleItems(world, state), world, 'target', state) && !matchNpc(action.target, world, state)) return miss(`You don’t see a “${action.target}” here.`);
      return withRules('push', action, world, state, () => ok(['You can’t push things to that.']));
    case 'turn_on':
      return withRules('turn_on', action, world, state, () => handleSwitch(action.target, true, world, state));
    case 'board':
      return withRules('board', action, world, state, () => handleBoard(action, world, state));
    case 'disembark':
      return withRules('disembark', action, world, state, () => handleDisembark(action, world, state));
    case 'burn':
      return withRules('burn', action, world, state, () => handleBurn(action, world, state));
    // Zork's V-TURN and V-PLUG: a rule on the thing does the work.
    case 'turn':
      return withRules('turn', action, world, state, () => handleNoEffect(action, world, state));
    case 'plug':
      return withRules('plug', action, world, state, () => handleNoEffect(action, world, state));
    case 'turn_off':
      return withRules('turn_off', action, world, state, () => handleSwitch(action.target, false, world, state));
    case 'enter':
      return withRules('enter', action, world, state, () => handleEnter(action.target, world, state));
    case 'climb':
      return withRules('climb', action, world, state, () => handleClimb(action.target, world, state, action.direction === 'up' || action.direction === 'down' ? action.direction : undefined));
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
        // Zork's PRE-TAKE comes before anything else: what you hold, you already have.
        if (world.style === 'infocom' && pickItem(target, inventoryOf(world, state), world, 'target', state)) return { ...ok(['You already have that!']), free: true };
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
      {
        // Zork's parser checks HAVE before the verb or any rule: a thing in sight but not held.
        const refused = notHeld(action.target, world, state);
        if (refused) return refused;
      }
      return withRules('put', action, world, state, () => handlePut(action.target, action.indirect, world, state, action.prep));
    case 'search':
      return withRules('search', action, world, state, () => handleSearch(action.target, world, state));
    case 'wear':
      return withRules('wear', action, world, state, () => handleWear(action.target, world, state));
    case 'talk':
      return withRules('talk', action, world, state, () => handleTalk(action.target, world, state));
    case 'give':
      return withRules('give', action, world, state, () => handleGive(action.target, action.indirect, world, state));
    case 'inventory':
      return handleInventory(world, state);
    case 'smash':
      return withRules('smash', action, world, state, () => handleSmash(action.target, world, state));
    case 'attack':
      return handleAttack(action, world, state, () => dispatch({ ...action, action: 'smash' }, world, state));
    case 'throw':
      // Zork's THROW X IN Y is PUT X IN Y.
      if (action.prep === 'in' && world.style === 'infocom') return dispatch({ ...action, action: 'put' }, world, state);
      // Elsewhere THROW X IN Y with no rule is a miss, so the intent server can read it (as PUT, likely).
      if (action.prep === 'in') return withRules('throw', action, world, state, () => miss(`You can’t throw that in there.`));
      // Zork's V-THROW-OFF: nothing here to throw things off of, unless a rule says so.
      if (action.prep === 'off' || action.prep === 'over') {
        if (!action.target) needObject();
        if (!pickItem(action.target, inventoryOf(world, state), world, 'target', state)) return miss(`You aren’t carrying a “${action.target}”.`);
        return withRules('throw', action, world, state, () => ok(['You can’t throw anything off of that!']));
      }
      return handleThrow(action, world, state);
    case 'ask':
      return handleAsk(action, world, state);
    case 'order':
      return handleOrder(action, world, state);
    // Internal: only captureLine dispatches it (not in the parser, HELP or the intent server).
    case 'capture': {
      const steps = pendingCapture.get(state) ?? [];
      pendingCapture.delete(state);
      // A pure echo changes nothing, so it's no UNDO step or save.
      const before = stateKey(state);
      const lines = runSteps(steps, world, state);
      return ok(lines, stateKey(state) !== before);
    }
    case 'diagnose':
      return ok(diagnoseLines(world, state));
    case 'hint':
      return handleHint(world, state);
    case 'score': {
      // Zork's main loop runs no clock for SCORE: no move, no timers (the room's end routine still runs).
      const scored = handleScore(world, state);
      return world.style === 'infocom' ? { ...scored, clockless: true } : scored;
    }
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
  const reply = ok([VERBOSITY_REPLY[world.style === 'infocom' ? 'infocom' : 'brass'][mode]], true);
  // Infocom: no clock, but the room's end routine runs (Zork's main loop). Brass: no time at all.
  return world.style === 'infocom' ? { ...reply, clockless: true } : { ...reply, free: true };
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
