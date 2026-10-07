// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConsentBanner from '@/components/ConsentBanner.vue';

describe('ConsentBanner', () => {
  it('imports nothing from the app’s services', () => {
    const source = readFileSync('src/components/ConsentBanner.vue', 'utf8');
    expect(source).not.toMatch(/services\//);
    expect(source).not.toMatch(/app\.config/);
  });

  it('shows only while open', async () => {
    const w = mount(ConsentBanner, { props: { open: false } });
    expect(w.find('section').exists()).toBe(false);
    await w.setProps({ open: true });
    expect(w.text()).toContain('Nothing is sent unless you accept');
  });

  it('emits each choice, and changes nothing itself', async () => {
    const w = mount(ConsentBanner, { props: { open: true } });
    await w.findAll('button')[0].trigger('click');
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('choose')).toEqual([['denied'], ['granted']]);
    // Closing is the owner's call.
    expect(w.find('section').exists()).toBe(true);
  });
});
