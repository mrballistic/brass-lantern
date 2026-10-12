import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type * as EngineModule from '@brass-lantern/engine';

/** What the tools use of an engine. The parser helpers are optional: older engines may lack them. */
export type Engine = Pick<typeof EngineModule, 'createGame' | 'auditWorld' | 'ENGINE_VERSION'> &
  Partial<Pick<typeof EngineModule, 'fallbackParse' | 'splitCommands' | 'andNames' | 'currentScore'>>;

export interface ResolvedEngine {
  engine: Engine;
  version: string;
  source: 'project' | 'bundled';
  /** Why the project’s engine wasn’t used, when it was found but couldn’t be. */
  note?: string;
}

/**
 * The engine the world’s own project resolves (so a 2.2 project is audited by 2.2’s rules),
 * else `bundled`. A project engine that can’t be imported, or lacks the API, falls back with a note.
 */
export async function resolveEngine(worldFile: string, bundled: Engine): Promise<ResolvedEngine> {
  const fallback = (note?: string): ResolvedEngine => ({ engine: bundled, version: bundled.ENGINE_VERSION, source: 'bundled', ...(note ? { note } : {}) });
  let entry: string;
  try {
    entry = createRequire(worldFile).resolve('@brass-lantern/engine');
  } catch {
    return fallback();
  }
  try {
    const mod = (await import(pathToFileURL(entry).href)) as Partial<Engine>;
    if (typeof mod.createGame !== 'function' || typeof mod.auditWorld !== 'function') {
      return fallback(`the project’s @brass-lantern/engine doesn’t export createGame and auditWorld; used the bundled engine`);
    }
    return { engine: mod as Engine, version: typeof mod.ENGINE_VERSION === 'string' ? mod.ENGINE_VERSION : 'unknown', source: 'project' };
  } catch (error) {
    return fallback(`couldn’t load the project’s @brass-lantern/engine (${error instanceof Error ? error.message : String(error)}); used the bundled engine`);
  }
}
