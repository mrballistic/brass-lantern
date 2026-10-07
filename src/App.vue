<script setup lang="ts">
import { ref, onMounted } from 'vue';
import CrtBootSequence from '@/components/CrtBootSequence.vue';
import Terminal from '@/components/Terminal.vue';
import ConsentBanner from '@/components/ConsentBanner.vue';
import { willResume } from '@/cartridges';
import { useTheme } from '@/theme/useTheme';
import type { Theme, ThemeName } from '@/theme/themes';

// The shell is the one theme root: it holds the overlays, the boot sequence and the
// terminal, so its classes and variables reach all of them.
const props = withDefaults(defineProps<{ theme?: ThemeName | Theme | string }>(), { theme: 'crt-amber' });
const shellEl = ref<HTMLElement | null>(null);
useTheme(shellEl, { theme: () => props.theme });

const bootComplete = ref(false);
const fastBoot = ref(false);

onMounted(() => {
  fastBoot.value = willResume();
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
  <div ref="shellEl" class="crt-shell">
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
