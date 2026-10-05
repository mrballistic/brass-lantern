<script setup lang="ts">
import { ref, onMounted } from 'vue';
import CrtBootSequence from '@/components/CrtBootSequence.vue';
import Terminal from '@/components/Terminal.vue';
import ConsentBanner from '@/components/ConsentBanner.vue';
import { autoBootCartridge, hasProgress } from '@/cartridges';

const bootComplete = ref(false);
const fastBoot = ref(false);

onMounted(() => {
  const c = autoBootCartridge();
  fastBoot.value = c !== null && hasProgress(c);
});

function onBootComplete(): void {
  bootComplete.value = true;
}

// Micro-glitch loop.
const glitchClass = ref('');
function scheduleGlitch(): void {
  const min = 15_000;
  const max = 30_000;
  const delay = min + Math.random() * (max - min);
  setTimeout(() => {
    glitchClass.value = 'crt-glitch-pulse';
    setTimeout(() => {
      glitchClass.value = '';
      scheduleGlitch();
    }, 80);
  }, delay);
}
onMounted(scheduleGlitch);
</script>

<template>
  <div class="crt-shell">
    <div class="crt-noise" />
    <div class="crt-vignette" />

    <div class="crt-flicker-base">
      <div class="crt-flicker-secondary">
        <div class="crt-glitch" :class="glitchClass">
          <Terminal v-if="bootComplete" />
        </div>
      </div>
    </div>

    <ConsentBanner v-if="bootComplete" />

    <CrtBootSequence
      v-if="!bootComplete"
      :fast="fastBoot"
      @complete="onBootComplete"
    />
  </div>
</template>
