// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BrassLantern from '../../src/components/BrassLantern.vue';
import { createGameContext } from '../../src/stores/context';
import { PRESETS, type Theme } from '../../src/theme/themes';
import type { GameOptions } from '../../src/options';
import { fixtureOptions } from '../fixtures/world';

const paper: Theme = { palette: 'light', effects: { bloom: false, scanlines: false, flicker: false, vignette: false, noise: false, glitch: false, decay: true } };

describe('an author’s theme that isn’t one', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('an unknown theme name falls back to crt-amber, with one warning when the game is made', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = createGameContext({ ...fixtureOptions, theme: 'green' as GameOptions['theme'] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/green/);
    expect(String(warn.mock.calls[0][0])).toMatch(/crt-amber/);
    const store = ctx.useGameStore();
    store.configureThemes(ctx.options.theme, ctx.options.themes);
    expect(store.themeBase).toBe('crt-amber');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a mounted game with an unknown theme boots in crt-amber and warns once', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = mount(BrassLantern, { props: { options: { ...fixtureOptions, theme: 'purple' as GameOptions['theme'] } } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60_000);
    expect((w.find('.crt-shell').element as HTMLElement).style.getPropertyValue('--bl-bg')).toBe('#0a0a08');
    expect(w.find('.terminal').exists()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    w.unmount();
    vi.useRealTimers();
  });

  it('a custom theme named like a preset is ignored, with a warning, and THEME lists each name once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = createGameContext({ ...fixtureOptions, themes: { 'crt-amber': paper, paper } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/crt-amber/);
    const store = ctx.useGameStore();
    store.configureThemes(ctx.options.theme, ctx.options.themes);
    expect(store.themeNames).toEqual([...Object.keys(PRESETS), 'paper']);
    expect(store.customThemes).toEqual({ paper });
  });

  it('a custom theme can be the author’s default by name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = createGameContext({ ...fixtureOptions, theme: 'paper' as GameOptions['theme'], themes: { paper } });
    expect(warn).not.toHaveBeenCalled();
    expect(ctx.options.theme).toBe('paper');
  });
});

describe('autofocus', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  async function booted(extra: Partial<GameOptions>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const w = mount(BrassLantern, { props: { options: { ...fixtureOptions, ...extra } }, attachTo: host, global: { plugins: [createPinia()] } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60_000);
    return w;
  }

  it('focuses the input at boot by default', async () => {
    const w = await booted({ storagePrefix: 'focus-default' });
    expect(document.activeElement).toBe(w.find('.terminal-input-bar input').element);
    w.unmount();
  });

  it('leaves the page’s focus alone with autofocus: false, and still focuses on a click', async () => {
    const w = await booted({ storagePrefix: 'focus-off', autofocus: false });
    const input = w.find('.terminal-input-bar input').element;
    expect(document.activeElement).not.toBe(input);
    await w.find('.terminal').trigger('click');
    await vi.advanceTimersByTimeAsync(10);
    expect(document.activeElement).toBe(input);
    w.unmount();
  });
});
