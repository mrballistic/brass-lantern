// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SaveStoreDialog } from '../../src/zmachine/dialog';
import { localStorageSaveStore, type SaveStore } from '../../src/zmachine/save-store';
import { ZMachineSession } from '../../src/zmachine/session';

describe('localStorageSaveStore', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips bytes under prefixed keys, and lists only its own names', () => {
    const store = localStorageSaveStore('p:');
    store.write('b', new Uint8Array([1, 2, 255]));
    store.write('a', new Uint8Array([]));
    localStorage.setItem('other:c', 'x');
    expect(localStorage.getItem('p:b')).not.toBeNull();
    expect(store.read('b')).toEqual(new Uint8Array([1, 2, 255]));
    expect(store.read('a')).toEqual(new Uint8Array([]));
    expect(store.read('missing')).toBeNull();
    expect(store.list()).toEqual(['a', 'b']);
    store.remove('b');
    expect(store.read('b')).toBeNull();
    expect(store.list()).toEqual(['a']);
  });

  it('keeps the browser’s existing layout: files as JSON byte arrays, text as is', () => {
    const store = localStorageSaveStore('p:');
    store.write('file', new Uint8Array([1, 2, 3]));
    expect(localStorage.getItem('p:file')).toBe('[1,2,3]');
    const json = new TextEncoder().encode('{"ram":[1]}');
    store.write('auto', json);
    expect(localStorage.getItem('p:auto')).toBe('{"ram":[1]}');
    expect(store.read('auto')).toEqual(json);
  });

  it('round-trips a binary file that starts with “{” byte for byte', () => {
    const store = localStorageSaveStore('p:');
    // 0x7B is “{”; 0xFF and 0xC3 0x28 are invalid UTF-8.
    const invalid = new Uint8Array([0x7b, 0xff, 0x00, 0xc3, 0x28, 0x7d]);
    store.write('bin', invalid);
    expect(localStorage.getItem('p:bin')).toBe(JSON.stringify(Array.from(invalid)));
    expect(store.read('bin')).toEqual(invalid);
    // Valid UTF-8 but not a JSON object: still bytes.
    const notJson = new TextEncoder().encode('{not json');
    store.write('text', notJson);
    expect(localStorage.getItem('p:text')!.startsWith('[')).toBe(true);
    expect(store.read('text')).toEqual(notJson);
  });

  it('treats unreadable contents as missing', () => {
    localStorage.setItem('p:bad', 'not json');
    expect(localStorageSaveStore('p:').read('bad')).toBeNull();
  });
});

describe('a session over a custom SaveStore', () => {
  it('sends a SAVE to the store it was given', async () => {
    const files = new Map<string, Uint8Array>();
    const store: SaveStore = {
      list: () => [...files.keys()],
      read: (n) => files.get(n) ?? null,
      write: (n, d) => void files.set(n, d),
      remove: (n) => void files.delete(n),
    };
    const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));
    let waiting = false;
    const lines: string[] = [];
    const session = new ZMachineSession(story, new SaveStoreDialog(store), {
      onLines: (l) => lines.push(...l),
      onStatus: () => {},
      onWaiting: () => {
        waiting = true;
      },
      onExit: () => {},
      onError: (m) => {
        throw new Error(m);
      },
    });
    const turn = async (text: string) => {
      const start = Date.now();
      while (!waiting) {
        if (Date.now() - start > 4000) throw new Error('timed out');
        await new Promise((r) => setTimeout(r, 5));
      }
      waiting = false;
      session.submit(text);
    };
    session.start();
    await turn('save');
    await turn('slot');
    const start = Date.now();
    while (![...files.keys()].some((k) => k.includes('save') && k.endsWith('slot')) && Date.now() - start < 4000) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect([...files.keys()].some((k) => k.includes('save') && k.endsWith('slot'))).toBe(true);
    expect(lines.join('\n')).toContain('Ok.');
  });
});
