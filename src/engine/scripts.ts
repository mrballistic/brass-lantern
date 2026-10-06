import type { GameState, NpcState, Place } from '@/types/game';
import type { EventStep, World } from '@/types/world';
import { isCarried, isReachable, parentOf } from './model';
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
  /** The command being run, with its objects resolved to IDs, when a rule ran this script. */
  command?: Command;
}

export interface Command {
  verb: string;
  target?: string;
  indirect?: string;
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
export function scriptSteps(name: string, arg: string | undefined, world: World, state: GameState): EventStep[] {
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
  });
  return steps ?? [];
}
