<script setup lang="ts">
// The site's consent banner: the library's presentational ConsentBanner, wired
// to the site's consent state and GA4 sender. main.ts puts it in the game's slot.
import { ConsentBanner } from '@brass-lantern/vue';
import { consentOpen, readConsent, saveConsent, type Consent } from './services/consent';
import { forgetAnalytics, initAnalytics } from './services/analytics';

function choose(choice: Consent): void {
  const previous = readConsent();
  saveConsent(choice);
  if (choice === 'granted') initAnalytics();
  else if (previous === 'granted') forgetAnalytics();
}

// The site's own wording: it runs Google Analytics, so it says so.
const TITLE = 'MEMO: RE: ANALYTICS';
const BODY =
  'This terminal can report visits and game completions to Google Analytics. It stores an anonymous ID in your browser to do that. Nothing is sent unless you accept. Your save game stays on this machine either way.';
</script>

<template>
  <ConsentBanner :open="consentOpen" :title="TITLE" :body="BODY" @choose="choose" />
</template>
