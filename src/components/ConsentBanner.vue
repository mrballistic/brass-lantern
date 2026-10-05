<script setup lang="ts">
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
  <section v-if="consentOpen" class="consent" aria-label="Analytics cookies" @click.stop>
    <p class="consent-title">MEMO: RE: ANALYTICS</p>
    <p>
      This terminal can report visits and game completions to Google Analytics. It
      stores an anonymous ID in your browser to do that. Nothing is sent unless you
      accept. Your save game stays on this machine either way.
    </p>
    <div class="consent-actions">
      <button type="button" @click="choose('denied')">[ DECLINE ]</button>
      <button type="button" @click="choose('granted')">[ ACCEPT ]</button>
    </div>
    <p class="consent-note">Change this any time: type COOKIES.</p>
  </section>
</template>
