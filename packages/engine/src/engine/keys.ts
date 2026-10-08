/**
 * Keys that reach an object's prototype machinery. State maps (flags, vars, itemState, npcs, locations, …)
 * are plain objects saved as JSON, so a world ID or a name from an effect that is one of these must never
 * become a key: `state.itemState['__proto__']` is Object.prototype itself. The audit reports any world
 * that uses one.
 */
export const RESERVED_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

/** May `key` name an entry in a state map? */
export function isSafeKey(key: string): boolean {
  return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}
