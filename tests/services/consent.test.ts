// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import {
  CONSENT_KEY as KEY,
  consentOpen,
  hasConsent,
  initConsent,
  openConsent,
  readConsent,
  saveConsent,
} from '@/services/consent';
import SiteConsent from '@/SiteConsent.vue';


describe('consent', () => {
  beforeEach(() => {
    localStorage.clear();
    consentOpen.value = false;
  });

  it('opens the banner on a first visit', () => {
    initConsent();
    expect(consentOpen.value).toBe(true);
    expect(readConsent()).toBeNull();
    expect(hasConsent()).toBe(false);
  });

  it('stays closed once the visitor has answered either way', () => {
    localStorage.setItem(KEY, 'denied');
    initConsent();
    expect(consentOpen.value).toBe(false);
    localStorage.setItem(KEY, 'granted');
    initConsent();
    expect(consentOpen.value).toBe(false);
    expect(hasConsent()).toBe(true);
  });

  it('ignores junk in storage', () => {
    localStorage.setItem(KEY, 'maybe');
    expect(readConsent()).toBeNull();
  });

  it('saving closes the banner and persists the choice', () => {
    openConsent();
    saveConsent('granted');
    expect(consentOpen.value).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('granted');
  });

  it('the site’s banner buttons record the choice', async () => {
    openConsent();
    const wrapper = mount(SiteConsent);
    expect(wrapper.text()).toContain('Nothing is sent unless you accept');
    await wrapper.findAll('button')[0].trigger('click');
    expect(readConsent()).toBe('denied');
    expect(wrapper.find('section').exists()).toBe(false);

    openConsent();
    await wrapper.vm.$nextTick();
    await wrapper.findAll('button')[1].trigger('click');
    expect(readConsent()).toBe('granted');

    openConsent();
    await wrapper.vm.$nextTick();
    await wrapper.findAll('button')[0].trigger('click');
    expect(readConsent()).toBe('denied');
  });
});
