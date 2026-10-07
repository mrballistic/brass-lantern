import type { GameOptions } from '../../src/options';
import { fixtureConfig } from '../../../engine/tests/fixtures/world';

// The engine's fixture world, shared with the engine's tests; the library
// options to play it live here, beside the package that defines GameOptions.
export { fixtureConfig, fixtureWorld } from '../../../engine/tests/fixtures/world';

/** The fixture game as library options: createGameStore(fixtureOptions), <BrassLantern :options>. */
export const fixtureOptions: GameOptions = {
  cartridges: fixtureConfig.cartridges,
  terminalName: fixtureConfig.appName,
  storagePrefix: fixtureConfig.storagePrefix,
  intentEndpoint: '/api/parse-intent',
  version: '1.2.3',
};
