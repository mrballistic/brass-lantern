import type { GameState } from '../types/game.ts';
import type { World } from '../types/world.ts';
import { commandOf } from './scripts.ts';

/**
 * Fills a text's placeholders from the game: `{var:NAME}` (0 when unset) and
 * `{number}` (the number typed, when there is one). Anything else, and a
 * `{number}` with no number, stays as written. Reads only; draws no randomness.
 */
export function expandTemplate(text: string, _world: World, state: GameState): string {
  if (!text.includes('{')) return text;
  return text.replace(/\{(?:var:(\w+)|(number))\}/g, (whole, name?: string, number?: string) => {
    if (name) return String(state.vars?.[name] ?? 0);
    const typed = number ? commandOf(state)?.number : undefined;
    return typed === undefined ? whole : String(typed);
  });
}
