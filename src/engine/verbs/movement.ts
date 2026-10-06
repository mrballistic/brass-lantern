import type { GameState } from '@/types/game';
import type { Exit, World } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { COMPASS, describeRoom, exitList } from '../describe';
import { fuzzyMatchExit } from '../fuzzy';
import { isLit, isOpen, matchItem, visibleItems } from '../model';
import { runSteps, turnHalted } from '../effects';
import { miss, ok, type EngineResult } from '../result';
import { runEvent } from '../rules';

/** Evaluate onEnter triggers and emit any event-script lines. */
export function runOnEnter(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [];
  const out: string[] = [];
  for (const trigger of room.onEnter) {
    if (turnHalted(state)) break;
    if (!trigger.repeat && state.firedEvents.includes(trigger.then)) continue;
    if (evaluateCondition(trigger.if, state, world)) out.push(...runEvent(trigger.then, world, state));
  }
  return out;
}

const DIRECTION_WORDS = new Set([...COMPASS, 'in', 'out', 'inside', 'outside']);

export const GENERIC_DENIAL = 'Something stops you. The story isn’t ready for you to go there yet.';

export function enterRoom(targetId: string, world: World, state: GameState, opts: { quiet?: boolean } = {}): string[] {
  const target = world.rooms[targetId];
  if (!target) return ['There is nothing in that direction.'];
  if (target.requires && !evaluateCondition(target.requires, state, world)) {
    return [target.denial ?? GENERIC_DENIAL];
  }
  const first = !state.visited.includes(targetId);
  state.currentRoom = targetId;
  // A dark room isn't visited until you've seen it (Zork's TOUCHBIT).
  if (first && isLit(world, state)) state.visited.push(targetId);
  // A quiet move (Zork's GOTO without a description) still runs the room's arrival events.
  if (opts.quiet) return runOnEnter(targetId, world, state);
  const verbosity = state.verbosity ?? (world.style === 'infocom' ? 'brief' : 'verbose');
  const brief = verbosity === 'superbrief' || (verbosity === 'brief' && !first);
  // Infocom runs a room's arrival routine (M-ENTER) before describing it.
  if (world.style === 'infocom') {
    const arrival = runOnEnter(targetId, world, state);
    // An arrival that moved the player on, or ended things, has said all there is to say.
    if (state.currentRoom !== targetId || state.gameOver || turnHalted(state)) return arrival;
    return [...arrival, ...describeRoom(targetId, world, state, { first, brief, namesOnly: verbosity === 'superbrief' })];
  }
  const lines = describeRoom(targetId, world, state, { first, brief, namesOnly: verbosity === 'superbrief' });
  lines.push(...runOnEnter(targetId, world, state));
  return lines;
}

export function exitTarget(exit: string | Exit | undefined): string | undefined {
  return typeof exit === 'string' ? exit : exit?.to;
}

/** Follow one exit. Every refusal comes before the move, so it changes nothing. */
export function followExit(exit: string | Exit, world: World, state: GameState): EngineResult {
  if (typeof exit !== 'string') {
    const refused = exit.denials?.find((d) => evaluateCondition(d.if, state, world));
    if (refused) return ok([refused.text]);
    if (exit.if && !evaluateCondition(exit.if, state, world)) return ok([exit.denial ?? 'You can’t go that way.']);
    if (exit.door && !isOpen(world, state, exit.door)) {
      return ok([`The ${world.items[exit.door]?.name ?? exit.door} is closed.`]);
    }
    if (!exit.to) return ok([exit.denial ?? 'You can’t go that way.']);
  }
  const to = exitTarget(exit)!;
  const passing = typeof exit !== 'string' && exit.then ? runEvent(exit.then, world, state) : [];
  if (turnHalted(state) || state.gameOver) return ok(passing, true);
  const lines = [...passing, ...enterRoom(to, world, state)];
  return ok(lines, state.currentRoom === to || passing.length > 0);
}

export function handleGo(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Go where? Try a direction or a place.']);
  const room = world.rooms[state.currentRoom];
  if (!room) return ok(['You are nowhere.']);

  const exitKey = fuzzyMatchExit(target, room.exits);
  if (!exitKey) {
    // Stumbling around in the dark is a real attempt to move (Zork's grue).
    // Only a real direction is a blunder; anything else goes to the LLM as a miss.
    if (world.darkness?.blunder && DIRECTION_WORDS.has(target) && !isLit(world, state)) {
      return ok(runSteps(world.darkness.blunder, world, state), true);
    }
    if (world.style === 'infocom') return miss('You can’t go that way.');
    return miss(`You can’t go that way. Exits: ${exitList(room) || '(none)'}.`);
  }
  return followExit(room.exits[exitKey], world, state);
}

/** The exit through a visible door item, if `target` names one. */
function exitThroughDoor(target: string, world: World, state: GameState): string | Exit | null {
  const room = world.rooms[state.currentRoom];
  const id = matchItem(target, visibleItems(world, state), world);
  if (!room || !id || !world.items[id]?.door) return null;
  return Object.values(room.exits).find((e) => typeof e !== 'string' && e.door === id) ?? null;
}

export function handleEnter(target: string | undefined, world: World, state: GameState): EngineResult {
  const room = world.rooms[state.currentRoom];
  if (!room) return ok(['You are nowhere.']);
  if (!target) {
    const inward = room.exits.in ?? room.exits.inside;
    return inward ? followExit(inward, world, state) : miss('Enter what?');
  }
  const label = fuzzyMatchExit(target, room.exits);
  if (label) return followExit(room.exits[label], world, state);
  const door = exitThroughDoor(target, world, state);
  if (door) return followExit(door, world, state);
  return miss('You can’t enter that.');
}

export function handleClimb(target: string | undefined, world: World, state: GameState): EngineResult {
  const room = world.rooms[state.currentRoom];
  if (!room) return ok(['You are nowhere.']);
  if (target === 'up' || target === 'down') {
    return room.exits[target] ? followExit(room.exits[target], world, state) : miss('You can’t climb that way.');
  }
  // CLIMB TREE: something here to climb, so take the climbing exit, or up.
  const onThing = !target || matchItem(target, visibleItems(world, state), world);
  const climbing = room.exits.climb ?? room.exits.up;
  if (onThing && climbing) return followExit(climbing, world, state);
  if (target) {
    const label = fuzzyMatchExit(target, room.exits);
    if (label) return followExit(room.exits[label], world, state);
  }
  return miss('You can’t climb that.');
}

/** Waiting or sitting is also how you get through some rooms (the commute). */
export function handleIdle(action: string, world: World, state: GameState): EngineResult {
  const exit = world.rooms[state.currentRoom]?.exits[action];
  if (exit) return followExit(exit, world, state);
  return ok([world.idle ?? 'Time passes.']);
}
