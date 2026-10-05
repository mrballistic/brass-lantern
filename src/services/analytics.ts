// Direct GA4 Measurement Protocol — no gtag.js, no GTM, no consent state.
// We construct /g/collect URLs ourselves and fire them via sendBeacon.
//
// Why direct: gtag.js loads but silently refuses to transmit on this property
// despite consent being granted. After exhaustive debugging the simplest fix
// was to drop gtag entirely. We lose Enhanced Measurement (auto scroll /
// outbound click / video tracking) but gain deterministic, debuggable sends.
//
// What we still get:
// - page_view fired on init with the real document.title and location
// - track('event_name', { … }) for custom events (game_start etc.)
// - Persistent client_id stored in localStorage (one per browser)
// - Per-tab session_id stored in sessionStorage (resets on tab close)
// - Consent required: nothing is sent, and no IDs are stored, until the
//   visitor accepts the banner (services/consent.ts)
// - DNT honored — if navigator.doNotTrack === '1' we send nothing
// - Silent fallback to <img> GET if sendBeacon fails or isn't available

import { storagePrefix } from '@/app.config';
import { hasConsent } from './consent';

const RAW_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const MEASUREMENT_ID =
  typeof RAW_ID === 'string' && RAW_ID && !RAW_ID.startsWith('G-XXX') ? RAW_ID : null;

const ENDPOINT = 'https://www.google-analytics.com/g/collect';
export const CLIENT_ID_KEY = `${storagePrefix}:ga-cid`;
export const SESSION_ID_KEY = `${storagePrefix}:ga-sid`;

let initialized = false;

/** True when this build has a measurement ID, i.e. there is anything to consent to. */
export function analyticsConfigured(): boolean {
  return MEASUREMENT_ID !== null;
}

function dntEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  return nav.doNotTrack === '1' || nav.msDoNotTrack === '1';
}

/** Stable per-browser identifier. GA expects the form `<random>.<unix-seconds>`. */
function getOrCreateClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const cid = `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
    window.localStorage.setItem(CLIENT_ID_KEY, cid);
    return cid;
  } catch {
    // localStorage unavailable (private mode / quota) — fall back to per-call random.
    return `ephemeral.${Math.floor(Date.now() / 1000)}`;
  }
}

/** Per-tab session id. Cleared when the tab closes; that's the desired semantic. */
function getOrCreateSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const sid = String(Math.floor(Date.now() / 1000));
    window.sessionStorage.setItem(SESSION_ID_KEY, sid);
    return sid;
  } catch {
    return String(Math.floor(Date.now() / 1000));
  }
}

interface SendOptions {
  /** Set when this is the first event of the session (engagement). */
  isFirstHit?: boolean;
}

function send(name: string, params: Record<string, unknown> = {}, opts: SendOptions = {}): void {
  if (!MEASUREMENT_ID) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (dntEnabled()) return;
  if (!hasConsent()) return;

  const cid = getOrCreateClientId();
  const sid = getOrCreateSessionId();

  const url = new URL(ENDPOINT);
  url.searchParams.set('v', '2');
  url.searchParams.set('tid', MEASUREMENT_ID);
  url.searchParams.set('cid', cid);
  url.searchParams.set('sid', sid);
  url.searchParams.set('en', name);
  url.searchParams.set('dl', window.location.href);
  url.searchParams.set('dt', document.title);
  if (document.referrer) url.searchParams.set('dr', document.referrer);
  url.searchParams.set('ul', navigator.language || 'en');
  url.searchParams.set('sr', `${window.screen.width}x${window.screen.height}`);
  if (opts.isFirstHit) url.searchParams.set('_fv', '1');
  // _s is a sequence number; GA4 expects an increasing value per session. A
  // monotonic timestamp is fine.
  url.searchParams.set('_s', String(Date.now()));

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'number') {
      url.searchParams.set(`epn.${key}`, String(value));
    } else {
      url.searchParams.set(`ep.${key}`, String(value));
    }
  }

  const finalUrl = url.toString();
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(finalUrl);
      if (ok) return;
    }
  } catch {
    // fall through to image fallback
  }
  // Last-resort transport — works in every browser.
  new Image().src = finalUrl;
}

/**
 * Initialize analytics once per page. Fires the initial page_view immediately.
 * Returns true if a real send was attempted, false if skipped (no ID, DNT, etc).
 */
export function initAnalytics(): boolean {
  if (initialized) return Boolean(MEASUREMENT_ID);
  initialized = true;
  if (!MEASUREMENT_ID) return false;
  if (typeof window === 'undefined') return false;
  if (dntEnabled()) return false;
  if (!hasConsent()) {
    // Not yet: a later accept calls initAnalytics again.
    initialized = false;
    return false;
  }
  // _fv=1 (first visit) signals GA to also emit first_visit/session_start.
  send('page_view', {}, { isFirstHit: true });
  return true;
}

/**
 * Fire a custom GA4 event. Safe no-op when the measurement ID is unset
 * or DNT is on.
 */
export function track(event: string, params?: Record<string, unknown>): void {
  send(event, params ?? {});
}

/** Consent withdrawn: drop the stored IDs so nothing ties future visits together. */
export function forgetAnalytics(): void {
  initialized = false;
  try {
    window.localStorage.removeItem(CLIENT_ID_KEY);
    window.sessionStorage.removeItem(SESSION_ID_KEY);
  } catch {
    /* ignore */
  }
}

/** Test seam — resets module state and clears the persistent IDs. */
export function __resetForTests(): void {
  forgetAnalytics();
}
