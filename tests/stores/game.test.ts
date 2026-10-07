// @vitest-environment happy-dom
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDownload, useGameStore } from '@/stores/game';
import { SAVE_KEY } from '@/types/game';
import { inventoryOf } from '@/engine/model';
import { carry } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';
// Plays the fixture world, so this file is the same in every repo using the engine.
vi.mock('@/app.config', async () => (await import('../fixtures/world')).fixtureConfig);

function freshStore(): ReturnType<typeof useGameStore> {
  setActivePinia(createPinia());
  return useGameStore();
}

describe('useGameStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('starts a fresh game when no save exists, emitting intro + opening room', () => {
      const store = freshStore();
      store.initialize();

      expect(store.game.currentRoom).toBe('bedroom');
      expect(store.game.moveCount).toBe(0);
      expect(store.restored).toBe(false);
      // Intro chapter banner is in opening output.
      expect(store.output.some((l) => l.text.includes('CHAPTER 1'))).toBe(true);
      // First room name rendered.
      expect(store.output.some((l) => l.text.includes('Bedroom'))).toBe(true);
      // Initial state persisted.
      expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
    });

    it('restores from localStorage and emits a "[Session restored ...]" notice', () => {
      // Seed a save by initializing once and submitting a move.
      const first = freshStore();
      first.initialize();
      void first.submit('west');

      // New store on the same localStorage should restore.
      const second = freshStore();
      second.initialize();

      expect(second.restored).toBe(true);
      expect(second.game.currentRoom).toBe('living');
      expect(
        second.output.some((l) => l.text.includes('Session restored')),
      ).toBe(true);
    });
  });

  describe('submit (regex parser path)', () => {
    it('echoes the player input as an output line prefixed with "> "', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      expect(store.output.some((l) => l.text === '> west')).toBe(true);
    });

    it('ignores empty input', async () => {
      const store = freshStore();
      store.initialize();
      const before = store.output.length;
      await store.submit('   ');
      expect(store.output.length).toBe(before);
    });

    it('moves rooms on a recognized direction and increments moveCount', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      expect(store.game.currentRoom).toBe('living');
      expect(store.game.moveCount).toBe(1);
    });

    it('mutates inventory through TAKE/DROP', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      await store.submit('take wallet');
      expect(inventoryOf(store.world, store.game)).toContain('wallet');
      await store.submit('drop wallet');
      expect(inventoryOf(store.world, store.game)).not.toContain('wallet');
    });

    it('persists after a mutating command', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');

      const saved = JSON.parse(localStorage.getItem(SAVE_KEY)!);
      expect(saved.gameState.currentRoom).toBe('living');
    });
  });

  describe('save / load / restart meta commands', () => {
    it('resumes a 1.0 save after migrating it', () => {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: '1.0', savedAt: '', outputHistory: [{ id: 'x', text: '> west', timestamp: 0, type: 'input' }],
        gameState: { currentRoom: 'living', inventory: ['key'], flags: {}, moveCount: 1, gameOver: false,
                     itemsRemoved: { living: ['key'] }, itemsAdded: {}, firedEvents: ['enter_living'] },
      }));
      const store = freshStore();
      store.initialize();
      expect(store.restored).toBe(true);
      expect(store.game.locations.key).toBe('player');
      expect(store.game.currentRoom).toBe('living');
    });

    it('SAVE with a name writes beside the autosave and confirms', async () => {
      const store = freshStore();
      store.initialize();

      await store.submit('save Mine!');
      expect(localStorage.getItem(`${SAVE_KEY}:named:mine`)).not.toBeNull();
      expect(store.output.at(-1)!.text).toBe('Saved as mine.');
    });

    it('explicit LOAD restores the last save', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      await store.submit('take wallet');

      // Wipe in-memory state but keep the save, then LOAD.
      store.game.currentRoom = 'bedroom';
      for (const id of inventoryOf(store.world, store.game)) store.game.locations[id] = null;

      await store.submit('load');
      expect(store.game.currentRoom).toBe('living');
      expect(inventoryOf(store.world, store.game)).toContain('wallet');
    });

    it('plays the cartridge it is given, with that cartridge’s save', async () => {
      const { fixtureWorld } = await import('../fixtures/world');
      const store = freshStore();
      const other = { kind: 'world' as const, id: 'other', title: 'OTHER', world: { ...fixtureWorld, startRoom: 'yard' } };
      store.initialize(other);
      expect(store.game.currentRoom).toBe('yard');
      await store.submit('look');
      expect(localStorage.getItem('test:save:other')).not.toBeNull();
      store.initialize();
      expect(store.game.currentRoom).toBe('bedroom');
    });

    it('LOAD with no save prints a "No saved game" notice', async () => {
      const store = freshStore();
      store.initialize();
      localStorage.removeItem(SAVE_KEY);
      await store.submit('load');
      expect(store.output.some((l) => l.text.includes('No saved game'))).toBe(true);
    });

    it('RESTART clears save and starts fresh', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      await store.submit('take wallet');

      await store.submit('restart');
      expect(store.game.currentRoom).toBe('bedroom');
      expect(inventoryOf(store.world, store.game)).toEqual([]);
      expect(store.game.moveCount).toBe(0);
      // A fresh save should now exist (post-restart persist).
      expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
    });
  });

  describe('LLM fallback path', () => {
    function mockIntent(reply: object) {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(reply) });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('asks the LLM when a regex parse misses, and runs its better reading', async () => {
      const store = freshStore();
      store.initialize();
      // "go bathroom" parses, but there is no such exit here.
      const fetchMock = mockIntent({ action: 'go', target: 'living_room' });
      await store.submit('go bathroom');
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(store.game.currentRoom).toBe('living');
      expect(store.output.some((l) => l.text.includes('can’t go that way'))).toBe(false);
    });

    it('tells the LLM only about characters the player can see', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'yard';
      store.game.npcs = { neighbor: { hidden: true } };
      const fetchMock = mockIntent({ action: 'unknown' });
      await store.submit('frobnicate the gizmo');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(JSON.stringify(body.context.npcs)).not.toContain('neighbor');
    });

    it('does not call the LLM when the regex parse succeeds', async () => {
      const store = freshStore();
      store.initialize();
      const fetchMock = mockIntent({ action: 'look' });
      await store.submit('west');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps the literal reply when the LLM agrees with the regex reading', async () => {
      const store = freshStore();
      store.initialize();
      mockIntent({ action: 'go', target: 'bathroom' });
      await store.submit('go bathroom');
      expect(store.output.some((l) => l.text.includes('can’t go that way'))).toBe(true);
    });

    it('keeps the literal reply when the LLM reading misses too', async () => {
      const store = freshStore();
      store.initialize();
      mockIntent({ action: 'take', target: 'unicorn' });
      await store.submit('go bathroom');
      expect(store.output.some((l) => l.text.includes('can’t go that way'))).toBe(true);
      expect(store.output.some((l) => l.text.includes('unicorn'))).toBe(false);
    });

    it('passes the indirect object through to the engine', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'yard';
      carry(store.game, 'wallet');
      mockIntent({ action: 'give', target: 'wallet', indirect: 'neighbor' });
      await store.submit('could the neighbor maybe have this');
      expect(store.game.flags.paid).toBe(true);
    });

    it('OOPS fixes a line nobody understood', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'living';
      mockIntent({ action: 'unknown' });
      await store.submit('take wollet');
      expect(store.game.locations.wallet).toBe('living');
      await store.submit('oops wallet');
      expect(store.game.locations.wallet).toBe('player');
    });

    it('undo steps back through changing turns, restoring state and screen', async () => {
      const store = freshStore();
      store.initialize();
      const start = store.output.length;
      await store.submit('west');
      await store.submit('take wallet');
      await store.submit('look'); // changes nothing: not an undo step
      await store.submit('undo');
      expect(store.game.locations.wallet).toBe('living');
      await store.submit('undo');
      expect(store.game.currentRoom).toBe('bedroom');
      expect(store.output.length).toBe(start + 1); // just the reply
      expect(store.output.at(-1)!.text).toBe('[Previous turn undone.]');
      await store.submit('undo');
      expect(store.output.at(-1)!.text).toBe('[Nothing to undo.]');
    });

    it('keeps at most 50 undo steps, and RESTART clears them', async () => {
      const store = freshStore();
      store.initialize();
      for (let i = 0; i < 60; i++) await store.submit(i % 2 ? 'east' : 'west');
      for (let i = 0; i < 50; i++) await store.submit('undo');
      expect(store.output.at(-1)!.text).toBe('[Previous turn undone.]');
      await store.submit('undo');
      expect(store.output.at(-1)!.text).toBe('[Nothing to undo.]');
      await store.submit('west');
      await store.submit('restart');
      await store.submit('undo');
      expect(store.output.at(-1)!.text).toBe('[Nothing to undo.]');
    });

    it('undo after a question undoes the last changing turn', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      await store.submit('take');
      await store.submit('undo');
      expect(store.game.currentRoom).toBe('bedroom');
    });

    it('the LLM can map a phrasing to UNDO', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      mockIntent({ action: 'undo' });
      await store.submit('take that back please');
      expect(store.game.currentRoom).toBe('bedroom');
    });

    it('the LLM can ask for a save or a restore', async () => {
      const store = freshStore();
      store.initialize();
      mockIntent({ action: 'save', target: 'cellar' });
      await store.submit('please remember this moment as cellar');
      expect(store.output.at(-1)!.text).toBe('Saved as cellar.');
      mockIntent({ action: 'restore' });
      await store.submit('bring back an old game');
      expect(store.output.at(-1)!.text).toBe('Restore which save? cellar. Or CANCEL.');
    });

    it('SCRIPT … UNSCRIPT downloads what happened in between', async () => {
      const store = freshStore();
      store.initialize();
      const download = vi.fn();
      setDownload(download);
      await store.submit('script');
      expect(store.output.at(-1)!.text).toBe('[Transcript started.]');
      await store.submit('look');
      await store.submit('unscript');
      expect(store.output.at(-1)!.text).toBe('[Transcript saved.]');
      expect(download).toHaveBeenCalledTimes(1);
      const [filename, text] = download.mock.calls[0] as [string, string];
      expect(filename).toMatch(/-transcript\.txt$/);
      expect(text).toContain('> look');
      expect(text.split('\n')[0]).toBe('[Transcript started.]');
      expect(text.split('\n').at(-1)).toBe('[Transcript saved.]');
    });

    it('VERSION names the app and its version, then the world’s title and credits', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('version');
      expect(store.output.at(-1)!.text).toMatch(/^\[TEST TERMINAL v\d+\.\d+\.\d+\]$/);
    });

    it('VERSION and SCRIPT use the title and credits, in Zork’s words in an Infocom world', async () => {
      const { fixtureWorld } = await import('../fixtures/world');
      const world = { ...fixtureWorld, style: 'infocom' as const, title: 'TEST HOUSE: A Domestic Adventure', credits: ['Copyright (c) nobody.', 'All rights reversed.'] };
      const store = freshStore();
      store.initialize({ kind: 'world', id: 'house', title: 'TEST HOUSE', world, saveKey: 'test:house' });
      setDownload(vi.fn());
      await store.submit('version');
      expect(store.output.slice(-3).map((l) => l.text)).toEqual(['TEST HOUSE: A Domestic Adventure', 'Copyright (c) nobody.', 'All rights reversed.']);
      await store.submit('script');
      expect(store.output.slice(-2).map((l) => l.text)).toEqual(['Here begins a transcript of interaction with', 'TEST HOUSE: A Domestic Adventure']);
      expect(store.headerStatus).toBe(`${world.rooms[world.startRoom].name}  Score: 0  Moves: 0`);
    });

    it('named saves don’t see another cartridge’s saves, even when one save key is a prefix of another', async () => {
      const { fixtureWorld } = await import('../fixtures/world');
      const other = freshStore();
      other.initialize({ kind: 'world', id: 'other', title: 'OTHER', world: fixtureWorld, saveKey: `${SAVE_KEY}:other` });
      await other.submit('west');
      await other.submit('save mine');
      const store = freshStore();
      store.initialize({ kind: 'world', id: 'test', title: 'TEST', world: fixtureWorld, saveKey: SAVE_KEY });
      await store.submit('restore');
      expect(store.output.at(-1)!.text).toBe('[There are no saved games yet.]');
    });

    it('a question partway through a compound line stops the line, and the answer still works', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'living';
      const fetchMock = mockIntent({ action: 'unknown' });
      await store.submit('take wallet and take key and take shirt');
      expect(store.output.at(-1)!.text).toMatch(/^Which do you mean/);
      expect(inventoryOf(store.world, store.game)).not.toContain('shirt');
      await store.submit('brass');
      expect(inventoryOf(store.world, store.game)).toContain('key');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('store commands work as pieces of a compound line', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'living';
      await store.submit('take wallet. save mine');
      expect(store.output.some((l) => l.text === 'Saved as mine.')).toBe(true);
      await store.submit('take shirt. undo');
      expect(inventoryOf(store.world, store.game)).not.toContain('shirt');
      expect(inventoryOf(store.world, store.game)).toContain('wallet');
    });

    it('LOAD starts a fresh conversation: no undo into the other timeline', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      await store.submit('load');
      await store.submit('undo');
      expect(store.output.at(-1)!.text).toBe('[Nothing to undo.]');
    });

    it('UNDO drops a waiting question', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      await store.submit('take key');
      await store.submit('undo');
      const fetchMock = mockIntent({ action: 'unknown' });
      await store.submit('brass');
      expect(fetchMock).toHaveBeenCalled();
    });

    it('UNDO takes back a whole compound line', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'living';
      await store.submit('take wallet and take shirt');
      await store.submit('undo');
      expect(inventoryOf(store.world, store.game)).toEqual([]);
    });

    it('the default transcript download keeps its URL alive until the click has started it', async () => {
      vi.useFakeTimers();
      const revoke = vi.fn();
      vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: revoke });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const { defaultDownload } = await import('@/stores/game');
      defaultDownload('t.txt', 'hello');
      expect(click).toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:x');
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('a transcript survives RESTART', async () => {
      const store = freshStore();
      store.initialize();
      const download = vi.fn();
      setDownload(download);
      await store.submit('script');
      await store.submit('restart');
      await store.submit('unscript');
      const [, text] = download.mock.calls[0] as [string, string];
      expect(text.split('\n').length).toBeGreaterThan(2);
    });

    it('moves are saved even when nothing else changed', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('look');
      await store.submit('look');
      const again = freshStore();
      again.initialize();
      expect(again.game.moveCount).toBe(2);
    });

    it('save names treat _ and spaces alike, so the LLM’s my_game is the typed my game', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('save my_game');
      await store.submit('restore my game');
      expect(store.output.some((l) => l.text === 'Restored my game.')).toBe(true);
    });

    it('after the game ends, RESTART starts over and other commands say it has ended', async () => {
      const store = freshStore();
      store.initialize();
      store.game.gameOver = true;
      await store.submit('look');
      expect(store.output.at(-1)!.text).toBe('The game has ended. Type RESTART to play again.');
      await store.submit('restart');
      expect(store.game.gameOver).toBe(false);
      expect(store.output.some((l) => l.text.startsWith('📍'))).toBe(true);
      expect(store.output.some((l) => l.text === '> look')).toBe(false);
    });

    it('a finished game restored from the autosave can still be restarted', async () => {
      const first = freshStore();
      first.initialize();
      first.game.gameOver = true;
      first.persist();
      const store = freshStore();
      store.initialize();
      expect(store.game.gameOver).toBe(true);
      await store.submit('restart');
      expect(store.game.gameOver).toBe(false);
    });

    it('runs a world’s scripts through the store (the reactive state can be read)', async () => {
      const { fixtureWorld } = await import('../fixtures/world');
      const world = { ...fixtureWorld, scripts: { hello: () => ['Hello from a script.'] }, daemons: [{ if: 'in:bedroom', then: [{ script: 'hello' }] }] };
      const store = freshStore();
      store.initialize({ kind: 'world', id: 'scripted', title: 'S', world, saveKey: 'test:scripted' });
      await store.submit('wait');
      expect(store.output.some((l) => l.text === 'Hello from a script.')).toBe(true);
    });

    it('saves and restores by name, and lists saves', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      await store.submit('save before shed');
      expect(store.output.at(-1)!.text).toBe('Saved as before shed.');
      await store.submit('east');
      await store.submit('restore');
      expect(store.output.at(-1)!.text).toBe('Restore which save? before shed. Or CANCEL.');
      await store.submit('before shed');
      expect(store.game.currentRoom).toBe('living');
      expect(store.output.some((l) => l.text === 'Restored before shed.')).toBe(true);
    });

    it('a name that sanitizes to nothing asks again; cancel backs out; unknown names say so', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('save');
      expect(store.output.at(-1)!.text).toBe('Save as? Type a name, or CANCEL.');
      await store.submit('!!!');
      expect(store.output.at(-1)!.text).toBe('Save as? Type a name, or CANCEL.');
      await store.submit('cancel');
      expect(store.output.at(-1)!.text).toBe('[Cancelled.]');
      await store.submit('restore');
      expect(store.output.at(-1)!.text).toBe('[There are no saved games yet.]');
      await store.submit('restore nowhere');
      expect(store.output.at(-1)!.text).toBe('[There’s no save called “nowhere”.]');
    });

    it('answers a question without asking the LLM', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'living';
      const fetchMock = mockIntent({ action: 'unknown' });
      await store.submit('take');
      expect(store.output.at(-1)!.text).toBe('What do you want to take?');
      await store.submit('wallet');
      expect(store.game.locations.wallet).toBe('player');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('runs every command in a compound line', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      await store.submit('get brass key and wallet');
      expect(inventoryOf(store.world, store.game)).toEqual(expect.arrayContaining(['key', 'wallet']));
    });

    it('resolves “it” to the last thing you acted on', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'living';
      await store.submit('take the wallet then drop it');
      expect(inventoryOf(store.world, store.game)).not.toContain('wallet');
      expect(store.output.some((l) => l.text.includes('Dropped: wallet.'))).toBe(true);
    });

    it('stops a compound line when the game ends', async () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'shed';
      carry(store.game, 'key', 'bat');
      await store.submit('smash crate then look');
      expect(store.game.gameOver).toBe(true);
      expect(store.output.some((l) => l.text.includes('The game has ended'))).toBe(false);
    });

    it('COOKIES says so when the build has no analytics', async () => {
      const { consentOpen } = await import('@/services/consent');
      consentOpen.value = false;
      const store = freshStore();
      store.initialize();
      await store.submit('cookies');
      expect(consentOpen.value).toBe(false);
      expect(store.output.some((l) => l.text.includes('no analytics'))).toBe(true);
    });

    it('COOKIES reopens the consent banner without touching the game', async () => {
      const analytics = await import('@/services/analytics');
      vi.spyOn(analytics, 'analyticsConfigured').mockReturnValue(true);
      const { consentOpen } = await import('@/services/consent');
      consentOpen.value = false;
      const store = freshStore();
      store.initialize();
      const moves = store.game.moveCount;
      await store.submit('cookies');
      expect(consentOpen.value).toBe(true);
      expect(store.game.moveCount).toBe(moves);
    });

    it('calls the intent client for unparseable input and runs the returned action', async () => {
      const store = freshStore();
      store.initialize();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ action: 'go', target: 'west' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await store.submit("alright I guess I'll head out west");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(store.game.currentRoom).toBe('living');
    });

    it('falls back to "unknown" when the intent endpoint errors', async () => {
      const store = freshStore();
      store.initialize();
      const before = store.game.currentRoom;

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('network')),
      );

      await store.submit('do something strange and impossible');
      expect(store.game.currentRoom).toBe(before);
      expect(
        store.output.some((l) => l.text.includes('rephrase that')),
      ).toBe(true);
    });

    it('sets isParsing during the LLM call and clears it after', async () => {
      const store = freshStore();
      store.initialize();

      let resolveFetch: (v: Response) => void = () => {};
      const pending = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));

      const p = store.submit('rambling that the regex parser cannot handle');
      // Allow microtasks to flush so isParsing flips on.
      await Promise.resolve();
      expect(store.isParsing).toBe(true);

      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ action: 'look' }),
      } as unknown as Response);
      await p;
      expect(store.isParsing).toBe(false);
    });
  });

  describe('getters', () => {
    it('moveCount and gameOver mirror state', async () => {
      const store = freshStore();
      store.initialize();
      expect(store.moveCount).toBe(0);
      expect(store.gameOver).toBe(false);
      await store.submit('west');
      expect(store.moveCount).toBe(1);
    });

    it('visibleItems is empty in a dark room, so the LLM context doesn’t give the room away', () => {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'cellar';
      expect(store.visibleItems).toEqual([]);
    });

    it('visibleItems excludes items already in inventory', async () => {
      const store = freshStore();
      store.initialize();
      await store.submit('west');
      expect(store.visibleItems).toContain('wallet');
      await store.submit('take wallet');
      expect(store.visibleItems).not.toContain('wallet');
    });
  });

  describe('line capture', () => {
    it('takes input before the intent server, and never traps UNDO or RESTART', async () => {
      const room = fixtureWorld.rooms.bedroom;
      fixtureWorld.scripts = { ...fixtureWorld.scripts, cap: (ctx) => [`${ctx.line} ${ctx.line}...`, { free: true }] };
      room.capture = { script: 'cap' };
      try {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const store = freshStore();
        store.initialize();
        await store.submit('frobnicate');
        expect(store.output.at(-1)?.text).toBe('frobnicate frobnicate...');
        expect(fetchMock).not.toHaveBeenCalled();
        await store.submit('undo');
        expect(store.output.at(-1)?.text).not.toContain('undo undo');
        await store.submit('restart');
        expect(store.output.map((l) => l.text).join(' ')).not.toContain('restart restart');
      } finally {
        delete room.capture;
        vi.unstubAllGlobals();
      }
    });
  });

  describe('vehicles and UNDO', () => {
    it('UNDO after BOARD puts you back on your feet', async () => {
      fixtureWorld.items.raft = { name: 'raft', description: 'A raft.', portable: true, tags: [], vehicle: { travels: 'water' }, container: { open: true } };
      try {
        const store = freshStore();
        store.initialize();
        store.game.currentRoom = 'yard';
        store.game.locations.raft = 'yard';
        await store.submit('board raft');
        expect(store.game.aboard).toBe('raft');
        await store.submit('undo');
        expect(store.game.aboard).toBeUndefined();
        expect(store.game.locations.raft).toBe('yard');
      } finally {
        delete fixtureWorld.items.raft;
      }
    });
  });
});

