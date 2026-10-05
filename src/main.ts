import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { analyticsConfigured, initAnalytics } from './services/analytics';
import { hasConsent, initConsent } from './services/consent';
import './styles/crt.css';

// Builds without a measurement ID collect nothing, so there's nothing to ask about.
if (analyticsConfigured()) {
  initConsent();
  if (hasConsent()) initAnalytics();
}
createApp(App).use(createPinia()).mount('#app');
