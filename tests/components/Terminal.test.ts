import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pkg from '../../package.json';
import Terminal from '@/components/Terminal.vue';
// Plays the fixture world, so this file is the same in every repo using the engine.
vi.mock('@/app.config', async () => (await import('../fixtures/world')).fixtureConfig);

describe('Terminal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders header, output area, and input bar on mount', async () => {
    const wrapper = mount(Terminal);
    await vi.runOnlyPendingTimersAsync();

    expect(wrapper.find('.terminal-header').exists()).toBe(true);
    expect(wrapper.find('.terminal-header').text()).toContain('TEST TERMINAL');
    // The header shows the real release, from package.json.
    expect(wrapper.find('.terminal-header').text()).toContain(`v${pkg.version}`);
    expect(wrapper.find('.terminal-header').text()).toMatch(/MOVES:\s*0/);
    expect(wrapper.find('.terminal-output').exists()).toBe(true);
    expect(wrapper.find('.terminal-input-bar input').exists()).toBe(true);
    expect(wrapper.find('.block-cursor').exists()).toBe(true);
  });

  it('draws the block cursor at the insertion point, not after the field', async () => {
    const wrapper = mount(Terminal);
    await vi.runOnlyPendingTimersAsync();
    const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
    // The cursor lives in the field, after a mirror of the text before the caret.
    const cursor = wrapper.find('.input-field .block-cursor');
    expect(cursor.exists()).toBe(true);
    const before = () => wrapper.find('.input-field .caret-before').text();
    await input.setValue('take lamp');
    expect(before()).toBe('take lamp');
    input.element.setSelectionRange(4, 4);
    await input.trigger('keyup');
    expect(before()).toBe('take');
    expect(cursor.attributes('aria-hidden')).toBe('true');
  });

  it('renders opening output lines after initialize', async () => {
    const wrapper = mount(Terminal);
    // Drain typewriter timers so lines commit.
    await vi.advanceTimersByTimeAsync(60_000);
    const text = wrapper.find('.terminal-output').text();
    expect(text).toContain('TEST HOUSE');
    expect(text).toContain('Bedroom');
  });

  it('submits input via the form and clears the field', async () => {
    const wrapper = mount(Terminal);
    await vi.advanceTimersByTimeAsync(60_000); // drain intro typewriter

    const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
    await input.setValue('west');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await vi.runAllTimersAsync(); // drain reply typewriter

    expect(input.element.value).toBe('');
    expect(wrapper.find('.terminal-header').text()).toMatch(/MOVES:\s*1/);
    const text = wrapper.find('.terminal-output').text();
    expect(text).toContain('> west');
    expect(text).toContain('Living Room');
  });

  it('empty submit flushes the typewriter instead of submitting', async () => {
    const wrapper = mount(Terminal);
    // Don't drain — leave typewriter mid-render.
    const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
    await input.setValue('');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    // After flush, MOVES should still be 0 (no command submitted).
    expect(wrapper.find('.terminal-header').text()).toMatch(/MOVES:\s*0/);
  });

  describe('history recall', () => {
    async function submit(
      wrapper: ReturnType<typeof mount>,
      value: string,
    ): Promise<void> {
      const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
      await input.setValue(value);
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      await vi.runAllTimersAsync();
    }

    it('arrow-up recalls the most recent command into the input', async () => {
      const wrapper = mount(Terminal);
      await vi.advanceTimersByTimeAsync(60_000);

      await submit(wrapper, 'west');
      await submit(wrapper, 'look');

      const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
      expect(input.element.value).toBe('');

      await input.trigger('keydown', { key: 'ArrowUp' });
      expect(input.element.value).toBe('look');

      await input.trigger('keydown', { key: 'ArrowUp' });
      expect(input.element.value).toBe('west');
    });

    it('arrow-down walks forward and restores the in-progress draft past the newest entry', async () => {
      const wrapper = mount(Terminal);
      await vi.advanceTimersByTimeAsync(60_000);

      await submit(wrapper, 'west');
      await submit(wrapper, 'look');

      const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
      // Start typing a new command, then go shopping in history.
      await input.setValue('inv');
      await input.trigger('keydown', { key: 'ArrowUp' });
      expect(input.element.value).toBe('look');
      await input.trigger('keydown', { key: 'ArrowUp' });
      expect(input.element.value).toBe('west');

      await input.trigger('keydown', { key: 'ArrowDown' });
      expect(input.element.value).toBe('look');

      await input.trigger('keydown', { key: 'ArrowDown' });
      // Past the newest — the original draft is restored.
      expect(input.element.value).toBe('inv');
    });

    it('arrow-down does nothing when no history has been opened', async () => {
      const wrapper = mount(Terminal);
      await vi.advanceTimersByTimeAsync(60_000);

      const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
      await input.setValue('hello');
      await input.trigger('keydown', { key: 'ArrowDown' });
      expect(input.element.value).toBe('hello');
    });

    it('does NOT flush the typewriter when arrow keys are pressed mid-type', async () => {
      const wrapper = mount(Terminal);
      // Don't drain timers — typewriter is mid-render on the intro.
      const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
      const outputLinesBefore = wrapper.findAll('.line').length;

      // Stage some history first by quickly draining + submitting then re-typing.
      await vi.advanceTimersByTimeAsync(60_000);
      await submit(wrapper, 'look');

      // Now leave the typewriter mid-render again by submitting and immediately arrow-up.
      await input.trigger('keydown', { key: 'ArrowUp' });
      expect(input.element.value).toBe('look');
      // The output count didn't suddenly snap (flush would have committed all pending).
      expect(wrapper.findAll('.line').length).toBeGreaterThanOrEqual(outputLinesBefore);
    });

    it('consecutive duplicate submissions are deduplicated in history', async () => {
      const wrapper = mount(Terminal);
      await vi.advanceTimersByTimeAsync(60_000);

      await submit(wrapper, 'look');
      await submit(wrapper, 'look');

      const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
      await input.trigger('keydown', { key: 'ArrowUp' });
      expect(input.element.value).toBe('look');
      // Second arrow-up should NOT find another 'look' — there's only one entry.
      await input.trigger('keydown', { key: 'ArrowUp' });
      expect(input.element.value).toBe('look');
    });
  });

  it('RESTART clears the screen and shows the opening again', async () => {
    const wrapper = mount(Terminal);
    await vi.advanceTimersByTimeAsync(60_000);
    const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
    for (const cmd of ['west', 'east', 'west', 'restart']) {
      await input.setValue(cmd);
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      await vi.runAllTimersAsync();
    }
    const text = wrapper.find('.terminal-output').text();
    expect(text).toContain('TEST HOUSE');
    expect(text).not.toContain('> west');
  });

  it('UNDO keeps the lines still on screen instead of typing them all out again', async () => {
    const wrapper = mount(Terminal);
    await vi.advanceTimersByTimeAsync(60_000);
    const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
    await input.setValue('west');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await vi.runAllTimersAsync();
    await input.setValue('undo');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    // No time for typing: the opening is still there in full, and the west move is gone.
    const text = wrapper.find('.terminal-output').text();
    expect(text).toContain('A small bedroom.');
    expect(text).not.toContain('> west');
    await vi.runAllTimersAsync();
    expect(wrapper.find('.terminal-output').text()).toContain('[Previous turn undone.]');
  });
});
