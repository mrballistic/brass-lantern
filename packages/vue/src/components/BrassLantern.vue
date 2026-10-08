<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, provide, watch } from 'vue';
import CrtBootSequence from './CrtBootSequence.vue';
import Terminal from './Terminal.vue';
import type { GameOptions } from '../options.ts';
import { createGameContext, GAME_CONTEXT } from '../stores/context.ts';
import { useTheme } from '../theme/useTheme.ts';

// One game: its shell (the one theme root, holding the overlays, the boot
// sequence and the terminal, so its classes and variables reach all of them),
// boot sequence and terminal. Needs Pinia installed on the app (mountGame does
// that). The default slot is shown inside the shell once booted (the site's
// consent banner goes there).
//
// The game's options are read once, at setup; only `theme` and `themes` are
// followed afterwards. The player's THEME, BLOOM and EFFECTS (kept in the store)
// win over the author's default.
const props = defineProps<{ options: GameOptions }>();

const game = createGameContext(props.options);
provide(GAME_CONTEXT, game);
const store = game.useGameStore();
const configureThemes = () => store.configureThemes(props.options.theme ?? 'crt-amber', props.options.themes ?? {});
configureThemes();
watch(() => [props.options.theme, props.options.themes], configureThemes);

const shellEl = ref<HTMLElement | null>(null);
useTheme(shellEl, {
  theme: () => store.themeBase,
  custom: () => store.customThemes,
  overrides: () => store.theme.overrides,
});

const bootComplete = ref(false);
const fastBoot = ref(false);

onMounted(() => {
  fastBoot.value = game.catalog.willResume();
});

function onBootComplete(): void {
  bootComplete.value = true;
}

// Micro-glitch loop.
const glitchClass = ref('');
let glitchTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleGlitch(): void {
  const min = 15_000;
  const max = 30_000;
  const delay = min + Math.random() * (max - min);
  glitchTimer = setTimeout(() => {
    glitchClass.value = 'crt-glitch-pulse';
    glitchTimer = setTimeout(() => {
      glitchClass.value = '';
      scheduleGlitch();
    }, 80);
  }, delay);
}
onMounted(scheduleGlitch);
onBeforeUnmount(() => clearTimeout(glitchTimer));
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

    <slot v-if="bootComplete" />

    <CrtBootSequence
      v-if="!bootComplete"
      :fast="fastBoot"
      @complete="onBootComplete"
    />
  </div>
</template>
