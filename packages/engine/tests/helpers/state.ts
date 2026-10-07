import { initialState } from '../../src/engine/engine';
import { moveItem, PLAYER } from '../../src/engine/model';
import type { GameState } from '../../src/types/game';
import type { World } from '../../src/types/world';

/** A fresh game in `room`, carrying `items`. */
export function stateWith(world: World, opts: { room?: string; carrying?: string[]; flags?: string[] } = {}): GameState {
  const state = initialState(world);
  if (opts.room) state.currentRoom = opts.room;
  for (const id of opts.carrying ?? []) moveItem(state, id, PLAYER);
  for (const f of opts.flags ?? []) state.flags[f] = true;
  return state;
}

/** Put items in the player's hands. */
export function carry(state: GameState, ...ids: string[]): void {
  for (const id of ids) moveItem(state, id, PLAYER);
}
