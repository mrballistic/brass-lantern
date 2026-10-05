import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CrtBootSequence from '@/components/CrtBootSequence.vue';

describe('CrtBootSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('walks through phases 1 → 2 → 3 → 4 on the cold boot path and emits @complete', async () => {
    const wrapper = mount(CrtBootSequence);

    // Phase 1 fires synchronously inside onMounted.
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('.crt-boot').classes()).toContain('phase-1');

    // Phase 1 → 2 after 400ms (cold boot).
    await vi.advanceTimersByTimeAsync(400);
    expect(wrapper.find('.crt-boot').classes()).toContain('phase-2');

    // Phase 2 → 3 after another 500ms.
    await vi.advanceTimersByTimeAsync(500);
    expect(wrapper.find('.crt-boot').classes()).toContain('phase-3');

    // Phase 3 → 4 (complete) after another 600ms.
    await vi.advanceTimersByTimeAsync(600);
    // At phase 4 the overlay unmounts (v-if phase < 4).
    expect(wrapper.find('.crt-boot').exists()).toBe(false);
    expect(wrapper.emitted('complete')).toBeTruthy();
    expect(wrapper.emitted('complete')!.length).toBe(1);
  });

  it('uses the abbreviated path on restore (fast=true): no phase 3', async () => {
    const wrapper = mount(CrtBootSequence, { props: { fast: true } });

    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('.crt-boot').classes()).toContain('phase-1');
    expect(wrapper.find('.crt-boot').classes()).toContain('fast');

    // Fast: phase 1 → 2 after 200ms, then phase 2 → 4 after another 250ms (no phase 3).
    await vi.advanceTimersByTimeAsync(200);
    expect(wrapper.find('.crt-boot').classes()).toContain('phase-2');

    await vi.advanceTimersByTimeAsync(250);
    // Should jump straight to phase 4 (overlay gone) without ever showing phase-3.
    expect(wrapper.find('.crt-boot').exists()).toBe(false);
    expect(wrapper.emitted('complete')).toBeTruthy();
  });

  it('emits complete exactly once', async () => {
    const wrapper = mount(CrtBootSequence);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000); // run through any remaining timers
    expect(wrapper.emitted('complete')!.length).toBe(1);
  });

  it('renders the ignition element while booting', async () => {
    const wrapper = mount(CrtBootSequence);
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.find('.ignition').exists()).toBe(true);
  });
});
