// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initAnalytics, track, __resetForTests, CLIENT_ID_KEY, SESSION_ID_KEY } from '../../src/services/analytics';
import { CONSENT_KEY } from '../../src/services/consent';

// The module captures `import.meta.env.VITE_GA_MEASUREMENT_ID` at import time.
// The test bundle builds with no .env, so it's null and every send call
// short-circuits before reaching navigator.sendBeacon. Each test below
// confirms the guards behave correctly.

describe('analytics — direct Measurement Protocol', () => {
  beforeEach(() => {
    __resetForTests();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initAnalytics returns false when measurement ID is unset', () => {
    expect(initAnalytics()).toBe(false);
  });

  it('initAnalytics does not call sendBeacon when ID is unset', () => {
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    initAnalytics();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('track() is a safe no-op when ID is unset', () => {
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    expect(() => track('whatever', { x: 1 })).not.toThrow();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('skips sending when navigator.doNotTrack === "1"', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    expect(initAnalytics()).toBe(false);
    track('any', {});
    expect(beacon).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
  });

  it('initAnalytics is idempotent — repeated calls do not re-fire page_view', () => {
    // No ID set in test bundle; just confirm there is no error or side-effect
    // from calling repeatedly.
    expect(initAnalytics()).toBe(false);
    expect(initAnalytics()).toBe(false);
    expect(initAnalytics()).toBe(false);
  });

  it('no client_id is minted when ID guards short-circuit first', () => {
    // Documents guard ordering: if measurement ID is unset, we don't reach
    // localStorage at all. Important for SSR / private-browsing safety.
    initAnalytics();
    track('test_event');
    expect(localStorage.getItem(CLIENT_ID_KEY)).toBeNull();
  });

  it('track() accepts but does not throw on null/undefined params', () => {
    expect(() => track('e', undefined)).not.toThrow();
    expect(() => track('e', {})).not.toThrow();
    expect(() => track('e', { a: null, b: undefined, c: 1, d: 'x' })).not.toThrow();
  });
});

describe('analytics — with a measurement ID configured', () => {
  // MEASUREMENT_ID is read at import time, so each test re-imports the module
  // after stubbing the env var.
  async function load(id = 'G-TEST123') {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', id);
    vi.resetModules();
    const mod = await import('../../src/services/analytics');
    mod.__resetForTests();
    return mod;
  }

  function sentUrl(beacon: ReturnType<typeof vi.fn>, call = 0): URL {
    return new URL(beacon.mock.calls[call][0] as string);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(CONSENT_KEY, 'granted');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('treats the G-XXX placeholder as unset', async () => {
    const { initAnalytics } = await load('G-XXXXXXX');
    expect(initAnalytics()).toBe(false);
  });

  it('fires a first-visit page_view on init, once', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    const { initAnalytics } = await load();
    expect(initAnalytics()).toBe(true);
    expect(initAnalytics()).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
    const url = sentUrl(beacon);
    expect(url.origin + url.pathname).toBe('https://www.google-analytics.com/g/collect');
    expect(url.searchParams.get('tid')).toBe('G-TEST123');
    expect(url.searchParams.get('en')).toBe('page_view');
    expect(url.searchParams.get('_fv')).toBe('1');
  });

  it('encodes numeric params as epn.* and others as ep.*, skipping nullish', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    const { track } = await load();
    track('game_completed', { moves: 42, world: 'office', a: null, b: undefined });
    const url = sentUrl(beacon);
    expect(url.searchParams.get('en')).toBe('game_completed');
    expect(url.searchParams.get('epn.moves')).toBe('42');
    expect(url.searchParams.get('ep.world')).toBe('office');
    expect(url.searchParams.has('ep.a')).toBe(false);
    expect(url.searchParams.has('ep.b')).toBe(false);
    expect(url.searchParams.has('_fv')).toBe(false);
  });

  it('reuses the persisted client and session ids across sends', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    const { track } = await load();
    track('a');
    track('b');
    const first = sentUrl(beacon, 0);
    const second = sentUrl(beacon, 1);
    expect(first.searchParams.get('cid')).toMatch(/^\d+\.\d+$/);
    expect(second.searchParams.get('cid')).toBe(first.searchParams.get('cid'));
    expect(second.searchParams.get('sid')).toBe(first.searchParams.get('sid'));
    expect(localStorage.getItem(CLIENT_ID_KEY)).toBe(first.searchParams.get('cid'));
  });

  it('falls back to an ephemeral id when storage throws', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    const { track } = await load();
    const spies = [window.localStorage, window.sessionStorage].map((store) => {
      const real = store.getItem.bind(store);
      return vi.spyOn(store, 'getItem').mockImplementation((key: string) => {
        if (key.includes(':ga-')) throw new Error('denied');
        return real(key);
      });
    });
    try {
      track('a');
      const url = sentUrl(beacon);
      expect(url.searchParams.get('cid')).toMatch(/^ephemeral\.\d+$/);
      expect(url.searchParams.get('sid')).toMatch(/^\d+$/);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('falls back to an image request when sendBeacon refuses or throws', async () => {
    const created: HTMLImageElement[] = [];
    const RealImage = globalThis.Image;
    vi.stubGlobal(
      'Image',
      class extends RealImage {
        constructor() {
          super();
          created.push(this);
        }
      },
    );
    const { track } = await load();

    navigator.sendBeacon = vi.fn().mockReturnValue(false);
    track('refused');
    navigator.sendBeacon = vi.fn(() => {
      throw new Error('boom');
    });
    track('threw');

    expect(created).toHaveLength(2);
    expect(new URL(created[0].src).searchParams.get('en')).toBe('refused');
    expect(new URL(created[1].src).searchParams.get('en')).toBe('threw');
    vi.unstubAllGlobals();
  });

  it('sends nothing and stores no ids without consent', async () => {
    localStorage.removeItem(CONSENT_KEY);
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    const { initAnalytics, track } = await load();
    expect(initAnalytics()).toBe(false);
    track('x');
    expect(beacon).not.toHaveBeenCalled();
    expect(localStorage.getItem(CLIENT_ID_KEY)).toBeNull();
  });

  it('a later accept fires the page_view that was held back', async () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    const { initAnalytics } = await load();
    expect(initAnalytics()).toBe(false);
    localStorage.setItem(CONSENT_KEY, 'granted');
    expect(initAnalytics()).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('forgetAnalytics clears the stored ids', async () => {
    navigator.sendBeacon = vi.fn().mockReturnValue(true);
    const { track, forgetAnalytics } = await load();
    track('a');
    expect(localStorage.getItem(CLIENT_ID_KEY)).not.toBeNull();
    forgetAnalytics();
    expect(localStorage.getItem(CLIENT_ID_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_ID_KEY)).toBeNull();
  });

  it('honors msDoNotTrack', async () => {
    Object.defineProperty(navigator, 'msDoNotTrack', { value: '1', configurable: true });
    const beacon = vi.fn().mockReturnValue(true);
    navigator.sendBeacon = beacon;
    const { initAnalytics, track } = await load();
    expect(initAnalytics()).toBe(false);
    track('x');
    expect(beacon).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'msDoNotTrack', { value: undefined, configurable: true });
  });
});
