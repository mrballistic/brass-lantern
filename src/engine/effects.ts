import type { GameState, Place } from '@/types/game';
import type { Effect, EventStep, VehicleLine, World } from '@/types/world';
import { evaluateCondition } from './conditions';
import { isCarried, moveItem, nextPlacing, npcStateOf, PLAYER } from './model';
import { nextRandom } from './rng';
import { commandOf, scriptSteps } from './scripts';
import { expandTemplate } from './text';

// Running event steps: printed lines (bracket lines also act) and typed effects.

type Hook = (arg: string, world: World, state: GameState, opts?: { quiet?: boolean }) => string[];

/**
 * Effects that need other engine modules (moving the player, death, endings)
 * are wired in by engine.ts, so this module doesn't import them in a cycle.
 */
const hooks: { go?: Hook; die?: Hook; end?: Hook; look?: (world: World, state: GameState) => string[]; enter?: Hook } = {};

export function setEffectHooks(h: typeof hooks): void {
  Object.assign(hooks, h);
}

// A death or an ending stops everything after it for the rest of the turn:
// later steps, a rule's `say`, more arrival events, daemons. Tracked per game
// state so separate games (and tests) don't interfere.
const halted = new WeakSet<GameState>();
// Turns a `free` step made timeless, and turns whose darkness a step already reported.
const freeTurns = new WeakSet<GameState>();
const darkSaid = new WeakSet<GameState>();
// Fuses (re)scheduled this turn don't count down until the next one.
const scheduled = new WeakMap<GameState, Set<string>>();

const lineStops = new WeakMap<GameState, true | string>();

/** Drops the rest of the command line after this turn (Zork's P-CONT <>). */
export function stopLine(state: GameState, message: true | string = true): void {
  if (!lineStops.has(state)) lineStops.set(state, message);
}

/** Did this turn drop the rest of the line, and with what message? */
export function lineStop(state: GameState): true | string | undefined {
  return lineStops.get(state);
}

/** Called at the start of each command. */
export function beginTurn(state: GameState): void {
  halted.delete(state);
  lineStops.delete(state);
  scheduled.delete(state);
  freeTurns.delete(state);
  darkSaid.delete(state);
}

/** A new tick of a WAIT: fuses scheduled on the last one count down from now on. */
export function beginTick(state: GameState): void {
  scheduled.delete(state);
}

/** Was this fuse set (or reset) during the current turn? */
export function scheduledThisTurn(state: GameState, key: string): boolean {
  return scheduled.get(state)?.has(key) ?? false;
}

function schedule(state: GameState, key: string, turns: number): void {
  (state.fuses ??= {})[key] = turns;
  const keys = scheduled.get(state) ?? new Set<string>();
  keys.add(key);
  scheduled.set(state, keys);
}

/** Did a `free` step make this turn take no time? */
export function turnFree(state: GameState): boolean {
  return freeTurns.has(state);
}

/** Did a step already say the light went out this turn? */
export function darkLineSaid(state: GameState): boolean {
  return darkSaid.has(state);
}

/** Has a death or an ending stopped this turn? */
export function turnHalted(state: GameState): boolean {
  return halted.has(state);
}

function itemIdForName(label: string, world: World): string | null {
  const normalized = label.trim().toLowerCase();
  for (const [id, item] of Object.entries(world.items)) {
    if (item.name.toLowerCase() === normalized) return id;
  }
  return null;
}

const EFFECT_LINE = /^\[(?:Flag set:\s*.+?|Added to inventory:\s*.+?|.+? consumed)\]$/i;

/** A bracket line that changes the game (`[Flag set: …]` and friends). */
function isEffectLine(line: string): boolean {
  return EFFECT_LINE.test(line);
}

function applyBracketLine(line: string, world: World, state: GameState): void {
  const flagSet = line.match(/^\[Flag set:\s*(.+?)\]$/i);
  if (flagSet) {
    const flagId = world.flagLabels[flagSet[1].toLowerCase().trim()];
    if (flagId) state.flags[flagId] = true;
    return;
  }
  const added = line.match(/^\[Added to inventory:\s*(.+?)\]$/i);
  if (added) {
    const itemId = itemIdForName(added[1], world);
    if (itemId) moveItem(state, itemId, PLAYER);
    return;
  }
  const consumed = line.match(/^\[(.+?) consumed\]$/i);
  if (consumed) {
    const itemId = itemIdForName(consumed[1], world);
    if (itemId && isCarried(state, itemId)) moveItem(state, itemId, null);
  }
}

