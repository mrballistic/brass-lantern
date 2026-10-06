import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { currentScore } from './score';
import { weightOf } from './weight';
import { isAlive, isAwake, isLit, isLocked, isNpcIn, isOn, isOpen, isReachable, isWater, npcsSeen } from './model';

/**
 * Evaluate a condition string against the current game state.
 * Supported forms, each negatable with a leading "!" and joined with "&" when
 * all must hold:
 *   flag:NAME       the flag is set
 *   has:ITEM        the player carries it
 *   in:ROOM         the player is in the room
 *   visited:ROOM    the player has been there
 *   inside:X:PLACE  X's parent is PLACE (a room, an item, or "player")
 *   open:X, locked:X, on:X   item state
 *   here:X          the player can reach X (needs `world`)
 *   var:NAME<=N     a numeric variable compared (=, <, >, <=, >=); unset is 0
 *   carrying<=N     how many things the player holds directly
 *   heaviest<=N     the heaviest thing the player holds, contents included
 *   score<=N        the score, as SCORE reports it
 *   lit:here, lit:ROOM  the room has light (needs `world`)
 * Unrecognized strings evaluate to false.
 */
const COMPARE: Record<string, (a: number, b: number) => boolean> = {
  '=': (a, b) => a === b,
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
};

function carrying(state: GameState): number {
  return Object.values(state.locations).filter((p) => p === 'player').length;
}

/** The heaviest thing held directly, its contents included (Zork's EMPTY-HANDED check). */
function heaviest(state: GameState, world?: World): number {
  if (!world) return 0;
  const held = Object.keys(state.locations).filter((id) => state.locations[id] === 'player');
  return Math.max(0, ...held.map((id) => weightOf(world, state, id)));
}

export function evaluateCondition(condition: string, state: GameState, world?: World): boolean {
  // "flag:a & !flag:b": every part must hold.
  if (condition.includes('&')) {
    const parts = condition.split('&');
    return parts.every((part) => evaluateCondition(part, state, world));
  }
  const trimmed = condition.trim();
  if (!trimmed) return false;

  const negated = trimmed.startsWith('!');
  const body = negated ? trimmed.slice(1) : trimmed;

  // var:NAME<=N, carrying<=N, heaviest<=N and score<=N (with =, <, >, <=, >=)
  const compare = body.match(/^(?:var:(\w+)|(carrying|heaviest|score))\s*(<=|>=|=|<|>)\s*(-?\d+)$/);
  if (compare) {
    const [, name, count, op, n] = compare;
    const value =
      count === 'heaviest' ? heaviest(state, world) : count === 'score' ? (world ? currentScore(world, state) : 0) : count ? carrying(state) : (state.vars?.[name] ?? 0);
    const result = COMPARE[op](value, Number(n));
    return negated ? !result : result;
  }
  const [kind, value, extra] = body.split(':');

  let result: boolean;
  switch (kind) {
    case 'flag':
      result = Boolean(state.flags[value]);
      break;
    case 'has':
      result = state.locations[value] === 'player';
      break;
    case 'in':
      result = state.currentRoom === value;
      break;
    case 'visited':
      result = state.visited.includes(value);
      break;
    case 'inside':
      result = (state.locations[value] ?? null) === (extra ?? null);
      break;
    case 'on':
      result = isOn(state, value);
      break;
    case 'open':
      result = world ? isOpen(world, state, value) : false;
      break;
    case 'locked':
      result = world ? isLocked(world, state, value) : false;
      break;
    case 'lit':
      result = world ? isLit(world, state, value === 'here' ? state.currentRoom : value) : false;
      break;
    case 'here':
      result = world ? isReachable(world, state, value) : false;
      break;
    case 'aboard':
      result = value ? state.aboard === value : Boolean(state.aboard);
      break;
    case 'water':
      result = world ? isWater(world, state, !value || value === 'here' ? state.currentRoom : value) : false;
      break;
    case 'alive':
      result = world ? isAlive(world, state, value) : false;
      break;
    case 'awake':
      result = world ? isAwake(world, state, value) : false;
      break;
    case 'fighting':
      result = Boolean(state.npcs?.[value]?.fighting) && (world ? isAwake(world, state, value) : false);
      break;
    case 'with':
      result = world ? isNpcIn(world, state, value, state.currentRoom) : false;
      break;
    case 'seen':
      result = world ? npcsSeen(world, state, state.currentRoom).includes(value) : false;
      break;
    default:
      return false;
  }
  return negated ? !result : result;
}

/**
 * What's wrong with a condition string, for the world audit: unknown kinds,
 * and items, rooms or places that don't exist. Empty when it's sound.
 */
export function conditionProblems(condition: string, world: World): string[] {
  const problems: string[] = [];
  for (const part of condition.split('&')) {
    const body = part.trim().replace(/^!/, '');
    if (/^(?:var:\w+|carrying|heaviest|score)\s*(<=|>=|=|<|>)\s*-?\d+$/.test(body)) continue;
    const [kind, value = '', extra] = body.split(':');
    const item = (id: string) => id in world.items || id in world.npcs;
    const room = (id: string) => id in world.rooms;
    const noItem = () => problems.push(`“${body}” names no item “${value}”`);
    const noRoom = () => problems.push(`“${body}” names no room “${value}”`);
    switch (kind) {
      case 'flag':
        break;
      case 'has':
      case 'on':
      case 'open':
      case 'locked':
        if (!(value in world.items)) noItem();
        break;
      case 'here':
        if (!item(value)) noItem();
        break;
      case 'in':
      case 'visited':
        if (!room(value)) noRoom();
        break;
      case 'alive':
      case 'awake':
      case 'fighting':
      case 'with':
      case 'seen':
        if (!(value in world.npcs)) problems.push(`“${body}” names no character “${value}”`);
        break;
      case 'aboard':
        if (value && !item(value)) noItem();
        break;
      case 'water':
        if (value && value !== 'here' && !room(value)) noRoom();
        break;
      case 'lit':
        if (value !== 'here' && !room(value)) noRoom();
        break;
      case 'inside':
        if (!item(value)) noItem();
        if (extra !== undefined && extra !== 'player' && !item(extra) && !room(extra)) problems.push(`“${body}” names no place “${extra}”`);
        break;
      default:
        problems.push(`unknown condition “${body}”`);
    }
  }
  return problems;
}
