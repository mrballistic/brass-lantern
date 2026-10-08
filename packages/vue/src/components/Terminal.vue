<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { terminalTitle } from '../options.ts';
import { useGameContext } from '../stores/context.ts';
import { useSession } from '../stores/session.ts';
import { useTypewriter } from '../composables/useTypewriter.ts';
import type { OutputLine } from '@brass-lantern/engine';

const game = useGameContext();
const session = useSession(game);
const { output, isParsing, restored, status, title, mode } = session;

const typer = useTypewriter();
const inputEl = ref<HTMLInputElement | null>(null);
const scrollEl = ref<HTMLDivElement | null>(null);
const inputValue = ref('');
const fileEl = ref<HTMLInputElement | null>(null);

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

// The lines from `output` already enqueued to the typewriter.
let enqueued: OutputLine[] = [];

function enqueueNew(instant: boolean): void {
  if (output.value.length < enqueued.length) {
    // The output shrank or was replaced. UNDO keeps the start of the screen:
    // show what's still there at once, and type only what's new. After
    // RESTART nothing is shared, so the screen starts over.
    let kept = 0;
    while (kept < output.value.length && output.value[kept].id === enqueued[kept]?.id) kept++;
    enqueued = output.value.slice(0, kept);
    typer.show(enqueued);
  }
  const slice = output.value.slice(enqueued.length);
  if (slice.length === 0) return;
  enqueued = [...enqueued, ...slice];
  typer.enqueue(slice, { instant });
}

onMounted(async () => {
  // Fires while arrow keys are held, which keyup can't see.
  document.addEventListener('selectionchange', syncCaret);
  await session.boot();
  // A restored session renders instantly; anything new after it types out.
  enqueueNew(restored.value);
  // An embedded game can leave the page's focus (and scroll) alone: autofocus: false.
  if (game.options.autofocus !== false) focusInput();
});

onUnmounted(() => document.removeEventListener('selectionchange', syncCaret));

// Inserting or ejecting a cartridge clears the screen.
watch(mode, () => {
  typer.reset();
  enqueued = [];
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
  // Open the picker now, inside the keypress, or the browser blocks it.
  if (session.wantsFile(v)) fileEl.value?.click();
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

async function onFileChosen(): Promise<void> {
  const el = fileEl.value;
  const file = el?.files?.[0];
  if (el) el.value = '';
  if (file) await session.loadFile(file);
  focusInput();
}

// Only the menu takes a dropped story file; in a game, a drop does nothing.
async function onDrop(e: DragEvent): Promise<void> {
  const file = e.dataTransfer?.files?.[0];
  if (file && mode.value === 'menu') await session.loadFile(file);
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

const heading = terminalTitle(game.options);
// The app's consent settings, if it has any to open.
const openConsent = game.options.analytics?.openConsent;

const parsingLabel = computed(() => (isParsing.value ? '[parsing...]' : ''));
const inputPlaceholder = computed(() =>
  isParsing.value ? 'thinking...' : 'What do you do?',
);
</script>

<template>
  <div
    class="terminal"
    tabindex="-1"
    @click="onShellClick"
    @keydown="onKeydown"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <header class="terminal-header">
      <span>{{ heading }}<template v-if="title"> · {{ title }}</template></span>
      <span class="header-right">
        <button v-if="openConsent" type="button" class="consent-open" @click.stop="openConsent()">[ COOKIES ]</button>
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
    <input
      ref="fileEl"
      class="story-picker"
      type="file"
      accept=".z3,.z4,.z5,.z8,.zblorb,.zlb,.blb,.blorb"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChosen"
    />
  </div>
</template>
