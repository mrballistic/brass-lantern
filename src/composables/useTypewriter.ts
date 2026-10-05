import { ref, type Ref } from 'vue';
import type { OutputLine, OutputLineType } from '@/types/game';

/**
 * Per-line typewriter. Owns a FIFO queue of lines, types each character-by-character at
 * a rate that depends on the line's type, and pauses between lines.
 *
 * Lines that should render instantly (input echo, system, restored history) skip the
 * typewriter and are committed immediately.
 *
 * `flush()` snaps the current and queued lines to fully typed state and returns control.
 */
export interface UseTypewriter {
  /** Lines that have begun rendering (mix of fully and partially typed). */
  renderedLines: Ref<RenderedLine[]>;
  /** True while any line is in mid-type or queued. */
  isTyping: Ref<boolean>;
  /** Enqueue lines for sequential typewriter rendering. */
  enqueue: (lines: OutputLine[], opts?: { instant?: boolean }) => void;
  /** Instantly commit any in-progress and queued lines. */
  flush: () => void;
  /** Clear all rendered lines and any queue (used on RESTART). */
  reset: () => void;
}

export interface RenderedLine {
  id: string;
  text: string;
  fullText: string;
  type: OutputLineType;
  done: boolean;
}

const SPEED_BY_TYPE: Record<OutputLineType, number> = {
  input: 0,         // instant
  system: 0,        // instant
  location: 10,     // fast (room descriptions)
  event: 18,        // standard (dramatic)
  decorative: 12,   // medium
  prose: 10,        // fast (room descriptions / replies)
};

const INTER_LINE_PAUSE_MS = 150;

export function useTypewriter(): UseTypewriter {
  const renderedLines = ref<RenderedLine[]>([]);
  const isTyping = ref(false);

  // Active animation bookkeeping.
  let queue: { line: OutputLine; instant: boolean }[] = [];
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  let activeLineIndex = -1;
  let activeCharIndex = 0;

  function stopTimer(): void {
    if (activeTimer !== null) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
  }

  function commitLine(line: OutputLine, instant: boolean): RenderedLine {
    const rendered: RenderedLine = {
      id: line.id,
      text: instant ? line.text : '',
      fullText: line.text,
      type: line.type,
      done: instant,
    };
    renderedLines.value.push(rendered);
    return rendered;
  }

  function step(): void {
    const idx = activeLineIndex;
    const line = renderedLines.value[idx];
    if (!line) {
      isTyping.value = false;
      return;
    }
    if (activeCharIndex >= line.fullText.length) {
      // Update the reactive entry in-place by reassigning.
      renderedLines.value[idx] = { ...line, text: line.fullText, done: true };
      activeTimer = setTimeout(() => {
        startNext();
      }, INTER_LINE_PAUSE_MS);
      return;
    }
    activeCharIndex += 1;
    const partial = line.fullText.slice(0, activeCharIndex);
    renderedLines.value[idx] = { ...line, text: partial };
    const speed = SPEED_BY_TYPE[line.type] ?? 12;
    activeTimer = setTimeout(step, speed);
  }

  function startNext(): void {
    stopTimer();
    const next = queue.shift();
    if (!next) {
      isTyping.value = false;
      return;
    }
    if (next.instant || SPEED_BY_TYPE[next.line.type] === 0) {
      commitLine(next.line, true);
      // No inter-line pause for instants — chain immediately.
      activeTimer = setTimeout(startNext, 0);
      return;
    }
    commitLine(next.line, false);
    activeLineIndex = renderedLines.value.length - 1;
    activeCharIndex = 0;
    isTyping.value = true;
    step();
  }

  function enqueue(lines: OutputLine[], opts?: { instant?: boolean }): void {
    const instant = Boolean(opts?.instant);
    for (const l of lines) queue.push({ line: l, instant });
    if (!isTyping.value && activeTimer === null) {
      startNext();
    }
  }

  function flush(): void {
    stopTimer();
    // Finish in-progress line.
    if (activeLineIndex >= 0 && activeLineIndex < renderedLines.value.length) {
      const cur = renderedLines.value[activeLineIndex];
      if (cur && !cur.done) {
        renderedLines.value[activeLineIndex] = { ...cur, text: cur.fullText, done: true };
      }
    }
    // Drain the queue into committed state.
    for (const q of queue) commitLine(q.line, true);
    queue = [];
    isTyping.value = false;
    activeLineIndex = -1;
    activeCharIndex = 0;
  }

  function reset(): void {
    stopTimer();
    queue = [];
    renderedLines.value = [];
    isTyping.value = false;
    activeLineIndex = -1;
    activeCharIndex = 0;
  }

  return {
    renderedLines,
    isTyping,
    enqueue,
    flush,
    reset,
  };
}
