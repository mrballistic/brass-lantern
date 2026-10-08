import type { GameState } from '@brass-lantern/engine';

// The vue package's tests reach the engine only by its package name; this is
// its own copy of the engine tests' `carry` (tests/helpers/state.ts there),
// written against GameState's shape: the item's parent becomes the player, and
// it's placed last on the engine's one placing sequence (as moveItem does).

/** Put items in the player's hands. */
export function carry(state: GameState, ...ids: string[]): void {
  for (const id of ids) {
    state.locations[id] = 'player';
    if (state.aboard === id) state.aboard = undefined;
    const next =
      Math.max(0, ...Object.values(state.placed ?? {}), ...Object.values(state.npcs ?? {}).map((n) => n.seq ?? 0)) + 1;
    (state.placed ??= {})[id] = next;
  }
}
