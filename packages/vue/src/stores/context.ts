import { inject, type InjectionKey } from 'vue';
import type { GameOptions } from '../options.ts';
import { createCatalog, type Catalog } from './catalog.ts';
import { createCartridgeStore, createLocalShelf, type LocalShelf } from './cartridges.ts';
import { createGameStore } from './game.ts';
import { createZGameStore } from './zgame.ts';

/** Everything one game on the page needs: its options, keys, shelf and stores. */
export interface GameContext {
  options: GameOptions;
  catalog: Catalog;
  shelf: LocalShelf;
  useGameStore: ReturnType<typeof createGameStore>;
  useZGameStore: ReturnType<typeof createZGameStore>;
  useCartridgeStore: ReturnType<typeof createCartridgeStore>;
}

/** How `<BrassLantern>` hands its game to the terminal inside it. */
export const GAME_CONTEXT: InjectionKey<GameContext> = Symbol('brass-lantern game');

export function createGameContext(options: GameOptions): GameContext {
  if (!options.storagePrefix) throw new Error('A game needs a storagePrefix.');
  const shelf = createLocalShelf(options.storagePrefix);
  return {
    options,
    catalog: createCatalog(options),
    shelf,
    useGameStore: createGameStore(options),
    useZGameStore: createZGameStore(options, shelf),
    useCartridgeStore: createCartridgeStore(options, shelf),
  };
}

/** The game of the `<BrassLantern>` this component is in. */
export function useGameContext(): GameContext {
  const ctx = inject(GAME_CONTEXT, null);
  if (!ctx) throw new Error('This component needs a game: put it inside <BrassLantern>.');
  return ctx;
}
