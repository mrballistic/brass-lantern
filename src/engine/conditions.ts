import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { isLit, isLocked, isOn, isOpen, isReachable } from './model';

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

  // var:NAME<=N and carrying<=N (with =, <, >, <=, >=)
  const compare = body.match(/^(?:var:(\w+)|carrying)\s*(<=|>=|=|<|>)\s*(-?\d+)$/);
  if (compare) {
    const [, name, op, n] = compare;
    const value = name === undefined ? carrying(state) : (state.vars?.[name] ?? 0);
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
    default:
      return false;
  }
  return negated ? !result : result;
}
