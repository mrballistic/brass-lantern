import type { GameState, Place } from '@/types/game';
import type { Effect, EventStep, World } from '@/types/world';
import { isCarried, moveItem, npcStateOf, PLAYER } from './model';
import { nextRandom } from './rng';
import { scriptSteps } from './scripts';

// Running event steps: printed lines (bracket lines also act) and typed effects.

type Hook = (arg: string, world: World, state: GameState) => string[];

/**
 * Effects that need other engine modules (moving the player, death, endings)
 * are wired in by engine.ts, so this module doesn't import them in a cycle.
 */
const hooks: { go?: Hook; die?: Hook; end?: Hook } = {};

export function setEffectHooks(h: typeof hooks): void {
  Object.assign(hooks, h);
}

// A death or an ending stops everything after it for the rest of the turn:
// later steps, a rule's `say`, more arrival events, daemons. Tracked per game
// state so separate games (and tests) don't interfere.
const halted = new WeakSet<GameState>();
// Fuses (re)scheduled this turn don't count down until the next one.
const scheduled = new WeakMap<GameState, Set<string>>();

/** Called at the start of each command. */
export function beginTurn(state: GameState): void {
  halted.delete(state);
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

/** Has a death or an ending stopped this turn? */
export function turnHalted(state: GameState): boolean {
  return halted.has(state);
}

export function itemIdForName(label: string, world: World): string | null {
  const normalized = label.trim().toLowerCase();
  for (const [id, item] of Object.entries(world.items)) {
    if (item.name.toLowerCase() === normalized) return id;
  }
  return null;
}

const EFFECT_LINE = /^\[(?:Flag set:\s*.+?|Added to inventory:\s*.+?|.+? consumed)\]$/i;

/** A bracket line that changes the game (`[Flag set: …]` and friends). */
export function isEffectLine(line: string): boolean {
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

/** Runs one effect. Returns the lines it prints, and whether to stop the list (death, an ending). */
function runEffect(e: Effect, world: World, state: GameState): { lines: string[]; stop?: boolean } {
  if ('say' in e) return { lines: [e.say] };
  if ('set' in e) return void (state.flags[e.set] = true), { lines: [] };
  if ('clear' in e) return void (state.flags[e.clear] = false), { lines: [] };
  // Naming a thing the world doesn't have does nothing (the audit reports it).
  const thing = 'move' in e ? e.move : 'open' in e ? e.open : 'close' in e ? e.close : 'lock' in e ? e.lock : 'unlock' in e ? e.unlock : 'switch' in e ? e.switch : null;
  if (thing !== null && !world.items[thing]) return { lines: [] };
  if ('move' in e) return void moveItem(state, e.move, (e.to === 'here' ? state.currentRoom : e.to) as Place), { lines: [] };
  if ('moveNpc' in e) {
    if (world.npcs[e.moveNpc]) npcStateOf(state, e.moveNpc).room = e.to;
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
  if ('setVar' in e) return void ((state.vars ??= {})[e.setVar] = e.to), { lines: [] };
  if ('score' in e) return void addVar(state, 'score', e.score), { lines: [] };
  if ('schedule' in e) return void (world.events[e.schedule] && schedule(state, e.schedule, e.in)), { lines: [] };
  if ('cancel' in e) {
    if (state.fuses) delete state.fuses[e.cancel];
    return { lines: [] };
  }
  if ('chance' in e) {
    const hit = nextRandom(state) * 100 < e.chance;
    return { lines: runSteps((hit ? e.then : e.else) ?? [], world, state), stop: state.gameOver };
  }
  if ('hide' in e) return void (world.items[e.hide] && (itemState(state, e.hide).hidden = true)), { lines: [] };
  if ('reveal' in e) return void (world.items[e.reveal] && (itemState(state, e.reveal).hidden = false)), { lines: [] };
  if ('script' in e) return { lines: runSteps(scriptSteps(e.script, e.arg, world, state), world, state), stop: state.gameOver || halted.has(state) };
  if ('run' in e) return { lines: world.events[e.run] ? runEventKey(e.run, world, state) : [], stop: state.gameOver };
  if ('go' in e) return { lines: hooks.go ? hooks.go(e.go, world, state) : [] };
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
      if (!(effect && world.style === 'infocom')) out.push(step);
      continue;
    }
    const { lines, stop } = runEffect(step, world, state);
    out.push(...lines);
    if (stop) break;
  }
  return out;
}

/** Runs a named event and records that it fired. */
export function runEventKey(key: string, world: World, state: GameState): string[] {
  if (!state.firedEvents.includes(key)) state.firedEvents.push(key);
  return runSteps(world.events[key] ?? [], world, state);
}
