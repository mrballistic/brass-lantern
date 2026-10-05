import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import 'fake-indexeddb/auto';
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

  it('LOAD opens the file picker, and a chosen file goes to the session', async () => {
    const wrapper = mount(Terminal);
    await flushPromises();
    await vi.runAllTimersAsync();
    const picker = wrapper.find<HTMLInputElement>('input[type="file"]');
    expect(picker.attributes('accept')).toBe('.z3,.z4,.z5,.z8,.zblorb,.zlb,.blb,.blorb');
    const click = vi.spyOn(picker.element, 'click');
    await type(wrapper, 'load');
    expect(click).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.terminal-output').text()).toContain('[Choose a story file: .z3, .z5, .z8 or .zblorb.]');

    const chosen = new File([new Uint8Array([1])], 'notes.z5');
    Object.defineProperty(picker.element, 'files', { value: [chosen], configurable: true });
    await picker.trigger('change');
    await flushPromises();
    await vi.runAllTimersAsync();
    expect(wrapper.find('.terminal-output').text()).toContain('[notes.z5 isn’t a Z-machine story file.]');
    // Cleared, so choosing the same file again still fires a change.
    expect(picker.element.value).toBe('');
  });

  it('a story file dropped on the menu is loaded; elsewhere a drop does nothing', async () => {
    const wrapper = mount(Terminal);
    await flushPromises();
    await vi.runAllTimersAsync();
    const dropped = new File([new Uint8Array([1])], 'notes.z5');
    const drop = async () => {
      await wrapper.find('.terminal').trigger('drop', { dataTransfer: { files: [dropped] } });
      await flushPromises();
      await vi.runAllTimersAsync();
    };
    await drop();
    expect(wrapper.find('.terminal-output').text()).toContain('[notes.z5 isn’t a Z-machine story file.]');

    await type(wrapper, '1');
    await drop();
    expect(wrapper.find('.terminal-output').text()).not.toContain('notes.z5');
  });
});
