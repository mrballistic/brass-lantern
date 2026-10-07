import type { GameState, NpcState, ParsedAction, Place } from '@/types/game';
import type { EventStep, World } from '@/types/world';
import { fightStrength } from './combat';
import { fallbackParse } from './parser';
import { evaluateCondition } from './conditions';
import { exitTarget } from './describe';
import { fuzzyCandidates } from './fuzzy';
import { childrenOf, isCarried, isHeld, isLit, isNpcHidden, isNpcIn, isOpen, isReachable, isWater, parentOf } from './model';
import { nextRandom, roll } from './rng';

// The code hatch: a world's own functions for behavior its data can't express.
// A script sees the game read-only and returns ordinary steps for the engine to
// run, so it can't break the rules effects follow (a miss changes nothing, and
// randomness comes from the seed).

export interface ScriptContext {
  world: World;
  state: Readonly<GameState>;
  /** The seeded generator: 0 to 1. Advances the game's seed. */
  random(): number;
  /** Zork's RANDOM: 1 to n, from the seed. */
  roll(n: number): number;
  /** From `{ script, arg }`. */
  arg?: string;
  /** The player can reach it. */
  here(id: string): boolean;
  carried(id: string): boolean;
  /** An item's parent. */
  holder(id: string): Place;
  /** The player's room. */
  room(): string;
  npc(id: string): Readonly<NpcState> | undefined;
  /** Is the character in this room (hidden or not)? */
  npcIn(id: string, room: string): boolean;
  /** The world's room IDs, in its order. */
  rooms(): string[];
  /** Has the player been in this room? */
  visited(room: string): boolean;
  /** An item's treasure value (0 if none). */
  treasure(id: string): number;
  tags(room: string): string[];
  /** Is the room (default: the player's) lit? */
  lit(room?: string): boolean;
  /** What's directly in a room, item or character, in listing order. */
  children(place: string): string[];
  /** The player's fight strength now (Zork's FIGHT-STRENGTH). */
  playerStrength(): number;
  /** Is the character hidden? */
  hidden(id: string): boolean;
  /** The vehicle the player is in, if any. */
  aboard(): string | undefined;
  /** Is the room (default: the player's) water? */
  water(room?: string): boolean;
  /** Does the condition hold now? (The engine's own parser; scripts never parse conditions.) */
  test(condition: string): boolean;
  /** The room's exits the player could take now: the exit's `if` holds and its door is open. */
  exits(room: string): Array<{ direction: string; to: string }>;
  /** Reads words as an item, as the parser would (`here`: within reach, the default; `held`; `all`). Null if none matches. */
  resolve(words: string, scope?: 'here' | 'held' | 'all'): string | null;
  /** The number typed in the command being run (TURN DIAL TO 4). */
  number?: number;
  /** The words typed after a text verb in the command being run (SAY HELLO). */
  text?: string;
  /** The raw input, when a capture runs this script on a line. */
  line?: string;
  /** The command, when a capture runs this script on one already parsed (AGAIN, an answer, the intent server's reading). */
  action?: ParsedAction;
  /** Reads a command with the world's verbs, as the parser would (null if it can't). */
  parse(text: string): ParsedAction | null;
  /** The command being run, with its objects resolved to IDs, when a rule ran this script. */
  command?: Command;
}

export interface Command {
  verb: string;
  target?: string;
  indirect?: string;
  /** The number typed (TURN DIAL TO 4), when an object slot held one. */
  number?: number;
  /** PUSH X north: the direction typed. */
  direction?: string;
  /** The words typed after a text verb (SAY HELLO), for `said:`. */
  text?: string;
  /** The words typed, for objects that didn't resolve (water inside a carried bottle). */
  words?: { target?: string; indirect?: string };
  /** In an order (“robot, take the sphere”), the character carrying it out. */
  actor?: string;
  /** In an order, the inner command as parsed. */
  order?: ParsedAction;
}

const commands = new WeakMap<GameState, Command | null>();

/** The command a rule is running for this turn, if any. */
export function commandOf(state: GameState): Command | undefined {
  return commands.get(state) ?? undefined;
}

/** Records the command a rule is running for, so scripts can see it. */
export function setCommand(state: GameState, command: Command | null): void {
  commands.set(state, command);
}

export type Script = (ctx: ScriptContext) => EventStep[] | void;

// Development and tests hand scripts a frozen copy, so one that assigns throws.
// Production passes the state as is: no copy per call.
const FREEZE = import.meta.env.DEV;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** The steps a world's script returns. A missing script returns none. */
export function scriptSteps(name: string, arg: string | undefined, world: World, state: GameState, line?: string, action?: ParsedAction): EventStep[] {
  const script = world.scripts?.[name];
  if (!script) return [];
  // A JSON copy: the store's state is a reactive proxy, which structuredClone can't copy.
  const view: Readonly<GameState> = FREEZE ? deepFreeze(JSON.parse(JSON.stringify(state)) as GameState) : state;
  const steps = script({
    world,
    state: view,
    random: () => nextRandom(state),
    roll: (n) => roll(state, n),
    arg,
    here: (id) => isReachable(world, state, id),
    carried: (id) => isCarried(state, id),
    holder: (id) => parentOf(state, id),
    room: () => state.currentRoom,
    npc: (id) => view.npcs?.[id],
    command: commands.get(state) ?? undefined,
    npcIn: (id, room) => isNpcIn(world, state, id, room),
    rooms: () => Object.keys(world.rooms),
    visited: (room) => state.visited.includes(room),
    treasure: (id) => world.items[id]?.treasure ?? 0,
    tags: (room) => world.rooms[room]?.tags ?? [],
    lit: (room) => isLit(world, state, room ?? state.currentRoom),
    children: (place) => childrenOf(world, state, place),
    playerStrength: () => fightStrength(world, state),
    hidden: (id) => isNpcHidden(world, state, id),
    aboard: () => state.aboard,
    water: (room) => isWater(world, state, room ?? state.currentRoom),
    test: (condition) => evaluateCondition(condition, state, world),
    exits: (room) => passableExits(world, state, room),
    resolve: (words, scope = 'here') => {
      const pool = Object.keys(world.items).filter((id) => scope === 'all' || (scope === 'held' ? isHeld(state, id) : isReachable(world, state, id)));
      return fuzzyCandidates(words, pool.map((id) => ({ id, name: world.items[id].name, aliases: world.items[id].aliases })))[0] ?? null;
    },
    number: commands.get(state)?.number,
    text: commands.get(state)?.text,
    line,
    action,
    parse: (text) => fallbackParse(text, world.verbs),
  });
  return steps ?? [];
}

/** A room's exits that lead somewhere and could be taken now: `if` holds, door open. */
function passableExits(world: World, state: GameState, room: string): Array<{ direction: string; to: string }> {
  const out: Array<{ direction: string; to: string }> = [];
  for (const [direction, exit] of Object.entries(world.rooms[room]?.exits ?? {})) {
    const to = exitTarget(exit);
    if (to === undefined) continue;
    if (typeof exit !== 'string') {
      if (exit.if && !evaluateCondition(exit.if, state, world)) continue;
      if (exit.door && !isOpen(world, state, exit.door)) continue;
    }
    out.push({ direction, to });
  }
  return out;
}
