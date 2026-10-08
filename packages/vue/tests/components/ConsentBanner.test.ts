// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConsentBanner from '../../src/components/ConsentBanner.vue';

describe('ConsentBanner', () => {
  it('imports nothing from the app’s services', () => {
    const source = readFileSync(`${import.meta.dirname}/../../src/components/ConsentBanner.vue`, 'utf8');
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

  it('names no analytics vendor by default', () => {
    const w = mount(ConsentBanner, { props: { open: true } });
    expect(w.text()).not.toMatch(/google/i);
    expect(w.find('.consent-title').text()).toBe('ANALYTICS');
    expect(w.text()).toContain('Nothing is sent unless you accept.');
    expect(w.find('.consent-note').text()).toBe('Change this any time: type COOKIES.');
    expect(w.find('section').attributes('aria-label')).toBe('Analytics cookies');
  });

  it('takes the app’s own wording as props', () => {
    const w = mount(ConsentBanner, {
      props: { open: true, title: 'MEMO', body: 'We count visits with Acme Stats.', note: 'Type COOKIES to change it.', label: 'Acme cookies' },
    });
    expect(w.findAll('p').map((p) => p.text())).toEqual(['MEMO', 'We count visits with Acme Stats.', 'Type COOKIES to change it.']);
    expect(w.find('section').attributes('aria-label')).toBe('Acme cookies');
  });
});