function itemState(state: GameState, id: string) {
  return (state.itemState[id] ??= {});
}

function addVar(state: GameState, name: string, by: number): void {
  const vars = (state.vars ??= {});
  vars[name] = (vars[name] ?? 0) + by;
}

/** Effects that act on one item, by the key that names it. */
const ITEM_EFFECTS = ['move', 'open', 'close', 'lock', 'unlock', 'switch', 'hide', 'reveal', 'touch', 'unlist', 'relist'] as const;

/** The item an effect acts on, or null if it doesn't act on one. */
function itemOf(e: Effect): string | null {
  const key = ITEM_EFFECTS.find((k) => k in e);
  return key ? (e as Record<(typeof ITEM_EFFECTS)[number], string>)[key] : null;
}

/** Runs one effect. Returns the lines it prints, and whether to stop the list (death, an ending). */
function runEffect(e: Effect, world: World, state: GameState): { lines: string[]; stop?: boolean } {
  if ('say' in e) return { lines: [expandTemplate(e.say, world, state)] };
  if ('set' in e) return void (state.flags[e.set] = true), { lines: [] };
  if ('clear' in e) return void (state.flags[e.clear] = false), { lines: [] };
  if ('follow' in e) return void (state.flags[`following_${e.follow}`] = true), { lines: [] };
  if ('unfollow' in e) return void (state.flags[`following_${e.unfollow}`] = false), { lines: [] };
  // Naming a thing the world doesn't have does nothing (the audit reports it).
  const thing = itemOf(e);
  if (thing !== null && !world.items[thing]) return { lines: [] };
  if ('move' in e) return void moveItem(state, e.move, (e.to === 'here' ? state.currentRoom : e.to) as Place), { lines: [] };
  if ('moveNpc' in e) {
    // Stamped on the same sequence as things' placings (`placed`): newest first, as Zork's MOVE.
    if (world.npcs[e.moveNpc]) Object.assign(npcStateOf(state, e.moveNpc), { room: e.to, seq: nextPlacing(state) });
    return { lines: [] };
  }
  if ('npcState' in e) {
    const { npcState: id, ...fields } = e;
    if (world.npcs[id]) Object.assign(npcStateOf(state, id), fields);
    return { lines: [] };
  }
  if ('open' in e) return void (itemState(state, e.open).open = true), { lines: [] };
  if ('close' in e) return void (itemState(state, e.close).open = false), { lines: [] };
  if ('lock' in e) return void (itemState(state, e.lock).locked = true), { lines: [] };
  if ('unlock' in e) return void (itemState(state, e.unlock).locked = false), { lines: [] };
  if ('switch' in e) return void (itemState(state, e.switch).on = e.on), { lines: [] };
  if ('add' in e) return void addVar(state, e.add, e.by), { lines: [] };
  if ('setVar' in e) return void ((state.vars ??= {})[e.setVar] = 'from' in e ? (commandOf(state)?.number ?? 0) : e.to), { lines: [] };
  if ('score' in e) return void addVar(state, 'score', e.score), { lines: [] };
  if ('schedule' in e) return void (world.events[e.schedule] && schedule(state, e.schedule, e.in)), { lines: [] };
  if ('cancel' in e) {
    if (state.fuses) delete state.fuses[e.cancel];
    return { lines: [] };
  }
  if ('if' in e && Array.isArray(e.then)) {
    const branch = evaluateCondition(e.if, state, world) ? e.then : e.else;
    return { lines: runSteps(branch ?? [], world, state), stop: state.gameOver || halted.has(state) };
  }
  if ('unvisit' in e) return void (state.visited = state.visited.filter((r) => r !== e.unvisit)), { lines: [] };
  if ('free' in e) return void freeTurns.add(state), { lines: [] };
  if ('stopLine' in e) return void stopLine(state, e.stopLine), { lines: [] };
  if ('look' in e) return { lines: hooks.look ? hooks.look(world, state) : [] };
  if ('noDarkLine' in e) return void darkSaid.add(state), { lines: [] };
  if ('chance' in e) {
    const hit = nextRandom(state) * 100 < e.chance;
    return { lines: runSteps((hit ? e.then : e.else) ?? [], world, state), stop: state.gameOver };
  }
  if ('hide' in e) return void (itemState(state, e.hide).hidden = true), { lines: [] };
  if ('board' in e) {
    if (world.items[e.board]?.vehicle && state.locations[e.board] === state.currentRoom) state.aboard = e.board;
    return { lines: [] };
  }
  if ('disembark' in e) return void (state.aboard = undefined), { lines: [] };
  if ('moveVehicle' in e) {
    const vehicle = world.items[e.moveVehicle]?.vehicle;
    if (!vehicle || !world.rooms[e.to]) return { lines: [] };
    // Aboard, the player goes too, as on any arrival (but it isn't a player move: nobody follows).
    if (state.aboard === e.moveVehicle) return { lines: hooks.enter ? hooks.enter(e.to, world, state) : [] };
    const here = state.currentRoom;
    const from = state.locations[e.moveVehicle];
    moveItem(state, e.moveVehicle, e.to);
    const lines: string[] = [];
    if (from === here && e.to !== here) lines.push(...vehicleLine(vehicle.leave, world, state));
    if (e.to === here && from !== here) lines.push(...vehicleLine(vehicle.arrive, world, state));
    return { lines };
  }
  // Zork's TOUCHBIT: handled, so its first-seen sentence is over.
  if ('touch' in e) return void (itemState(state, e.touch).moved = true), { lines: [] };
  if ('unlist' in e) return void (itemState(state, e.unlist).unlisted = true), { lines: [] };
  if ('relist' in e) return void (itemState(state, e.relist).unlisted = false), { lines: [] };
  if ('reveal' in e) return void (itemState(state, e.reveal).hidden = false), { lines: [] };
  if ('script' in e) return { lines: runSteps(scriptSteps(e.script, e.arg, world, state), world, state), stop: state.gameOver || halted.has(state) };
  if ('run' in e) return { lines: world.events[e.run] ? runEventKey(e.run, world, state) : [], stop: state.gameOver };
  if ('go' in e) return { lines: hooks.go ? hooks.go(e.go, world, state, { quiet: e.quiet }) : [] };
  if ('die' in e) {
    // The death plays out in full, then halts the rest of the turn.
    const lines = hooks.die ? hooks.die(e.die, world, state) : [e.die];
    if (!hooks.die) state.gameOver = true;
    halted.add(state);
    return { lines, stop: true };
  }
  if ('end' in e) {
    const lines = hooks.end ? hooks.end(e.end, world, state) : [];
    if (!hooks.end) state.gameOver = true;
    halted.add(state);
    return { lines, stop: true };
  }
  return { lines: [] };
}

