import { existsSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import type { World } from '@brass-lantern/engine';
import { createJiti } from 'jiti';

/** The module kinds a world can be written as. */
export const WORLD_EXTENSIONS: readonly string[] = ['.ts', '.mts', '.js', '.mjs'];

/** A world file that couldn't be loaded: its message is the tool’s reply. */
export class WorldLoadError extends Error {}

/** A world is an object with rooms, items, characters and a starting room. */
export function isWorldShaped(value: unknown): value is World {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return ['rooms', 'items', 'npcs'].every((key) => typeof v[key] === 'object' && v[key] !== null) && typeof v.startRoom === 'string';
}

export interface LoadedWorld {
  world: World;
  /** The absolute path loaded. */
  file: string;
  /** The export the world came from ('default' for a default export). */
  exportName: string;
}

/**
 * Loads a world module fresh (no module or transpile cache, so an edit is seen on the next call),
 * resolving `path` against `cwd`. The export is the one named, else a world default export, else
 * the only world-shaped named export. Every failure is a WorldLoadError whose message starts with
 * the path as given.
 */
export async function loadWorld(path: string, exportName: string | undefined, cwd: string): Promise<LoadedWorld> {
  const file = isAbsolute(path) ? path : resolve(cwd, path);
  if (!WORLD_EXTENSIONS.includes(extname(file))) throw new WorldLoadError(`${path}: a world is a .ts, .mts, .js or .mjs module`);
  if (!existsSync(file)) throw new WorldLoadError(`${path}: no such file (looked in ${cwd})`);
  let mod: Record<string, unknown>;
  try {
    mod = (await createJiti(import.meta.url, { moduleCache: false, fsCache: false }).import(file)) as Record<string, unknown>;
  } catch (error) {
    throw new WorldLoadError(`${path}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
  const exportsList = () => Object.keys(mod).join(', ') || 'none';
  if (exportName !== undefined) {
    if (!(exportName in mod)) throw new WorldLoadError(`${path}: no export “${exportName}” (exports: ${exportsList()})`);
    const value = mod[exportName];
    if (!isWorldShaped(value)) throw new WorldLoadError(`${path}: export “${exportName}” isn’t a world (a world has rooms, items, npcs and startRoom)`);
    return { world: value, file, exportName };
  }
  if (isWorldShaped(mod.default)) return { world: mod.default, file, exportName: 'default' };
  const candidates = Object.keys(mod).filter((key) => key !== 'default' && isWorldShaped(mod[key]));
  if (candidates.length === 1) return { world: mod[candidates[0]] as World, file, exportName: candidates[0] };
  if (candidates.length === 0) throw new WorldLoadError(`${path}: no world-shaped export (exports: ${exportsList()})`);
  throw new WorldLoadError(`${path}: several worlds (${candidates.join(', ')}); name one with “export”`);
}