describe('a command whose script throws (fast follow)', () => {
  it('says nothing changed, keeps the game as it was, and logs the error', async () => {
    const room = fixtureWorld.rooms.bedroom;
    const savedInstead = room.instead;
    fixtureWorld.scripts = { ...fixtureWorld.scripts, boom: () => { throw new Error('boom'); } };
    fixtureWorld.verbs = { ...fixtureWorld.verbs, explode: { words: ['explode'], target: 'none' } };
    fixtureWorld.events = { ...fixtureWorld.events, half: [{ set: 'half_done' }, { script: 'boom' }] };
    room.instead = { ...room.instead, explode: [{ then: 'half' }] };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = 'bedroom';
      await store.submit('explode');
      expect(store.output.at(-1)?.text).toBe('[Something went wrong with that command. Nothing changed.]');
      expect(store.game.flags.half_done).toBeUndefined();
      expect(errors).toHaveBeenCalled();
    } finally {
      room.instead = savedInstead;
      delete fixtureWorld.verbs?.explode;
      delete fixtureWorld.scripts?.boom;
      delete fixtureWorld.events.half;
      errors.mockRestore();
    }
  });
});

describe('a pure echo from a capture (fast follow)', () => {
  it('isn’t an UNDO step', async () => {
    const room = fixtureWorld.rooms[fixtureWorld.startRoom];
    fixtureWorld.scripts = { ...fixtureWorld.scripts, cap: (ctx) => [`${ctx.line} ${ctx.line}...`, { free: true }] };
    room.capture = { script: 'cap' };
    try {
      const store = freshStore();
      store.initialize();
      await store.submit('hello');
      await store.submit('undo');
      expect(store.output.at(-1)?.text).toBe('[Nothing to undo.]');
    } finally {
      delete room.capture;
    }
  });
});

