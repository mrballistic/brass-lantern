import type { GameState } from '@/types/game';

/**
 * Evaluate a condition string against the current game state.
 * Supported forms: "flag:NAME", "has:ITEM", "in:ROOM", each negatable with a
 * leading "!", and joined with "&" when all must hold.
 * Unrecognized strings evaluate to false.
 */
export function evaluateCondition(condition: string, state: GameState): boolean {
  // "flag:a & !flag:b": every part must hold.
  if (condition.includes('&')) {
    const parts = condition.split('&');
    return parts.every((part) => evaluateCondition(part, state));
  }
  const trimmed = condition.trim();
  if (!trimmed) return false;

  const negated = trimmed.startsWith('!');
  const body = negated ? trimmed.slice(1) : trimmed;
  const [kind, value] = body.split(':', 2);

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
    default:
      return false;
  }
  return negated ? !result : result;
}
