<script setup lang="ts">
// The analytics consent memo, presentational only: the app owns the answer,
// stores it, and decides when the memo is open. Its wording is the app's to
// give (it knows which analytics it runs); the defaults name no vendor.
withDefaults(
  defineProps<{
    open: boolean;
    /** The memo's heading. */
    title?: string;
    /** What is collected, and that nothing is sent until the visitor accepts. */
    body?: string;
    /** The line under the buttons. */
    note?: string;
    /** The section's accessible name. */
    label?: string;
  }>(),
  {
    title: 'ANALYTICS',
    body: 'This game can report visits and game completions to the site’s analytics. Nothing is sent unless you accept. Your save game stays on this machine either way.',
    note: 'Change this any time: type COOKIES.',
    label: 'Analytics cookies',
  },
);
const emit = defineEmits<{ (e: 'choose', choice: 'granted' | 'denied'): void }>();
</script>

<template>
  <section v-if="open" class="consent" :aria-label="label" @click.stop>
    <p class="consent-title">{{ title }}</p>
    <p>{{ body }}</p>
    <div class="consent-actions">
      <button type="button" @click="emit('choose', 'denied')">[ DECLINE ]</button>
      <button type="button" @click="emit('choose', 'granted')">[ ACCEPT ]</button>
    </div>
    <p class="consent-note">{{ note }}</p>
  </section>
</template>
