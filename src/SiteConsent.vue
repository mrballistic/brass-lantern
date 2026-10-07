<script setup lang="ts">
// The site's consent banner: the library's presentational ConsentBanner, wired
// to the site's consent state and GA4 sender. main.ts puts it in the game's slot.
import ConsentBanner from '@/components/ConsentBanner.vue';
import { consentOpen, readConsent, saveConsent, type Consent } from '@/services/consent';
import { forgetAnalytics, initAnalytics } from '@/services/analytics';

function choose(choice: Consent): void {
  const previous = readConsent();
  saveConsent(choice);
  if (choice === 'granted') initAnalytics();
  else if (previous === 'granted') forgetAnalytics();
}
</script>

<template>
  <ConsentBanner :open="consentOpen" @choose="choose" />
</template>
