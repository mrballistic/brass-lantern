// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGameContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { IndexedDbShelf } from '@/zmachine/shelf';
import { fixtureWorld } from '../fixtures/world';

const OPTIONS = {
  terminalName: 'TEST TERMINAL',
  storagePrefix: 'test',
  cartridges: [
    { kind: 'world' as const, id: 'house', title: 'TEST HOUSE', world: fixtureWorld, saveKey: 'test:save' },
    { kind: 'zcode' as const, id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' },
  ],
};
const ctx = createGameContext(OPTIONS);
const session = () => useSession(ctx);
const { useZGameStore } = ctx;
const useShelf = (s: IndexedDbShelf) => ctx.shelf.use(s);

const zork = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));
const file = (bytes: Uint8Array, name: string) => new File([bytes], name);
const texts = (lines: { text: string }[]) => lines.map((l) => l.text);
const ZORK_ID = 'local-r119-880429-bf44';

let n = 0;

describe('stories loaded from the player’s computer', () => {
  let init: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    useShelf(new IndexedDbShelf(`shelf-session-${++n}`));
    init = vi.spyOn(useZGameStore(), 'initialize').mockResolvedValue();
  });

  it('the menu says how to load one', async () => {
    const s = session();
    await s.boot();
    expect(texts(s.output.value)).toContain(
      '[LOAD plays a Z-machine story file from your computer. It stays in this browser; nothing is uploaded.]',
    );
  });

  it('LOAD at the menu asks the terminal for a file', async () => {
    const s = session();
    await s.boot();
    expect(s.wantsFile('load')).toBe(true);
    expect(s.wantsFile(' LOAD ')).toBe(true);
    expect(s.wantsFile('1')).toBe(false);
    await s.submit('load');
    expect(texts(s.output.value).at(-1)).toBe('[Choose a story file: .z3, .z5, .z8 or .zblorb.]');
    // Not in a game: there LOAD belongs to the game.
    await s.submit('1');
    expect(s.wantsFile('load')).toBe(false);
  });

  it('a loaded story joins the menu as a cartridge and starts', async () => {
    const s = session();
    await s.boot();
    await s.loadFile(file(zork, 'zork1.z3'));
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ id: ZORK_ID, title: 'ZORK1', local: true }));
    expect(s.mode.value).toBe('zcode');
    expect(s.title.value).toBe('ZORK1');
    await s.submit('eject');
    expect(texts(s.output.value)).toContain('  3  ZORK1        Z-machine v3   yours');
    expect(texts(s.output.value)).toContain('[REMOVE and a number takes one of yours off the shelf.]');
  });

  it('it survives a reload, and resumes if it has a game in progress', async () => {
    const s = session();
    await s.boot();
    await s.loadFile(file(zork, 'zork1.z3'));
    localStorage.setItem(`test:z:${ZORK_ID}:transcript`, '[]');

    setActivePinia(createPinia());
    const init2 = vi.spyOn(useZGameStore(), 'initialize').mockResolvedValue();
    const again = session();
    await again.boot();
    expect(again.mode.value).toBe('zcode');
    expect(init2).toHaveBeenCalledWith(expect.objectContaining({ id: ZORK_ID }));
  });

  it('loading the same story twice keeps one copy', async () => {
    const s = session();
    await s.boot();
    await s.loadFile(file(zork, 'zork1.z3'));
    await s.submit('eject');
    await s.loadFile(file(zork, 'renamed.z3'));
    expect(init).toHaveBeenLastCalledWith(expect.objectContaining({ id: ZORK_ID, title: 'ZORK1' }));
    await s.submit('eject');
    expect(texts(s.output.value).filter((t) => t.endsWith('   yours'))).toHaveLength(1);
  });

  it('REMOVE takes a loaded story off the shelf, and only a loaded one', async () => {
    const s = session();
    await s.boot();
    await s.submit('remove 3');
    expect(texts(s.output.value).at(-1)).toBe('[There’s nothing on your shelf to remove.]');
    await s.loadFile(file(zork, 'zork1.z3'));
    await s.submit('eject');
    await s.submit('remove 1');
    expect(texts(s.output.value).at(-1)).toBe('[Only stories you loaded can be removed: REMOVE 3.]');
    await s.submit('remove 3');
    expect(texts(s.output.value)).toContain('[Removed ZORK1. Its saved games stay, in case you load it again.]');
    expect(texts(s.output.value)).not.toContain('  3  ZORK1        Z-machine v3   yours');
    await s.submit('3');
    expect(texts(s.output.value).at(-1)).toBe('[Type a number from 1 to 2.]');
  });

  it('explains files it can’t play, and stays at the menu', async () => {
    const s = session();
    await s.boot();
    await s.loadFile(file(new TextEncoder().encode('just some notes, not a game'), 'notes.txt'));
    expect(texts(s.output.value).at(-1)).toBe('[notes.txt isn’t a Z-machine story file.]');
    await s.loadFile(file(new Uint8Array([0x47, 0x6c, 0x75, 0x6c, 0, 3, 1, 0]), 'game.ulx'));
    expect(texts(s.output.value).at(-1)).toBe(
      '[game.ulx is a Glulx game. Brass Lantern plays Z-machine story files: .z3, .z5, .z8 or .zblorb.]',
    );
    const v6 = zork.slice();
    v6[0] = 6;
    await s.loadFile(file(v6, 'arthur.z6'));
    expect(texts(s.output.value).at(-1)).toBe('[arthur.z6 is a version 6 story file; versions 3, 4, 5 and 8 work here.]');
    expect(s.mode.value).toBe('menu');
    expect(init).not.toHaveBeenCalled();
  });

  it('still plays a story the browser won’t store, until the next reload', async () => {
    useShelf(new IndexedDbShelf('nowhere', null));
    const s = session();
    await s.boot();
    await s.loadFile(file(zork, 'zork1.z3'));
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ id: ZORK_ID }));
    expect(texts(s.output.value)).toContain('[This browser wouldn’t keep ZORK1, so it’s here only until you reload.]');
  });
});