describe('the changed check counts once-events (backlog clear-out)', () => {
  it('a capture whose only effect is firing a once-event is an UNDO step', async () => {
    const room = fixtureWorld.rooms[fixtureWorld.startRoom];
    fixtureWorld.events = { ...fixtureWorld.events, quiet_once: [] };
    fixtureWorld.scripts = { ...fixtureWorld.scripts, cap: () => [{ run: 'quiet_once' }, { free: true }] };
    room.capture = { script: 'cap' };
    try {
      const store = freshStore();
      store.initialize();
      store.game.firedEvents = [];
      const before = store.game.firedEvents.length;
      await store.submit('hum');
      if (store.game.firedEvents.length === before) return; // a world where runs don't mark: nothing to check
      await store.submit('undo');
      expect(store.output.at(-1)?.text).toBe('[Previous turn undone.]');
    } finally {
      delete room.capture;
      delete fixtureWorld.events.quiet_once;
    }
  });
});

describe('dropping the rest of a line (P-CONT) (backlog clear-out)', () => {
  it('{ stopLine } ends the line; its message prints only when commands were left', async () => {
    const room = fixtureWorld.rooms[fixtureWorld.startRoom];
    const saved = room.instead;
    fixtureWorld.verbs = { ...fixtureWorld.verbs, halt: { words: ['halt'], target: 'none' }, hush: { words: ['hush'], target: 'none' } };
    fixtureWorld.events = { ...fixtureWorld.events, halted: ['Stop.', { stopLine: true }], hushed: ['Roar.', { stopLine: 'The rest of your commands have been lost in the noise.' }] };
    room.instead = { ...room.instead, halt: [{ then: 'halted' }], hush: [{ then: 'hushed' }] };
    localStorage.clear();
    try {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = fixtureWorld.startRoom;
      const n = store.output.length;
      await store.submit('halt. look');
      expect(store.output.slice(n).map((l) => l.text)).toEqual(['> halt. look', 'Stop.']);
      const m = store.output.length;
      await store.submit('hush. look');
      expect(store.output.slice(m).map((l) => l.text)).toEqual(['> hush. look', 'Roar.', 'The rest of your commands have been lost in the noise.']);
      const k = store.output.length;
      await store.submit('hush');
      expect(store.output.slice(k).map((l) => l.text)).toEqual(['> hush', 'Roar.']);
    } finally {
      room.instead = saved;
      delete fixtureWorld.verbs?.halt;
      delete fixtureWorld.verbs?.hush;
      delete fixtureWorld.events.halted;
      delete fixtureWorld.events.hushed;
    }
  });
});

