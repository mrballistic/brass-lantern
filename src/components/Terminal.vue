<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { openConsent } from '@/services/consent';
import { appName } from '@/app.config';
import { analyticsConfigured } from '@/services/analytics';
import { useSession } from '@/stores/session';
import { useTypewriter } from '@/composables/useTypewriter';

const session = useSession();
const { output, isParsing, restored, status, title, mode } = session;

const typer = useTypewriter();
const inputEl = ref<HTMLInputElement | null>(null);
const scrollEl = ref<HTMLDivElement | null>(null);
const inputValue = ref('');

// The block cursor is drawn at the insertion point: a hidden mirror of the text before
// the caret pushes it into place, and the native caret is transparent.
const caretIndex = ref(0);
const inputScroll = ref(0);
const beforeCaret = computed(() => inputValue.value.slice(0, caretIndex.value));

function syncCaret(): void {
  const el = inputEl.value;
  if (!el) return;
  caretIndex.value = el.selectionStart ?? el.value.length;
  inputScroll.value = el.scrollLeft;
}

// Programmatic changes (history recall, clearing on submit) put the caret at the end.
watch(inputValue, async () => {
  await nextTick();
  syncCaret();
});

// Shell-style command history. history[0] is the OLDEST entry; history.at(-1) is the newest.
// historyIndex: null = editing a fresh line; otherwise the index into `history` currently shown.
const history = ref<string[]>([]);
const historyIndex = ref<number | null>(null);
// Preserve the user's in-progress draft when they start arrowing through history.
let draft = '';
const HISTORY_LIMIT = 100;

// How many lines from `output` have already been enqueued to the typewriter.
let enqueuedCount = 0;

function enqueueNew(instant: boolean): void {
  if (output.value.length < enqueuedCount) {
    // The output was replaced (RESTART): clear the screen and start over.
    typer.reset();
    enqueuedCount = 0;
  }
  const slice = output.value.slice(enqueuedCount);
  if (slice.length === 0) return;
  enqueuedCount = output.value.length;
  typer.enqueue(slice, { instant });
}

onMounted(async () => {
  // Fires while arrow keys are held, which keyup can't see.
  document.addEventListener('selectionchange', syncCaret);
  await session.boot();
  // A restored session renders instantly; anything new after it types out.
  enqueueNew(restored.value);
  focusInput();
});

onUnmounted(() => document.removeEventListener('selectionchange', syncCaret));

// Inserting or ejecting a cartridge clears the screen.
watch(mode, () => {
  typer.reset();
  enqueuedCount = 0;
  enqueueNew(restored.value);
});

// Watch the array length, not the ref identity — Pinia mutates the array in place,
// so a default shallow watch on the ref would never fire.
watch(
  () => output.value.length,
  () => {
    enqueueNew(false);
  },
);

watch(
  () => typer.renderedLines.value.length,
  async () => {
    await nextTick();
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
  },
);

function focusInput(): void {
  setTimeout(() => inputEl.value?.focus(), 0);
}

async function onSubmit(): Promise<void> {
  const v = inputValue.value;
  if (!v.trim()) {
    // Empty enter flushes typewriter.
    typer.flush();
    return;
  }
  inputValue.value = '';
  // Push into history (dedupe consecutive duplicates) and reset cursor.
  if (history.value.at(-1) !== v) {
    history.value.push(v);
    if (history.value.length > HISTORY_LIMIT) {
      history.value.splice(0, history.value.length - HISTORY_LIMIT);
    }
  }
  historyIndex.value = null;
  draft = '';
  await session.submit(v);
}

function onShellClick(): void {
  focusInput();
}

function recallHistory(direction: 'up' | 'down'): void {
  if (history.value.length === 0) return;
  if (direction === 'up') {
    if (historyIndex.value === null) {
      // First step back — stash the in-progress draft so DOWN can restore it.
      draft = inputValue.value;
      historyIndex.value = history.value.length - 1;
    } else if (historyIndex.value > 0) {
      historyIndex.value -= 1;
    }
    inputValue.value = history.value[historyIndex.value];
  } else {
    if (historyIndex.value === null) return;
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value += 1;
      inputValue.value = history.value[historyIndex.value];
    } else {
      // Past the newest entry — restore the draft and exit history mode.
      historyIndex.value = null;
      inputValue.value = draft;
    }
  }
}

function onKeydown(e: KeyboardEvent): void {
  // Arrow keys recall history regardless of typewriter state — and never flush.
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    recallHistory('up');
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    recallHistory('down');
    return;
  }
  // Any other printable key flushes if typing.
  if (typer.isTyping.value && e.key.length === 1) {
    typer.flush();
  }
}

// Phosphor decay classes.
const totalRendered = computed(() => typer.renderedLines.value.length);
function decayClass(idx: number): string {
  const reverseIdx = totalRendered.value - 1 - idx;
  if (reverseIdx < 5) return '';
  if (reverseIdx < 20) return 'decay-recent';
  return 'decay-old';
}

const version = __APP_VERSION__;
const showCookies = analyticsConfigured();

const parsingLabel = computed(() => (isParsing.value ? '[parsing...]' : ''));
const inputPlaceholder = computed(() =>
  isParsing.value ? 'thinking...' : 'What do you do?',
);
</script>

<template>
  <div class="terminal" tabindex="-1" @click="onShellClick" @keydown="onKeydown">
    <header class="terminal-header">
      <span>{{ appName }} v{{ version }}<template v-if="title"> · {{ title }}</template></span>
      <span class="header-right">
        <button v-if="showCookies" type="button" class="consent-open" @click.stop="openConsent">[ COOKIES ]</button>
        <span class="moves">{{ status }}</span>
      </span>
    </header>

    <div ref="scrollEl" class="terminal-output">
      <div
        v-for="(line, i) in typer.renderedLines.value"
        :key="line.id"
        class="line"
        :class="[line.type, decayClass(i)]"
      >{{ line.text }}<span v-if="!line.done" class="caret">▌</span></div>
      <div v-if="isParsing" class="line parsing">{{ parsingLabel }}</div>
    </div>

    <form class="terminal-input-bar" @submit.prevent="onSubmit">
      <span class="prompt">&gt;</span>
      <span class="input-field">
        <input
          ref="inputEl"
          v-model="inputValue"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :disabled="isParsing"
          :placeholder="inputPlaceholder"
          @input="syncCaret"
        @keyup="syncCaret"
          @click="syncCaret"
          @select="syncCaret"
          @scroll="syncCaret"
        />
        <span
          v-show="!isParsing"
          class="caret-mirror"
          aria-hidden="true"
          :style="{ transform: `translateX(${-inputScroll}px)` }"
        ><span class="caret-before">{{ beforeCaret }}</span><span class="block-cursor" aria-hidden="true" /></span>
      </span>
    </form>
  </div>
</template>
