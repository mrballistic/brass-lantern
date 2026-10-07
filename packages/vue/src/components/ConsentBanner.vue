<script setup lang="ts">
// The analytics consent memo, presentational only: the app owns the answer,
// stores it, and decides when the memo is open.
defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'choose', choice: 'granted' | 'denied'): void }>();
</script>

<template>
  <section v-if="open" class="consent" aria-label="Analytics cookies" @click.stop>
    <p class="consent-title">MEMO: RE: ANALYTICS</p>
    <p>
      This terminal can report visits and game completions to Google Analytics. It
      stores an anonymous ID in your browser to do that. Nothing is sent unless you
      accept. Your save game stays on this machine either way.
    </p>
    <div class="consent-actions">
      <button type="button" @click="emit('choose', 'denied')">[ DECLINE ]</button>
      <button type="button" @click="emit('choose', 'granted')">[ ACCEPT ]</button>
    </div>
    <p class="consent-note">Change this any time: type COOKIES.</p>
  </section>
</template>