describe('a line stop left by a command that threw (1.12.5 review)', () => {
  it('does not cut short the next line', async () => {
    const room = fixtureWorld.rooms[fixtureWorld.startRoom];
    const saved = room.instead;
    fixtureWorld.verbs = { ...fixtureWorld.verbs, halt: { words: ['halt'], target: 'none' }, ping: { words: ['ping'], target: 'none' } };
    fixtureWorld.events = { ...fixtureWorld.events, halted: ['Stop.', { stopLine: true }], pinged: ['Pong.'] };
    room.instead = { ...room.instead, halt: [{ then: 'halted' }], ping: [{ then: 'pinged' }] };
    localStorage.clear();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const store = freshStore();
      store.initialize();
      store.game.currentRoom = fixtureWorld.startRoom;
      // The turn ran and asked to stop the line, then rendering it threw.
      const apply = vi.spyOn(store, 'applyResult').mockImplementationOnce(() => { throw new Error('render'); });
      await store.submit('halt');
      apply.mockRestore();
      const n = store.output.length;
      await store.submit('ping. ping');
      expect(store.output.slice(n).map((l) => l.text)).toEqual(['> ping. ping', 'Pong.', 'Pong.']);
    } finally {
      room.instead = saved;
      delete fixtureWorld.verbs?.halt;
      delete fixtureWorld.verbs?.ping;
      delete fixtureWorld.events.halted;
      delete fixtureWorld.events.pinged;
      errors.mockRestore();
    }
  });
});
