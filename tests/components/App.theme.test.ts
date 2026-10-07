// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import App from '@/App.vue';
import { useTheme } from '@/theme/useTheme';
vi.mock('@/app.config', async () => (await import('../fixtures/world')).fixtureConfig);

const ALL_OFF = ['bloom', 'scanlines', 'flicker', 'vignette', 'noise', 'glitch', 'decay'].map(e => `bl-${e}-off`);
const cssText = () => import('node:fs').then(fs => fs.readFileSync('src/styles/crt.css', 'utf8'));

describe('the shell is the one theme root', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('simple-dark puts every -off class and the variables on .crt-shell, with the overlays inside it', async () => {
    const w = mount(App, { props: { theme: 'simple-dark' } });
    await nextTick();
    const shell = w.find('.crt-shell');
    expect(shell.classes()).toEqual(expect.arrayContaining(ALL_OFF));
    const el = shell.element as HTMLElement;
    expect(el.style.getPropertyValue('--bl-bg')).toBe('#121212');
    expect(el.style.getPropertyValue('--bl-boot-line')).toBe('#c3a6ff');
    for (const sel of ['.crt-noise', '.crt-vignette', '.crt-flicker-base', '.crt-flicker-secondary', '.crt-glitch', '.crt-boot']) {
      expect(el.querySelector(sel), sel).not.toBeNull();
    }
  });

  it('every effect-off selector starts at a class the shell carries', async () => {
    const css = await cssText();
    const offRules = css.split('\n').filter(l => /\.bl-[a-z]+-off/.test(l));
    expect(offRules.length).toBeGreaterThan(5);
    for (const l of offRules) expect(l).toMatch(/^\.bl-[a-z]+-off(\.crt-shell| [.:])/);
    expect(css).not.toMatch(/\.terminal\.bl-/);
  });

  it('crt-amber carries no -off classes by default', async () => {
    const w = mount(App);
    await nextTick();
    expect(w.find('.crt-shell').classes()).toEqual(['crt-shell']);
  });

  it('two shells with different themes stay independent', async () => {
    const a = mount(App, { props: { theme: 'simple-dark' } });
    const b = mount(App, { props: { theme: 'crt-green' } });
    await nextTick();
    expect((a.find('.crt-shell').element as HTMLElement).style.getPropertyValue('--bl-bg')).toBe('#121212');
    expect((b.find('.crt-shell').element as HTMLElement).style.getPropertyValue('--bl-bg')).toBe('#050a06');
    expect(b.find('.crt-shell').classes()).toEqual(['crt-shell']);
  });

  it('switching the theme prop updates the root', async () => {
    const w = mount(App, { props: { theme: 'crt-amber' } });
    await w.setProps({ theme: 'simple-light' });
    expect(w.find('.crt-shell').classes()).toContain('bl-noise-off');
    await w.setProps({ theme: 'crt-amber' });
    expect(w.find('.crt-shell').classes()).toEqual(['crt-shell']);
  });
});

describe('useTheme and the colour-scheme and motion preferences', () => {
  function stubMatchMedia(initial: Record<string, boolean>) {
    const listeners: Record<string, ((e: { matches: boolean }) => void)[]> = {};
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: initial[q] ?? false,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { (listeners[q] ??= []).push(fn); },
      removeEventListener: () => {},
    }));
    return (q: string, matches: boolean) => listeners[q]?.forEach(fn => fn({ matches }));
  }
  const DARK = '(prefers-color-scheme: dark)';
  const MOTION = '(prefers-reduced-motion: reduce)';
  const Harness = defineComponent({
    props: { theme: { type: String, default: 'simple' } },
    setup(props) {
      const el = ref<HTMLElement | null>(null);
      useTheme(el, { theme: () => props.theme });
      return () => h('div', { ref: el });
    },
  });
  afterEach(() => vi.unstubAllGlobals());

  it('applies the preferences on the very first render', async () => {
    stubMatchMedia({ [DARK]: true, [MOTION]: true });
    const w = mount(Harness, { props: { theme: 'crt-green' } });
    // No awaiting: the first apply already knew.
    expect(w.classes()).toEqual(expect.arrayContaining(['bl-flicker-off', 'bl-glitch-off', 'bl-noise-off']));
    const s = mount(Harness);
    expect((s.element as HTMLElement).style.getPropertyValue('--bl-bg')).toBe('#121212');
  });

  it('follows live changes', async () => {
    const fire = stubMatchMedia({});
    const s = mount(Harness);
    expect((s.element as HTMLElement).style.getPropertyValue('--bl-bg')).toBe('#f7f5ef');
    fire(DARK, true);
    await nextTick();
    expect((s.element as HTMLElement).style.getPropertyValue('--bl-bg')).toBe('#121212');
    const g = mount(Harness, { props: { theme: 'crt-green' } });
    expect(g.classes()).not.toContain('bl-flicker-off');
    fire(MOTION, true);
    await nextTick();
    expect(g.classes()).toEqual(expect.arrayContaining(['bl-flicker-off', 'bl-glitch-off', 'bl-noise-off']));
  });

  it('works without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const w = mount(Harness);
    expect((w.element as HTMLElement).style.getPropertyValue('--bl-bg')).toBe('#f7f5ef');
  });
});
