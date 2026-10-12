import { Worker } from 'node:worker_threads';
import type { Job, JobResult } from './job.ts';

/** How long a world gets by default: 10 s. */
export const DEFAULT_TIMEOUT_MS = 10_000;

// From source (tests, the repo) the worker is TypeScript and the engine resolves to its source;
// published, both are plain JavaScript in dist/.
const fromSource = import.meta.url.endsWith('.ts');
const WORKER_URL = new URL(fromSource ? './worker.ts' : './worker.js', import.meta.url);
const EXEC_ARGV = fromSource ? ['--import', 'tsx', '--conditions=@brass-lantern/source'] : [];

/** How long a worker that has answered may linger before it is stopped. */
const GRACE_MS = 500;

const seconds = (ms: number) => String(Number((ms / 1000).toFixed(3)));

/**
 * Runs a job in a fresh worker thread, so a world that loops forever, calls process.exit(),
 * crashes or writes to stdout can't freeze, end or corrupt the server. The worker's stdout and
 * stderr go to this process's stderr. Never rejects: every outcome is a result.
 */
export function runInWorker(job: Job, { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<JobResult> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_URL, { workerData: job, stdout: true, stderr: true, execArgv: EXEC_ARGV });
    worker.stdout.pipe(process.stderr, { end: false });
    worker.stderr.pipe(process.stderr, { end: false });
    let settled = false;
    const settle = (result: JobResult, grace = GRACE_MS) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
      // A world may leave timers running: once the answer is in, the worker gets a moment to exit
      // on its own (flushing its output to stderr), then goes.
      if (grace === 0) void worker.terminate();
      else setTimeout(() => void worker.terminate(), grace).unref();
    };
    const timer = setTimeout(
      () => settle({ isError: true, text: `The world didn’t finish within ${seconds(timeoutMs)} s (a script may loop forever). Raise the limit with --timeout <seconds>.` }, 0),
      timeoutMs,
    );
    worker.on('message', (result: Partial<JobResult> | null) =>
      settle(typeof result?.text === 'string' ? { text: result.text, isError: result.isError === true } : { isError: true, text: 'The world crashed: its worker sent something other than a result.' }),
    );
    worker.on('error', (error) => settle({ isError: true, text: `The world crashed: ${error instanceof Error ? error.message : String(error)}` }));
    worker.on('exit', (code) => settle({ isError: true, text: `The world ended the process (exit code ${code}) before answering; a world shouldn’t call process.exit().` }));
  });
}
