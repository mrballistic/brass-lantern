import { afterEach, describe, expect, it, vi } from 'vitest';
import { quietStdout } from '../src/stdio.ts';

describe('quietStdout', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    vi.restoreAllMocks();
  });
  it('sends console.log, info, debug and warn to stderr, never stdout', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => true);
    restore = quietStdout();
    console.log('a');
    console.info('b');
    console.debug('c');
    console.warn('d');
    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(4);
  });
  it('restores the console', () => {
    const before = console.log;
    quietStdout()();
    expect(console.log).toBe(before);
  });
});
