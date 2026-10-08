import { describe, expect, it } from 'vitest';
import { MISSING_IFVMS, requireIfvms } from '../../src/zmachine/require-ifvms';
import * as runtime from '../../src/zmachine/index';
import * as session from '../../src/zmachine/session';

describe('the ifvms guard', () => {
  it('passes when ifvms is installed', async () => {
    await expect(requireIfvms()).resolves.toBeUndefined();
  });

  it('names the missing peer and how to install it, keeping the resolver’s error as the cause', async () => {
    const resolverError = new Error("Cannot find package 'ifvms'");
    const failure = requireIfvms(() => Promise.reject(resolverError));
    await expect(failure).rejects.toThrow(MISSING_IFVMS);
    await expect(failure).rejects.toMatchObject({ cause: resolverError });
    expect(MISSING_IFVMS).toMatch(/\bifvms\b/);
    expect(MISSING_IFVMS).toMatch(/npm install ifvms/);
  });
});

describe('the entries', () => {
  it('./zmachine has the shelf, saves and story-file helpers, and no session (that is ./zmachine/session)', () => {
    expect(Object.keys(runtime).sort()).toEqual(['IndexedDbShelf', 'SaveStoreDialog', 'localStorageSaveStore', 'readStoryFile']);
    expect('ZMachineSession' in runtime).toBe(false);
  });

  it('./zmachine/session’s Node entry re-exports the session', async () => {
    const node = await import('../../src/zmachine/session-node');
    expect(Object.keys(node)).toEqual(Object.keys(session));
    expect(node.ZMachineSession).toBe(session.ZMachineSession);
  });
});
