import type { GameState } from '../../types/game.ts';
import type { Exit, World } from '../../types/world.ts';
import { evaluateCondition } from '../conditions.ts';
import { COMPASS, describeRoom, exitList, exitTarget } from '../describe.ts';
import { fuzzyMatchExit } from '../fuzzy.ts';
import { isSafeKey } from '../keys.ts';
import { isAwake, isLit, isNpcHidden, isOpen, isWater, restTerrains, matchItem, nextPlacing, npcStateOf, npcsIn, onFootTerrains, pickItem, terrainOf, travelTerrains, visibleItems } from '../model.ts';
import { handleBoard } from './vehicle.ts';
import { runEventKey, runSteps, turnHalted, vehicleLine } from '../effects.ts';
import { nextRandom } from '../rng.ts';
import { miss, ok, type EngineResult } from '../result.ts';

/** Evaluate onEnter triggers and emit any event-script lines. */
function runOnEnter(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [];
  const out: string[] = [];
  for (const trigger of room.onEnter) {
    if (turnHalted(state)) break;
    if (!trigger.repeat && state.firedEvents.includes(trigger.then)) continue;
    if (evaluateCondition(trigger.if, state, world)) out.push(...runEventKey(trigger.then, world, state));
  }
  return out;
}

const DIRECTION_WORDS = new Set([...COMPASS, 'in', 'out', 'inside', 'outside']);

/** Zork's YUKS: replies to an attempt that can't be taken seriously. */
const YUKS = ['A valiant attempt.', 'You can’t be serious.', 'An interesting idea...', 'What a concept!'];

/**
 * Characters that follow the player: each one that was in the room just left, is awake and unseen-not,
 * and whose `follows` condition (or `{ follow }` state) holds now, arrives in the player's room,
 * newest on the shared placing sequence. Only the player's own moves call this.
 */
