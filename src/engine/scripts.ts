import type { GameState, NpcState, ParsedAction, Place } from '@/types/game';
import type { EventStep, World } from '@/types/world';
import { fightStrength } from './combat';
import { fallbackParse } from './parser';
import { childrenOf, isCarried, isLit, isNpcHidden, isNpcIn, isReachable, parentOf } from './model';
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
  /** The words typed, for objects that didn't resolve (water inside a carried bottle). */
  words?: { target?: string; indirect?: string };
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
    line,
    action,
    parse: (text) => fallbackParse(text, world.verbs),
  });
  return steps ?? [];
}
