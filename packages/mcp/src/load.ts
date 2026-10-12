import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { extname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { World } from '@brass-lantern/engine';
import { createJiti } from 'jiti';
import { createJiti as createNativeJiti } from 'jiti/native';

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

/**
 * jiti hands native ES modules (.mjs, and .js in a "type": "module" package) to Node's loader,
 * which caches by URL, so jiti's own moduleCache: false can't refresh them. Those files are
 * imported natively under a unique ?bl= query instead, and this resolve hook carries the query
 * onto every file they import by a relative or absolute specifier, so a helper edit is seen too.
 * Bare specifiers (packages) are never touched, whatever their real path: a symlinked package
 * (workspaces, npm link) has no /node_modules/ in its resolved URL, and re-instantiating it per
 * load would leak its whole graph. So packages stay cached and are not reloaded; each call keeps
 * one generation of the world's own project files for the life of the process. The hook only
 * touches modules whose importer carries the query; nothing else in the process is affected.
 */
const FRESH_HOOK = `
export async function resolve(specifier, context, next) {
  const result = await next(specifier, context);
  const parent = context.parentURL;
  const query = parent && /[?&]bl=\\d+/.exec(parent);
  if (query && /^(\\.{1,2}\\/|\\/|file:)/.test(specifier) && result.url.startsWith('file:') && !result.url.includes('?')) {
    return { ...result, url: result.url + '?' + query[0].replace(/^&/, '') };
  }
  return result;
}`;
// jiti/native is a plain import() living in node_modules, so a bundler or test runner (Vitest's
// module runner rewrites an import() in our own source) can't route it around the loader hook.
const native = createNativeJiti(import.meta.url);
let hookRegistered = false;
let generation = 0;

async function importNativeFresh(file: string): Promise<Record<string, unknown>> {
  if (!hookRegistered) {
    register(`data:text/javascript,${encodeURIComponent(FRESH_HOOK)}`);
    hookRegistered = true;
  }
  return (await native.import(`${pathToFileURL(file).href}?bl=${++generation}`)) as Record<string, unknown>;
}

function jitiImport(file: string): Promise<unknown> {
  return createJiti(import.meta.url, { moduleCache: false, fsCache: false, tryNative: false }).import(file);
}

/** Native and fresh; ES syntax in a CommonJS-typed .js falls back to jiti. */
async function importModule(file: string): Promise<unknown> {
  try {
    return await importNativeFresh(file);
  } catch (error) {
    // jiti only for what it exists for: ES syntax in a .js of a CommonJS-typed package.
    // Anything else (a throw at top level, a real syntax error) is Node's error to report.
    if (error instanceof SyntaxError && /import statement outside a module|Unexpected token 'export'|Cannot use 'import\.meta'/.test(error.message)) {
      return jitiImport(file);
    }
    throw error;
  }
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
    mod = (await (extname(file) === '.mjs' || extname(file) === '.js' ? importModule(file) : jitiImport(file))) as Record<string, unknown>;
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
