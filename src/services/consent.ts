// Analytics consent, after the pattern in rsd-app/www (assets/consent.js).
// Nothing is sent to Google until the visitor accepts; declining, or never
// answering, means no analytics requests and no analytics IDs in storage.
// The choice lives in localStorage. The COOKIES command and the header link
// reopen the banner so it can be changed later.
//
// The answer is per origin, namespaced by the site's storagePrefix, which
// main.ts passes in (configureAnalytics) before anything reads it.

import { ref } from 'vue';

export type Consent = 'granted' | 'denied';

const consentKey = (prefix: string) => `${prefix}:analytics-consent`;
export let CONSENT_KEY = consentKey('brass-lantern');

/** Namespaces the stored answer under the site's storage prefix. */
export function configureConsent(storagePrefix: string): void {
  CONSENT_KEY = consentKey(storagePrefix);
}

/** Whether the banner is showing. Starts open when the visitor hasn't answered yet. */
export const consentOpen = ref(false);

export function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function hasConsent(): boolean {
  return readConsent() === 'granted';
}

export function saveConsent(choice: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Private mode: ask again next visit.
  }
  consentOpen.value = false;
}

export function openConsent(): void {
  consentOpen.value = true;
}

/** Show the banner on first visit. */
export function initConsent(): void {
  consentOpen.value = readConsent() === null;
}
