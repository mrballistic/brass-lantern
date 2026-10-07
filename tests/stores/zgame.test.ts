// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvents } from '@/zmachine/session';
import { createLocalShelf } from '@/stores/cartridges';
import { createZGameStore } from '@/stores/zgame';
import { fixtureOptions } from '../fixtures/world';

const useZGameStore = createZGameStore(fixtureOptions, createLocalShelf('test'));

const CART = { kind: 'zcode' as const, id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' };

function fakeDeps(fetchStory: () => Promise<Uint8Array> = async () => new Uint8Array([3])) {
  const sessions: Array<{ start: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn>; events: SessionEvents }> = [];
  return {
    sessions,
    deps: {
      fetchStory: vi.fn(fetchStory),
      createSession: vi.fn((_story: Uint8Array, _dialog: unknown, events: SessionEvents) => {
        const s = { start: vi.fn(), submit: vi.fn(), events };
        sessions.push(s);
        return s;
      }),
    },
  };
}

const texts = (store: ReturnType<typeof useZGameStore>) => store.output.map((l) => l.text);

describe('zgame store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('fetches the story, starts a session and shows its output and status', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    expect(deps.fetchStory).toHaveBeenCalledWith('stories/story.z3');
    expect(sessions[0].start).toHaveBeenCalled();
    sessions[0].events.onLines(['West of House']);
    sessions[0].events.onStatus({ location: 'West of House', detail: 'Score: 0  Turns: 0' });
    expect(texts(store)).toEqual(['West of House']);
    expect(store.headerStatus).toBe('West of House  Score: 0  Turns: 0');
  });

  it('echoes input and passes it on only when the game is waiting', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    store.submit('look');
    expect(sessions[0].submit).not.toHaveBeenCalled();
    sessions[0].events.onWaiting();
    store.submit('  look  ');
    store.submit('   ');
    expect(sessions[0].submit).toHaveBeenCalledTimes(1);
    expect(sessions[0].submit).toHaveBeenCalledWith('look');
    expect(texts(store)).toContain('> look');
  });

  it('keeps a transcript, and restores it instantly next time', async () => {
    const first = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, first.deps);
    first.sessions[0].events.onLines(['West of House']);
    first.sessions[0].events.onWaiting();
    expect(JSON.parse(localStorage.getItem('test:z:story:transcript') ?? '[]')).toHaveLength(1);

    setActivePinia(createPinia());
    const again = useZGameStore();
    const second = fakeDeps();
    await again.initialize(CART, second.deps);
    expect(again.restored).toBe(true);
    expect(texts(again)[0]).toBe('West of House');
    expect(texts(again)).toContain('[Session restored. LOOK to look around.]');
  });

  it('caps the transcript at 500 lines', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    sessions[0].events.onLines(Array.from({ length: 600 }, (_, i) => `line ${i}`));
    sessions[0].events.onWaiting();
    const saved = JSON.parse(localStorage.getItem('test:z:story:transcript') ?? '[]');
    expect(saved).toHaveLength(500);
    expect(saved.at(-1).text).toBe('line 599');
  });

  it('says so when the story won’t download, and starts nothing', async () => {
    const { deps, sessions } = fakeDeps(async () => {
      throw new Error('HTTP 404');
    });
    const store = useZGameStore();
    await store.initialize(CART, deps);
    expect(store.failed).toBe(true);
    expect(sessions).toHaveLength(0);
    expect(texts(store).at(-1)).toContain('wouldn’t load');
  });

  it('on game over: says so, clears the transcript, and PLAY starts again', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    sessions[0].events.onWaiting();
    sessions[0].events.onExit();
    expect(store.exited).toBe(true);
    expect(localStorage.getItem('test:z:story:transcript')).toBeNull();
    expect(texts(store).at(-1)).toBe('[The story has ended. Type PLAY to start again.]');
    store.submit('look');
    expect(sessions).toHaveLength(1);
    store.submit('play');
    expect(sessions).toHaveLength(2);
    expect(sessions[1].start).toHaveBeenCalled();
  });

  it('a newer initialize wins: the older download, when it lands, boots nothing', async () => {
    let release!: (v: Uint8Array) => void;
    const slow = fakeDeps(() => new Promise((r) => (release = r)));
    const fast = fakeDeps();
    const store = useZGameStore();
    const first = store.initialize(CART, slow.deps);
    await store.initialize(CART, fast.deps);
    release(new Uint8Array([3]));
    await first;
    expect(slow.sessions).toHaveLength(0);
    expect(fast.sessions).toHaveLength(1);
  });

  it('stop() cancels a pending start (EJECT during download)', async () => {
    let release!: (v: Uint8Array) => void;
    const slow = fakeDeps(() => new Promise((r) => (release = r)));
    const store = useZGameStore();
    const pending = store.initialize(CART, slow.deps);
    store.stop();
    release(new Uint8Array([3]));
    await pending;
    expect(slow.sessions).toHaveLength(0);
  });

  it('shows a loading line while the story downloads', async () => {
    let release!: (v: Uint8Array) => void;
    const slow = fakeDeps(() => new Promise((r) => (release = r)));
    const store = useZGameStore();
    const pending = store.initialize(CART, slow.deps);
    expect(texts(store)).toContain('[Loading the cartridge…]');
    release(new Uint8Array([3]));
    await pending;
  });

  it('shows interpreter errors', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    sessions[0].events.onError('illegal opcode');
    expect(texts(store).at(-1)).toBe('[The interpreter stopped: illegal opcode]');
  });

  it('loads a story the player brought from the shelf, not the network', async () => {
    const { deps, sessions } = fakeDeps();
    const loadLocal = vi.fn(async () => new Uint8Array([3]));
    const store = useZGameStore();
    await store.initialize({ ...CART, id: 'local-r1-000000-0000', story: '', local: true }, { ...deps, loadLocal });
    expect(loadLocal).toHaveBeenCalledWith('local-r1-000000-0000');
    expect(deps.fetchStory).not.toHaveBeenCalled();
    expect(sessions[0].start).toHaveBeenCalled();
  });

  it('says how to recover when a loaded story is gone from the browser', async () => {
    const { deps } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(
      { ...CART, id: 'local-gone', story: '', local: true },
      { ...deps, loadLocal: async () => Promise.reject(new Error('Not on the shelf')) },
    );
    expect(texts(store).at(-1)).toBe('[This story isn’t in the browser any more. Type EJECT, then LOAD it again.]');
  });

  it('reports game_start, then session_resumed, with the cartridge, to analytics.onEvent', async () => {
    const onEvent = vi.fn();
    const useStore = createZGameStore({ ...fixtureOptions, analytics: { onEvent } }, createLocalShelf('test'));
    const { deps, sessions } = fakeDeps();
    const store = useStore();
    await store.initialize(CART, deps);
    expect(onEvent).toHaveBeenCalledWith('game_start', { cartridge: 'story' });
    sessions[0].events.onLines(['West of House']);
    sessions[0].events.onWaiting();
    setActivePinia(createPinia());
    await useStore().initialize(CART, fakeDeps().deps);
    expect(onEvent).toHaveBeenLastCalledWith('session_resumed', { cartridge: 'story' });
  });

  it('a throwing analytics callback is logged and the story still boots', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onEvent = vi.fn(() => {
      throw new Error('analytics down');
    });
    const store = createZGameStore({ ...fixtureOptions, analytics: { onEvent } }, createLocalShelf('test'))();
    const { deps, sessions } = fakeDeps();
    await expect(store.initialize(CART, deps)).resolves.toBeUndefined();
    expect(sessions[0].start).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Analytics callback failed:', expect.any(Error));
    error.mockRestore();
  });
});
