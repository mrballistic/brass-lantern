import { appName, cartridges, storagePrefix } from './app.config';
import { mountGame } from '@brass-lantern/vue';
import SiteConsent from './SiteConsent.vue';
import { analyticsConfigured, configureAnalytics, initAnalytics, track } from './services/analytics';
import { hasConsent, initConsent, openConsent } from './services/consent';
import '@brass-lantern/vue/style.css';

configureAnalytics(storagePrefix);
// Builds without a measurement ID collect nothing, so there's nothing to ask about.
if (analyticsConfigured()) {
  initConsent();
  if (hasConsent()) initAnalytics();
}

mountGame(
  '#app',
  {
    cartridges,
    terminalName: appName,
    storagePrefix,
    intentEndpoint: '/api/parse-intent',
    analytics: { onEvent: track, ...(analyticsConfigured() ? { openConsent } : {}) },
    version: __APP_VERSION__,
    // Story files are served from the site's base (VITE_BASE under GitHub Pages).
    storyBaseUrl: import.meta.env.BASE_URL,
    // The engine's script freeze, on in development.
    devChecks: import.meta.env.DEV,
  },
  { slot: SiteConsent },
);
