import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { describeRoom, exitList } from '../describe';
import { fuzzyMatchExit } from '../fuzzy';
import { miss, ok, type EngineResult } from '../result';
import { runEvent } from '../rules';

/** Evaluate onEnter triggers and emit any event-script lines. */
export function runOnEnter(roomId: string, world: World, state: GameState): string[] {
  const room = world.rooms[roomId];
  if (!room) return [];
  const out: string[] = [];
  for (const trigger of room.onEnter) {
    if (state.firedEvents.includes(trigger.then)) continue;
    if (evaluateCondition(trigger.if, state, world)) out.push(...runEvent(trigger.then, world, state));
  }
  return out;
}

export const GENERIC_DENIAL = 'Something stops you. The story isn’t ready for you to go there yet.';

export function enterRoom(targetId: string, world: World, state: GameState): string[] {
  const target = world.rooms[targetId];
  if (!target) return ['There is nothing in that direction.'];
  if (target.requires && !evaluateCondition(target.requires, state, world)) {
    return [target.denial ?? GENERIC_DENIAL];
  }
  state.currentRoom = targetId;
  state.moveCount += 1;
  if (!state.visited.includes(targetId)) state.visited.push(targetId);
  const lines = describeRoom(targetId, world, state);
  lines.push(...runOnEnter(targetId, world, state));
  return lines;
}

export function handleGo(target: string | undefined, world: World, state: GameState): EngineResult {
  if (!target) return ok(['Go where? Try a direction or a place.']);
  const room = world.rooms[state.currentRoom];
  if (!room) return ok(['You are nowhere.']);

  const exitKey = fuzzyMatchExit(target, room.exits);
  if (!exitKey) {
    return miss(`You can’t go that way. Exits: ${exitList(room) || '(none)'}.`);
  }
  return ok(enterRoom(room.exits[exitKey], world, state), true);
}

/** Waiting or sitting is also how you get through some rooms (the commute). */
export function handleIdle(action: string, world: World, state: GameState): EngineResult {
  const room = world.rooms[state.currentRoom];
  if (room?.exits[action]) return ok(enterRoom(room.exits[action], world, state), true);
  return ok([world.idle ?? 'Time passes.']);
}
