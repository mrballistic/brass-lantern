import { resolveEngine, type Engine, type ResolvedEngine } from './engine.ts';
import { loadWorld, WorldLoadError, type LoadedWorld } from './load.ts';
import { auditReport, header, playReport } from './tools.ts';

/** One audit_world or play call: everything a worker needs, all structured-cloneable. */
export interface Job {
  op: 'audit' | 'play';
  /** The world path as the agent gave it (already checked against the roots). */
  path: string;
  exportName?: string;
  cwd: string;
  commands?: string[];
  seed?: number;
}

/** A tool reply in plain form. */
export interface JobResult {
  text: string;
  isError: boolean;
}

/**
 * Loads the world and its engine and runs the report; any failure becomes an error result. The
 * worker calls this with the engine it imported; it runs the world's code in whatever thread
 * calls it.
 */
export async function runJob(job: Job, bundled: Engine): Promise<JobResult> {
  let loaded: LoadedWorld;
  try {
    loaded = await loadWorld(job.path, job.exportName, job.cwd);
  } catch (error) {
    if (error instanceof WorldLoadError) return { text: error.message, isError: true };
    return { text: `The world couldn’t be loaded: ${error instanceof Error ? error.message : String(error)}`, isError: true };
  }
  let resolved: ResolvedEngine | undefined;
  try {
    resolved = await resolveEngine(loaded.file, bundled);
    const text = job.op === 'audit' ? auditReport(loaded, resolved) : playReport(loaded, resolved, job.commands ?? [], job.seed);
    return { text, isError: false };
  } catch (error) {
    const lines = resolved ? [...header(loaded, resolved), ''] : [];
    return { text: `${lines.join('\n')}${lines.length ? '\n' : ''}The engine threw: ${error instanceof Error ? error.message : String(error)}`, isError: true };
  }
}
