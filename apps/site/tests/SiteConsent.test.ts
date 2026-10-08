// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SiteConsent from '../src/SiteConsent.vue';
import { consentOpen } from '../src/services/consent';

describe('SiteConsent', () => {
  afterEach(() => {
    consentOpen.value = false;
  });

  it('shows the site’s own analytics wording, unchanged', () => {
    consentOpen.value = true;
    const w = mount(SiteConsent);
    expect(w.find('section').attributes('aria-label')).toBe('Analytics cookies');
    expect(w.findAll('p').map((p) => p.text())).toEqual([
      'MEMO: RE: ANALYTICS',
      'This terminal can report visits and game completions to Google Analytics. It stores an anonymous ID in your browser to do that. Nothing is sent unless you accept. Your save game stays on this machine either way.',
      'Change this any time: type COOKIES.',
    ]);
    expect(w.findAll('button').map((b) => b.text())).toEqual(['[ DECLINE ]', '[ ACCEPT ]']);
  });
});
