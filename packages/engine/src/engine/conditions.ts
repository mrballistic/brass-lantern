import type { GameState } from '../types/game.ts';
import type { World } from '../types/world.ts';
import { currentScore } from './score.ts';
import { commandOf } from './scripts.ts';
import { weightOf } from './weight.ts';
import { isAlive, isAwake, isCarried, isHeld, isLit, isLocked, isNpcIn, isOn, isOpen, isReachable, isWater, npcsSeen, PLAYER, terrainOf } from './model.ts';

/**
 * Evaluate a condition string against the current game state.
 * Supported forms, each negatable with a leading "!" and joined with "&" when
 * all must hold:
 *   flag:NAME       the flag is set
 *   has:ITEM        the player carries it
 *   held:ITEM       the player carries it, or it's inside something carried (Zork's HELD?)
 *   in:ROOM         the player is in the room
 *   visited:ROOM    the player has been there
 *   inside:X:PLACE  X's parent is PLACE (a room, an item, or "player")
 *   open:X, locked:X, on:X   item state
 *   here:X          the player can reach X (needs `world`)
 *   var:NAME<=N     a numeric variable compared (=, <, >, <=, >=); unset is 0
 *   carrying<=N     how many things the player holds directly
 *   heaviest<=N     the heaviest thing the player holds, contents included
 *   score<=N        the score, as SCORE reports it
 *   said:WORDS           the words typed after a text verb (SAY HELLO), case and punctuation ignored
 *   number:N, number<=N  the number in the command being run (TURN DIAL TO 4); false when it has none
 *   target:ID, indirect:ID  that slot of the command being run resolved to ID (ME is `player`)
 *   direction:DIR   the direction typed (PUSH X NORTH)
 *   following:NPC  the character follows the player (the `follow` effect set its state)
 *   lit:here, lit:ROOM  the room has light (needs `world`)
 *   terrain:NAME, terrain:NAME:ROOM  the room (default the player's) is that kind of ground (`land`, `water`, `air`, or a world's own)
 * Unrecognized strings evaluate to false.
 */
/** Typed words compare as lowercase whole words, punctuation and quotes ignored. */
function sayable(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).join(' ');
}

const COMPARE: Record<string, (a: number, b: number) => boolean> = {
  '=': (a, b) => a === b,
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
};

function carrying(state: GameState): number {
  return Object.values(state.locations).filter((p) => p === PLAYER).length;
}

/** The heaviest thing held directly, its contents included (Zork's EMPTY-HANDED check). */
function heaviest(state: GameState, world?: World): number {
  if (!world) return 0;
  const held = Object.keys(state.locations).filter((id) => isCarried(state, id));
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
  const compare = body.match(/^(?:var:(\w+)|(carrying|heaviest|score|number))\s*(<=|>=|=|<|>)\s*(-?\d+)$/);
  if (compare) {
    const [, name, count, op, n] = compare;
    const typed = commandOf(state)?.number;
    const value =
      count === 'heaviest' ? heaviest(state, world) : count === 'score' ? (world ? currentScore(world, state) : 0) : count === 'number' ? typed : count ? carrying(state) : (state.vars?.[name] ?? 0);
    const result = value !== undefined && COMPARE[op](value, Number(n));
    return negated ? !result : result;
  }
  const [kind, value, extra] = body.split(':');

  let result: boolean;
  switch (kind) {
    case 'flag':
      result = Boolean(state.flags[value]);
      break;
    case 'number':
      result = commandOf(state)?.number === Number(value);
      break;
    case 'target':
    case 'indirect':
      result = commandOf(state)?.[kind] === value;
      break;
    case 'direction':
      result = commandOf(state)?.direction === value;
      break;
    case 'said': {
      const typed = commandOf(state)?.text;
      result = typed !== undefined && sayable(typed) === sayable(body.slice('said:'.length));
      break;
    }
    case 'has':
      result = isCarried(state, value);
      break;
    case 'held':
      result = isHeld(state, value);
      break;
    case 'following':
      result = state.npcs?.[value]?.following === true;
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
    case 'terrain':
      result = world ? terrainOf(world, state, !extra || extra === 'here' ? state.currentRoom : extra) === value : false;
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
    if (/^(?:var:\w+|carrying|heaviest|score|number)\s*(<=|>=|=|<|>)\s*-?\d+$/.test(body)) continue;
    const [kind, value = '', extra] = body.split(':');
    const item = (id: string) => id in world.items || id in world.npcs;
    const room = (id: string) => id in world.rooms;
    const noItem = () => problems.push(`“${body}” names no item “${value}”`);
    const noRoom = () => problems.push(`“${body}” names no room “${value}”`);
    switch (kind) {
      case 'flag':
        break;
      case 'said':
        if (!sayable(body.slice('said:'.length))) problems.push(`unknown condition “${body}”`);
        break;
      case 'target':
      case 'indirect':
        if (value !== 'player' && value !== 'number' && !item(value)) noItem();
        break;
      case 'direction':
        if (!/^(?:north|south|east|west|northeast|northwest|southeast|southwest|up|down)$/.test(value)) problems.push(`unknown condition “${body}”`);
        break;
      case 'number':
        if (!/^-?\d+$/.test(value)) problems.push(`unknown condition “${body}”`);
        break;
      case 'has':
      case 'held':
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
      case 'following':
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
      case 'terrain':
        if (!value) problems.push(`unknown condition “${body}”`);
        if (extra !== undefined && extra !== 'here' && !room(extra)) problems.push(`“${body}” names no room “${extra}”`);
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
