<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import CrtBootSequence from '@/components/CrtBootSequence.vue';
import Terminal from '@/components/Terminal.vue';
import ConsentBanner from '@/components/ConsentBanner.vue';
import { willResume } from '@/cartridges';
import { useGameStore } from '@/stores/game';
import { useTheme } from '@/theme/useTheme';
import type { Theme, ThemeName } from '@/theme/themes';

// The shell is the one theme root: it holds the overlays, the boot sequence and the
// terminal, so its classes and variables reach all of them.
// `theme` is the author's default and `themes` their own; the player's THEME, BLOOM and
// EFFECTS commands (kept in the store) win over the default.
const props = withDefaults(
  defineProps<{ theme?: ThemeName | Theme | string; themes?: Record<string, Theme> }>(),
  { theme: 'crt-amber', themes: () => ({}) },
);
const store = useGameStore();
store.configureThemes(props.theme, props.themes);
watch(() => [props.theme, props.themes], () => store.configureThemes(props.theme, props.themes));
const shellEl = ref<HTMLElement | null>(null);
useTheme(shellEl, {
  // Read from the prop here (not store.themeBase) so two shells keep their own defaults.
  theme: () => (store.themeChosen ? store.theme.base : props.theme),
  custom: () => props.themes,
  overrides: () => store.theme.overrides,
});

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
