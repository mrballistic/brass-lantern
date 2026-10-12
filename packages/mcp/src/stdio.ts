import { Console } from 'node:console';
import { resolve } from 'node:path';

/**
 * Stdout carries the MCP protocol, so a world's console output (at load or while a script runs)
 * would corrupt it. Swaps the global console for one whose stdout and stderr are both
 * process.stderr, so every method (log, dir, table, trace, …) lands there; the SDK transport
 * writes through process.stdout.write directly, so it is unaffected. Returns a function that
 * puts the original console back.
 */
export function quietStdout(): () => void {
  const saved = globalThis.console;
  globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
  return () => {
    globalThis.console = saved;
  };
}

/**
 * The directories worlds may load from: `cwd`, plus each `--root <dir>` (repeatable), resolved
 * against `cwd`. A trailing `--root` with no directory is ignored, with a warning through `warn`.
 */
export function parseRoots(args: readonly string[], cwd: string, warn: (message: string) => void = (m) => process.stderr.write(`${m}\n`)): string[] {
  const roots = [cwd];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--root') continue;
    const dir = args[i + 1];
    if (dir === undefined) warn('brass-lantern-mcp: --root needs a directory; ignored');
    else roots.push(resolve(cwd, dir));
    i += 1;
  }
  return roots;
}

/**
 * How long one audit_world or play call may run, in milliseconds: `--timeout <seconds>` (the last
 * one wins), else 10 s. A missing, non-numeric or non-positive value is ignored with a warning;
 * one past setTimeout's limit (2147483 s, about 24.8 days) is capped at it, with a warning.
 */
export function parseTimeout(args: readonly string[], warn: (message: string) => void = (m) => process.stderr.write(`${m}\n`)): number {
  const DEFAULT = 10_000;
  const MAX_MS = 2_147_483_647;
  let ms = DEFAULT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--timeout') continue;
    const value = args[i + 1];
    const seconds = value === undefined || value.trim() === '' ? NaN : Number(value);
    if (Number.isFinite(seconds) && seconds > 0) {
      ms = Math.min(seconds * 1000, MAX_MS);
      if (seconds * 1000 > MAX_MS) warn(`brass-lantern-mcp: --timeout is capped at ${Math.floor(MAX_MS / 1000)} seconds`);
    } else warn(`brass-lantern-mcp: --timeout needs a positive number of seconds; using ${DEFAULT / 1000}`);
    i += 1;
  }
  return ms;
}

/**
 * A world can throw after its tool call has returned (a timer, a stray promise). Node's default
 * would end the server mid-session; instead, log the error to stderr and keep serving. Returns a
 * function that removes the handlers.
 */
export function keepRunningOnCrash(log: (...args: unknown[]) => void = (...args) => console.error(...args)): () => void {
  const onException = (error: Error) => log('brass-lantern-mcp: uncaught exception:', error);
  const onRejection = (reason: unknown) => log('brass-lantern-mcp: unhandled rejection:', reason);
  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onRejection);
  return () => {
    process.off('uncaughtException', onException);
    process.off('unhandledRejection', onRejection);
  };
}
