import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepRunningOnCrash, parseRoots, parseTimeout, quietStdout } from '../src/stdio.ts';

describe('quietStdout', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.restoreAllMocks();
  });
  it('sends every console method to stderr, never stdout', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    restore = quietStdout();
    console.log('a');
    console.info('b');
    console.debug('c');
    console.warn('d');
    console.dir({ a: 1 });
    console.dirxml({ b: 2 });
    console.table([1]);
    console.trace('t');
    const written = err.mock.calls.map((c) => String(c[0])).join('');
    restore();
    restore = undefined;
    expect(out).not.toHaveBeenCalled();
    expect(written).toContain('a');
    expect(written).toContain('{ a: 1 }');
  });
  it('restores the console', () => {
    const before = console;
    const before_log = console.log;
    quietStdout()();
    expect(console).toBe(before);
    expect(console.log).toBe(before_log);
  });
});

describe('parseRoots', () => {
  it('starts with cwd and adds each --root, resolved against it', () => {
    const warn = vi.fn();
    expect(parseRoots(['--root', 'a', '--root', '/b'], '/w', warn)).toEqual(['/w', '/w/a', '/b']);
    expect(warn).not.toHaveBeenCalled();
  });
  it('a --root with no directory is ignored with a warning', () => {
    const warn = vi.fn();
    expect(parseRoots(['--root'], '/w', warn)).toEqual(['/w']);
    expect(warn).toHaveBeenCalledWith('brass-lantern-mcp: --root needs a directory; ignored');
  });
});

describe('keepRunningOnCrash', () => {
  it('logs an uncaught exception or unhandled rejection to stderr and keeps the process alive', () => {
    const before = { ex: process.listenerCount('uncaughtException'), rej: process.listenerCount('unhandledRejection') };
    const log = vi.fn();
    const remove = keepRunningOnCrash(log);
    expect(process.listenerCount('uncaughtException')).toBe(before.ex + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(before.rej + 1);
    const handlers = { ex: process.listeners('uncaughtException').at(-1)!, rej: process.listeners('unhandledRejection').at(-1)! };
    (handlers.ex as (e: Error) => void)(new Error('late boom'));
    (handlers.rej as (r: unknown) => void)('nope');
    remove();
    expect(process.listenerCount('uncaughtException')).toBe(before.ex);
    expect(process.listenerCount('unhandledRejection')).toBe(before.rej);
    expect(log).toHaveBeenNthCalledWith(1, 'brass-lantern-mcp: uncaught exception:', expect.objectContaining({ message: 'late boom' }));
    expect(log).toHaveBeenNthCalledWith(2, 'brass-lantern-mcp: unhandled rejection:', 'nope');
  });
});

describe('parseTimeout', () => {
  it('defaults to 10 s', () => {
    expect(parseTimeout([], vi.fn())).toBe(10_000);
  });
  it('reads --timeout <seconds> as milliseconds', () => {
    const warn = vi.fn();
    expect(parseTimeout(['--root', 'x', '--timeout', '2.5'], warn)).toBe(2500);
    expect(parseTimeout(['--timeout', '30'], warn)).toBe(30_000);
    expect(warn).not.toHaveBeenCalled();
  });
  it('an invalid or missing value is ignored with a warning', () => {
    for (const args of [['--timeout'], ['--timeout', '0'], ['--timeout', '-1'], ['--timeout', 'soon'], ['--timeout', 'Infinity']]) {
      const warn = vi.fn();
      expect(parseTimeout(args, warn)).toBe(10_000);
      expect(warn).toHaveBeenCalledWith('brass-lantern-mcp: --timeout needs a positive number of seconds; using 10');
    }
  });
  it('a value above 2147483 s (setTimeout’s limit) is capped with a warning', () => {
    const warn = vi.fn();
    expect(parseTimeout(['--timeout', '3000000'], warn)).toBe(2_147_483_647);
    expect(warn).toHaveBeenCalledWith('brass-lantern-mcp: --timeout is capped at 2147483 seconds');
    const quiet = vi.fn();
    expect(parseTimeout(['--timeout', '2147483'], quiet)).toBe(2_147_483_000);
    expect(quiet).not.toHaveBeenCalled();
  });
});