/** Runs steps in order. Strings print (bracket lines also act; in Infocom style they act unseen). */
export function runSteps(steps: EventStep[], world: World, state: GameState): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if (halted.has(state)) break;
    if (typeof step === 'string') {
      const effect = isEffectLine(step);
      if (effect) applyBracketLine(step, world, state);
      if (!(effect && world.style === 'infocom')) out.push(effect ? step : expandTemplate(step, world, state));
      continue;
    }
    const { lines, stop } = runEffect(step, world, state);
    out.push(...lines);
    if (stop) break;
  }
  return out;
}

/**
 * Runs each entry whose condition holds, in order (its `then` an event's name,
 * or steps), until a death or an ending stops the turn: daemons, end routines.
 */
export function runConditional(entries: Array<{ if: string; then: string | EventStep[] }>, world: World, state: GameState): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (!evaluateCondition(e.if, state, world)) continue;
    out.push(...(typeof e.then === 'string' ? runEventKey(e.then, world, state) : runSteps(e.then, world, state)));
    if (state.gameOver || halted.has(state)) break;
  }
  return out;
}

/** Runs a named event and records that it fired. */
export function runEventKey(key: string, world: World, state: GameState): string[] {
  if (!state.firedEvents.includes(key)) state.firedEvents.push(key);
  return runSteps(world.events[key] ?? [], world, state);
}

/**
 * What a vehicle says as it leaves or arrives: a string as it is (drawing nothing), one line picked from a list
 * with the seeded generator, or a script's `say` lines. A script's other steps don't run: this is a line said
 * mid-move, like a description script's, and the script may draw from the generator as it likes.
 */
export function vehicleLine(line: VehicleLine | undefined, world: World, state: GameState): string[] {
  if (line === undefined) return [];
  if (typeof line === 'string') return [line];
  if (Array.isArray(line)) return line.length > 0 ? [line[Math.floor(nextRandom(state) * line.length)]] : [];
  if (!world.scripts?.[line.script]) return [];
  return scriptSteps(line.script, undefined, world, state).flatMap((step) => (typeof step === 'string' ? [step] : 'say' in step ? [step.say] : []));
}
