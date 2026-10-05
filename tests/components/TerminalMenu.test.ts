import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Terminal from '@/components/Terminal.vue';

vi.mock('@/app.config', async () => {
  const { fixtureWorld } = await import('../fixtures/world');
  return {
    appName: 'TEST TERMINAL',
    storagePrefix: 'test',
    cartridges: [
      { kind: 'world', id: 'house', title: 'TEST HOUSE', world: fixtureWorld, saveKey: 'test:save' },
      { kind: 'zcode', id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' },
    ],
  };
});

async function type(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.find<HTMLInputElement>('.terminal-input-bar input').setValue(text);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
  await vi.runAllTimersAsync();
}

describe('Terminal with a cartridge menu', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('shows the menu, inserts a cartridge, and ejects back', async () => {
    const wrapper = mount(Terminal);
    await flushPromises();
    await vi.runAllTimersAsync();
    expect(wrapper.find('.terminal-output').text()).toContain('INSTALLED CARTRIDGES');

    await type(wrapper, '1');
    expect(wrapper.find('.terminal-header').text()).toContain('TEST HOUSE');
    expect(wrapper.find('.terminal-header').text()).toMatch(/MOVES:\s*0/);
    expect(wrapper.find('.terminal-output').text()).not.toContain('INSTALLED CARTRIDGES');
    expect(wrapper.find('.terminal-output').text()).toContain('Bedroom');

    await type(wrapper, 'eject');
    expect(wrapper.find('.terminal-output').text()).toContain('INSTALLED CARTRIDGES');
    expect(wrapper.find('.terminal-header').text()).not.toContain('TEST HOUSE');
  });
});
