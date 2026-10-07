import { appName, cartridges, storagePrefix } from './app.config';
import ConsentBanner from './components/ConsentBanner.vue';
import { mountGame } from './mount';
import { analyticsConfigured, configureAnalytics, initAnalytics, track } from './services/analytics';
import { hasConsent, initConsent, openConsent } from './services/consent';
import './styles/crt.css';

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
  },
  ConsentBanner,
);
