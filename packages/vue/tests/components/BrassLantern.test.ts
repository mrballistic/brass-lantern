// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick } from 'vue';
import BrassLantern from '../../src/components/BrassLantern.vue';
import Terminal from '../../src/components/Terminal.vue';
import { createGameContext } from '../../src/stores/context';
import { mountGame } from '../../src/mount';
import type { GameOptions } from '../../src/options';
import { tutorial } from '@brass-lantern/engine/worlds';
import { fixtureOptions } from '../fixtures/world';

const A: GameOptions = { ...fixtureOptions, storagePrefix: 'game-a', terminalName: 'TERMINAL A' };
const B: GameOptions = {
  cartridges: [{ kind: 'world', id: 'snack', title: 'SNACK', world: tutorial }],
  storagePrefix: 'game-b',
  terminalName: 'TERMINAL B',
  theme: 'crt-green',
  intentEndpoint: null,
};

/** Two games on one page, sharing one Pinia, as a library user would have them. */
function twoGames(): { a: VueWrapper; b: VueWrapper } {
  const Page = () =>
    h('div', [h('section', { id: 'a' }, [h(BrassLantern, { options: A })]), h('section', { id: 'b' }, [h(BrassLantern, { options: B })])]);
  const page = mount(Page, { global: { plugins: [createPinia()] } });
  const [a, b] = page.findAllComponents(BrassLantern);
  return { a, b };
}

async function settle(): Promise<void> {
  await flushPromises();
  await vi.advanceTimersByTimeAsync(60_000);
}

async function type(w: VueWrapper, text: string): Promise<void> {
  await w.find<HTMLInputElement>('.terminal-input-bar input').setValue(text);
  await w.find('form').trigger('submit');
  await settle();
}

const screen = (w: VueWrapper) => w.find('.terminal-output').text();
const bg = (w: VueWrapper) => (w.find('.crt-shell').element as HTMLElement).style.getPropertyValue('--bl-bg');

describe('BrassLantern: two games on one page', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('each boots its own world, under its own name and theme', async () => {
    const { a, b } = twoGames();
    // Both boot sequences run, each in its own shell.
    expect(a.find('.crt-boot').exists()).toBe(true);
    expect(b.find('.crt-boot').exists()).toBe(true);
    await settle();
    expect(a.find('.crt-boot').exists()).toBe(false);
    expect(b.find('.crt-boot').exists()).toBe(false);
    expect(a.find('.terminal-header').text()).toContain('TERMINAL A');
    expect(b.find('.terminal-header').text()).toContain('TERMINAL B');
    expect(screen(a)).toContain('Bedroom');
    expect(screen(a)).not.toContain('Your Cubicle');
    expect(screen(b)).toContain('Your Cubicle');
    expect(screen(b)).not.toContain('Bedroom');
    expect(bg(a)).toBe('#0a0a08');
    expect(bg(b)).toBe('#050a06');
  });

  it('a SAVE in one is not in the other’s list, and a THEME in one leaves the other alone', async () => {
    const { a, b } = twoGames();
    await settle();
    await type(a, 'save mine');
    expect(screen(a)).toContain('Saved as mine.');
    await type(b, 'restore');
    expect(screen(b)).toContain('There are no saved games yet.');
    await type(a, 'restore');
    expect(screen(a)).toContain('Restore which save? mine. Or CANCEL.');
    await type(a, 'cancel');

    await type(a, 'theme simple dark');
    expect(bg(a)).toBe('#121212');
    expect(bg(b)).toBe('#050a06');
    expect(JSON.parse(localStorage.getItem('game-a:theme')!).base).toBe('simple-dark');
    expect(localStorage.getItem('game-b:theme')).toBeNull();
    // A move in one doesn't move the other.
    await type(a, 'west');
    expect(a.find('.terminal-header').text()).toMatch(/MOVES:\s*1/);
    expect(b.find('.terminal-header').text()).toMatch(/MOVES:\s*0/);
  });

  it('boots fast only the game that has a session to resume', async () => {
    localStorage.setItem('test:save', '{}');
    const { a, b } = twoGames();
    await nextTick();
    // A's single cartridge keeps the fixture's save key, test:save.
    expect(a.find('.crt-boot').classes()).toContain('fast');
    expect(b.find('.crt-boot').classes()).not.toContain('fast');
  });

  it('with no intent endpoint, an unparseable line gets the literal reply and nothing is fetched', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { b } = twoGames();
    await settle();
    await type(b, 'I would like to interpretive-dance at the stapler please');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen(b)).toContain('The office hums, uncomprehending. (Type HELP.)');
    expect(b.find('.terminal-input-bar input').attributes('disabled')).toBeUndefined();
  });

  it('shows the COOKIES link only when the app gives a way to open its consent settings', async () => {
    const openConsent = vi.fn();
    const w = mount(BrassLantern, {
      props: { options: { ...A, analytics: { onEvent: vi.fn(), openConsent } } },
      global: { plugins: [createPinia()] },
    });
    await settle();
    await w.find('.consent-open').trigger('click');
    expect(openConsent).toHaveBeenCalledOnce();
    const { b } = twoGames();
    await settle();
    expect(b.find('.consent-open').exists()).toBe(false);
  });

  it('renders its slot inside the shell once booted', async () => {
    const w = mount(BrassLantern, {
      props: { options: A },
      slots: { default: () => h('p', { class: 'extra' }, 'hello') },
      global: { plugins: [createPinia()] },
    });
    expect(w.find('.extra').exists()).toBe(false);
    await settle();
    expect(w.find('.crt-shell .extra').exists()).toBe(true);
  });
});

describe('a game’s context', () => {
  it('needs a storage prefix, and the terminal needs a game around it', () => {
    expect(() => createGameContext({ ...A, storagePrefix: '' })).toThrow('storagePrefix');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => mount(Terminal, { global: { plugins: [createPinia()] } })).toThrow('<BrassLantern>');
  });
});

describe('mountGame', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('mounts a game by selector or element, each with its own Pinia, and unmounts', async () => {
    document.body.innerHTML = '<div id="one"></div><div id="two"></div>';
    const Extra = () => h('p', { class: 'extra' }, 'hi');
    const one = mountGame('#one', A, { slot: Extra });
    const two = mountGame(document.getElementById('two')!, B);
    await settle();
    expect(document.querySelector('#one .crt-shell .terminal')).not.toBeNull();
    expect(document.querySelector('#one .extra')).not.toBeNull();
    expect(document.querySelector('#two .extra')).toBeNull();
    expect(document.querySelector('#two .terminal-output')!.textContent).toContain('Your Cubicle');
    one.unmount();
    expect(document.querySelector('#one .crt-shell')).toBeNull();
    expect(document.querySelector('#two .crt-shell')).not.toBeNull();
    two.unmount();
  });

  it('says so when the element isn’t there', () => {
    expect(() => mountGame('#missing', A)).toThrow('#missing');
  });
});