export function moveFollowers(fromRoom: string, world: World, state: GameState): string[] {
  const lines: string[] = [];
  for (const id of npcsIn(world, state, fromRoom)) {
    const npc = world.npcs[id];
    if (!npc || !isAwake(world, state, id) || isNpcHidden(world, state, id)) continue;
    if (state.npcs?.[id]?.following !== true && !(npc.follows && evaluateCondition(npc.follows, state, world))) continue;
    Object.assign(npcStateOf(state, id), { room: state.currentRoom, seq: nextPlacing(state) });
    const line = npc.followLine ?? (world.style === 'infocom' ? undefined : `${npc.name[0].toUpperCase()}${npc.name.slice(1)} follows you.`);
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * GOTO's line as a vehicle comes onto a terrain it rests on (`restsOn`) from one it travels that the player can't
 * walk on. A vehicle's own `landing` says it; unset, a water vehicle coming off water says Zork's “comes to a rest
 * on the shore.” and a blank line, and anything else says nothing.
 */
function landingLines(from: string, targetId: string, world: World, state: GameState): string[] {
  const item = state.aboard ? world.items[state.aboard] : undefined;
  const vehicle = item?.vehicle;
  if (!item || !vehicle) return [];
  const to = terrainOf(world, state, targetId);
  if (!restTerrains(vehicle).includes(to) || !travelTerrains(vehicle).includes(from) || onFootTerrains(world).includes(from)) return [];
  if (vehicle.landing !== undefined) return vehicleLine(vehicle.landing, world, state);
  return from === 'water' ? [`The ${item.name} comes to a rest on the shore.`, ''] : [];
}

const GENERIC_DENIAL = 'Something stops you. The story isn’t ready for you to go there yet.';

/** A player's move into a room; aboard a vehicle with `leave`/`arrive` lines, they frame the new room. */
export function enterRoom(targetId: string, world: World, state: GameState, opts: { quiet?: boolean } = {}): string[] {
  const vehicle = state.aboard ? world.items[state.aboard]?.vehicle : undefined;
  const target = world.rooms[targetId];
  // The move is certain once the room exists and lets you in: `leave` is worked out now, in the room being left, before anything changes.
  const going = vehicle && !opts.quiet && target && (!target.requires || evaluateCondition(target.requires, state, world));
  const leaving = going ? vehicleLine(vehicle.leave, world, state) : [];
  const lines = enterRoomInner(targetId, world, state, opts);
  if (!going) return lines;
  return [...leaving, ...lines, ...(state.gameOver || state.currentRoom !== targetId ? [] : vehicleLine(vehicle.arrive, world, state))];
}

function enterRoomInner(targetId: string, world: World, state: GameState, opts: { quiet?: boolean }): string[] {
  const target = world.rooms[targetId];
  if (!target) return ['There is nothing in that direction.'];
  if (target.requires && !evaluateCondition(target.requires, state, world)) {
    return [target.denial ?? GENERIC_DENIAL];
  }
  const first = !state.visited.includes(targetId);
  const fromTerrain = terrainOf(world, state);
  const wasLit = isLit(world, state);
  state.currentRoom = targetId;
  // The vehicle goes where you go; coming ashore it rests on the bank (GOTO).
  const landing: string[] = [];
  if (state.aboard) {
    if (isSafeKey(state.aboard)) state.locations[state.aboard] = targetId;
    landing.push(...landingLines(fromTerrain, targetId, world, state));
  }
  // Zork's GOTO: from one unlit room into another, the grue may be waiting.
  const stumble = world.darkness?.stumble;
  if (stumble && !wasLit && !isLit(world, state) && nextRandom(state) * 100 < stumble.chance) {
    return [...landing, ...runSteps(state.aboard && stumble.aboard ? stumble.aboard : stumble.then, world, state)];
  }
  // Zork's GOTO, surviving that: “You have moved into a dark place.”
  if (world.darkness?.arrive && !isLit(world, state)) landing.push(world.darkness.arrive);
  // A dark room isn't visited until you've seen it (Zork's TOUCHBIT).
  if (first && isLit(world, state)) state.visited.push(targetId);
  // A quiet move (Zork's GOTO without a description) still runs the room's arrival events.
  if (opts.quiet) return [...landing, ...runOnEnter(targetId, world, state)];
  const verbosity = state.verbosity ?? (world.style === 'infocom' ? 'brief' : 'verbose');
  const brief = verbosity === 'superbrief' || (verbosity === 'brief' && !first);
  // Infocom runs a room's arrival routine (M-ENTER) before describing it.
  if (world.style === 'infocom') {
    const arrival = runOnEnter(targetId, world, state);
    // An arrival that moved the player on, or ended things, has said all there is to say.
    if (state.currentRoom !== targetId || state.gameOver || turnHalted(state)) return [...landing, ...arrival];
    return [...landing, ...arrival, ...describeRoom(targetId, world, state, { first, brief, namesOnly: verbosity === 'superbrief' })];
  }
  const lines = [...landing, ...describeRoom(targetId, world, state, { first, brief, namesOnly: verbosity === 'superbrief' })];
  lines.push(...runOnEnter(targetId, world, state));
  return lines;
}

/** An exit's own refusal (V-WALK's RFATAL): it changes nothing, and skips the room's end routine. */
const refuse = (line: string): EngineResult => ({ ...ok([line]), fatal: true });

/**
 * Why an exit can't be taken now, in the words the player hears: a denial that holds, a failing `if`, a closed
 * door, in that order. Null when it's passable. The one check the player, characters and `ctx.exits` share.
 */
export function exitRefusal(exit: string | Exit, world: World, state: GameState): string | null {
  if (typeof exit === 'string') return null;
  const refused = exit.denials?.find((d) => evaluateCondition(d.if, state, world));
  if (refused) return refused.text;
  if (exit.if && !evaluateCondition(exit.if, state, world)) return exit.denial ?? 'You can’t go that way.';
  if (exit.door && !isOpen(world, state, exit.door)) return `The ${world.items[exit.door]?.name ?? exit.door} is closed.`;
  return null;
}

/** Follow one exit. Every refusal comes before the move, so it changes nothing. */
function followExit(exit: string | Exit, world: World, state: GameState): EngineResult {
  const why = exitRefusal(exit, world, state);
  if (why !== null) return refuse(why);
  if (typeof exit !== 'string' && !exit.to) return refuse(exit.denial ?? 'You can’t go that way.');
  const to = exitTarget(exit)!;
  // GOTO's own refusals aren't fatal (they RFALSE): the room's end routine still runs.
  const refused = vehicleRefusal(to, world, state);
  if (refused) return ok([refused]);
  const passing = typeof exit !== 'string' && exit.then ? runEventKey(exit.then, world, state) : [];
  if (turnHalted(state) || state.gameOver) return ok(passing, true);
  const from = state.currentRoom;
  const lines = [...passing, ...enterRoom(to, world, state)];
  // A move the player made (not a scripted one) takes its followers along, after the description.
  if (state.currentRoom !== from && !state.gameOver && !turnHalted(state)) lines.push(...moveFollowers(from, world, state));
  return ok(lines, state.currentRoom === to || passing.length > 0);
}

/**
 * Zork's GOTO, over named terrains. On foot, a room's terrain must be one the player walks (`onFoot`). Aboard,
 * the vehicle enters the terrains it `travels`, and comes to rest on its `restsOn` terrains only from one it
 * travels (a vehicle won't go overland); one that travels nowhere never moves. Null when the move may happen.
 */
export function vehicleRefusal(to: string, world: World, state: GameState): string | null {
  const vehicle = state.aboard ? world.items[state.aboard] : undefined;
  const target = terrainOf(world, state, to);
  if (!vehicle?.vehicle) return onFootTerrains(world).includes(target) ? null : 'You can’t go there without a vehicle.';
  const travels = travelTerrains(vehicle.vehicle);
  const ok = travels.includes(target) || (restTerrains(vehicle.vehicle).includes(target) && travels.includes(terrainOf(world, state)));
  return ok ? null : `You can’t go there in a ${vehicle.name}.`;
}

export function handleGo(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Go where? Try a direction or a place.']);
  const room = world.rooms[state.currentRoom];
  if (!room) return ok(['You are nowhere.']);

  const exitKey = fuzzyMatchExit(target, room.exits);
  if (!exitKey) {
    // Stumbling around in the dark is a real attempt to move (Zork's grue).
    // Only a real direction is a blunder; anything else goes to the LLM as a miss.
    // V-WALK's blunder never happens on water.
    if (world.darkness?.blunder && DIRECTION_WORDS.has(target) && !isLit(world, state) && !isWater(world, state)) {
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
  // ENTER BOAT: a vehicle is boarded (Zork's V-THROUGH).
  const thing = pickItem(target, visibleItems(world, state), world, 'target', state);
  if (thing && world.items[thing].vehicle) return handleBoard({ action: 'board', target: thing }, world, state);
  // Zork's V-THROUGH for anything else in sight.
  if (thing && world.style === 'infocom') {
    if (!world.items[thing].portable) return ok([`You hit your head against the ${world.items[thing].name} as you attempt this feat.`]);
    if (state.locations[thing] === 'player') return ok(['That would involve quite a contortion!']);
    return ok([YUKS[Math.floor(nextRandom(state) * YUKS.length)]]);
  }
  return miss('You can’t enter that.');
}

export function handleClimb(target: string | undefined, world: World, state: GameState, direction?: 'up' | 'down'): EngineResult {
  const room = world.rooms[state.currentRoom];
  if (!room) return ok(['You are nowhere.']);
  // CLIMB DOWN LADDER: a thing here, climbed in a direction (Zork's V-CLIMB-DOWN walks that way).
  const thing = direction && target ? matchItem(target, visibleItems(world, state), world) : null;
  if (direction && thing) {
    // Climbing up something takes the room's climbing exit when there's no up exit.
    const exit = room.exits[direction] ?? (direction === 'up' ? room.exits.climb : undefined);
    if (world.style !== 'infocom') return exit ? followExit(exit, world, state) : miss('You can’t climb that way.');
    // Zork's V-CLIMB-UP: UP just walks; DOWN walks only if the thing belongs where it leads.
    if (!exit) {
      const item = world.items[thing];
      // ZIL tests WALL among the thing's synonyms, then the tree; then the plain refusals.
      if ([item.name, ...(item.aliases ?? [])].some((n) => /^walls?$/i.test(n) || /\bwalls?$/i.test(n))) return ok(['Climbing the walls is to no avail.']);
      if (item.climbRefusal && (!item.climbRefusal.if || evaluateCondition(item.climbRefusal.if, state, world))) return ok([item.climbRefusal.text]);
      return ok([direction === 'up' ? 'You can’t go that way.' : 'You can’t do that!']);
    }
    if (direction === 'down') {
      const to = exitTarget(exit);
      if (!to || !(world.rooms[to]?.scenery ?? []).includes(thing)) return ok([`The ${world.items[thing]?.name ?? thing} doesn’t lead downward.`]);
    }
    return followExit(exit, world, state);
  }
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
