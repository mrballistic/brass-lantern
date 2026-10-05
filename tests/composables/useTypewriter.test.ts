import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { useTypewriter } from '@/composables/useTypewriter';
import type { OutputLine, OutputLineType } from '@/types/game';

let lineCounter = 0;
function buildLine(text: string, type: OutputLineType): OutputLine {
  lineCounter += 1;
  return {
    id: `test-${lineCounter}`,
    text,
    timestamp: lineCounter,
    type,
  };
}

const INTER_LINE_PAUSE_MS = 150;

describe('useTypewriter', () => {
  beforeEach(() => {
    lineCounter = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueue([]) does nothing', () => {
    const tw = useTypewriter();
    tw.enqueue([]);
    expect(tw.renderedLines.value).toHaveLength(0);
    expect(tw.isTyping.value).toBe(false);
  });

  it('types a prose line character-by-character at 10ms/char', async () => {
    const tw = useTypewriter();
    const line = buildLine('hi', 'prose');
    tw.enqueue([line]);

    // startNext is called synchronously by enqueue → commits an empty line and calls step()
    // immediately, which types the first character before scheduling the next via setTimeout.
    expect(tw.renderedLines.value).toHaveLength(1);
    expect(tw.isTyping.value).toBe(true);
    expect(tw.renderedLines.value[0].fullText).toBe('hi');
    expect(tw.renderedLines.value[0].done).toBe(false);
    expect(tw.renderedLines.value[0].text).toBe('h');

    // Advance 10ms — next character.
    await vi.advanceTimersByTimeAsync(10);
    expect(tw.renderedLines.value[0].text).toBe('hi');

    // After full text rendered, the next step() call detects activeCharIndex >=
    // fullText.length, marks done:true and schedules startNext after INTER_LINE_PAUSE_MS.
    await vi.advanceTimersByTimeAsync(10);
    expect(tw.renderedLines.value[0].done).toBe(true);

    // After the inter-line pause, queue is drained → isTyping false.
    await vi.advanceTimersByTimeAsync(INTER_LINE_PAUSE_MS);
    expect(tw.isTyping.value).toBe(false);
  });

  it('instant: true commits immediately with done=true', () => {
    const tw = useTypewriter();
    const line = buildLine('instant text', 'prose');
    tw.enqueue([line], { instant: true });

    expect(tw.renderedLines.value).toHaveLength(1);
    expect(tw.renderedLines.value[0].text).toBe('instant text');
    expect(tw.renderedLines.value[0].done).toBe(true);
  });

  it('input lines (speed=0) commit instantly without instant:true', async () => {
    const tw = useTypewriter();
    const line = buildLine('> look', 'input');
    tw.enqueue([line]);

    expect(tw.renderedLines.value).toHaveLength(1);
    expect(tw.renderedLines.value[0].text).toBe('> look');
    expect(tw.renderedLines.value[0].done).toBe(true);

    // The chained startNext(0) drains the empty queue and clears isTyping.
    await vi.advanceTimersByTimeAsync(0);
    expect(tw.isTyping.value).toBe(false);
  });

  it('system lines (speed=0) commit instantly without instant:true', async () => {
    const tw = useTypewriter();
    const line = buildLine('[saved]', 'system');
    tw.enqueue([line]);

    expect(tw.renderedLines.value).toHaveLength(1);
    expect(tw.renderedLines.value[0].text).toBe('[saved]');
    expect(tw.renderedLines.value[0].done).toBe(true);

    await vi.advanceTimersByTimeAsync(0);
    expect(tw.isTyping.value).toBe(false);
  });

  it('event lines render at 18ms/char', async () => {
    const tw = useTypewriter();
    const line = buildLine('ab', 'event');
    tw.enqueue([line]);

    // After enqueue, step() ran once and produced first char "a".
    await nextTick();
    expect(tw.renderedLines.value[0].text).toBe('a');

    // After 17ms, the next char has not yet been typed.
    await vi.advanceTimersByTimeAsync(17);
    expect(tw.renderedLines.value[0].text).toBe('a');

    // After one more ms (total 18), the next char arrives.
    await vi.advanceTimersByTimeAsync(1);
    expect(tw.renderedLines.value[0].text).toBe('ab');
  });

  it('location lines render at 10ms/char', async () => {
    const tw = useTypewriter();
    const line = buildLine('ab', 'location');
    tw.enqueue([line]);

    await nextTick();
    expect(tw.renderedLines.value[0].text).toBe('a');

    await vi.advanceTimersByTimeAsync(9);
    expect(tw.renderedLines.value[0].text).toBe('a');

    await vi.advanceTimersByTimeAsync(1);
    expect(tw.renderedLines.value[0].text).toBe('ab');
  });

  it('decorative lines render at 12ms/char', async () => {
    const tw = useTypewriter();
    const line = buildLine('ab', 'decorative');
    tw.enqueue([line]);

    await nextTick();
    expect(tw.renderedLines.value[0].text).toBe('a');

    await vi.advanceTimersByTimeAsync(11);
    expect(tw.renderedLines.value[0].text).toBe('a');

    await vi.advanceTimersByTimeAsync(1);
    expect(tw.renderedLines.value[0].text).toBe('ab');
  });

  it('renders multi-line queue sequentially with 150ms pause between', async () => {
    const tw = useTypewriter();
    const lineA = buildLine('a', 'prose'); // 1 char @ 10ms
    const lineB = buildLine('b', 'prose');
    tw.enqueue([lineA, lineB]);

    // First line first char rendered immediately.
    await nextTick();
    expect(tw.renderedLines.value).toHaveLength(1);
    expect(tw.renderedLines.value[0].text).toBe('a');

    // 10ms later step() observes activeCharIndex >= length → marks done, schedules pause.
    await vi.advanceTimersByTimeAsync(10);
    expect(tw.renderedLines.value[0].done).toBe(true);
    expect(tw.renderedLines.value).toHaveLength(1);

    // During pause, second line not yet started.
    await vi.advanceTimersByTimeAsync(149);
    expect(tw.renderedLines.value).toHaveLength(1);

    // After full pause, startNext fires → commits lineB and step() types first char.
    await vi.advanceTimersByTimeAsync(1);
    expect(tw.renderedLines.value).toHaveLength(2);
    expect(tw.renderedLines.value[1].text).toBe('b');
  });

  it('flush() snaps current line and commits queued lines instantly', async () => {
    const tw = useTypewriter();
    const lineA = buildLine('hello', 'prose');
    const lineB = buildLine('world', 'prose');
    const lineC = buildLine('again', 'prose');
    tw.enqueue([lineA, lineB, lineC]);

    // Mid-render: only first line committed, partially typed.
    await nextTick();
    expect(tw.renderedLines.value).toHaveLength(1);
    expect(tw.renderedLines.value[0].text).toBe('h');
    expect(tw.renderedLines.value[0].done).toBe(false);

    tw.flush();

    // All three lines should now be present and fully typed.
    expect(tw.renderedLines.value).toHaveLength(3);
    expect(tw.renderedLines.value[0]).toMatchObject({ text: 'hello', done: true });
    expect(tw.renderedLines.value[1]).toMatchObject({ text: 'world', done: true });
    expect(tw.renderedLines.value[2]).toMatchObject({ text: 'again', done: true });
    expect(tw.isTyping.value).toBe(false);

    // No further timers should run anything meaningful.
    await vi.advanceTimersByTimeAsync(1000);
    expect(tw.renderedLines.value).toHaveLength(3);
    expect(tw.isTyping.value).toBe(false);
  });

  it('reset() clears renderedLines and stops timers', async () => {
    const tw = useTypewriter();
    const lineA = buildLine('hello', 'prose');
    const lineB = buildLine('world', 'prose');
    tw.enqueue([lineA, lineB]);

    await nextTick();
    expect(tw.renderedLines.value).toHaveLength(1);
    expect(tw.isTyping.value).toBe(true);

    tw.reset();

    expect(tw.renderedLines.value).toHaveLength(0);
    expect(tw.isTyping.value).toBe(false);

    // Advancing timers should NOT cause any further work.
    await vi.advanceTimersByTimeAsync(1000);
    expect(tw.renderedLines.value).toHaveLength(0);
    expect(tw.isTyping.value).toBe(false);
  });

  it('enqueuing while typing appends to queue without restarting', async () => {
    const tw = useTypewriter();
    const lineA = buildLine('a', 'prose');
    tw.enqueue([lineA]);

    await nextTick();
    expect(tw.renderedLines.value).toHaveLength(1);
    expect(tw.renderedLines.value[0].text).toBe('a');

    // Enqueue another line while still in mid-render of lineA's pause cycle.
    const lineB = buildLine('b', 'prose');
    tw.enqueue([lineB]);

    // Still only one line rendered — lineA hasn't fully completed yet.
    expect(tw.renderedLines.value).toHaveLength(1);

    // Drive timers forward: 10ms to mark lineA done, 150ms pause, then lineB starts.
    await vi.advanceTimersByTimeAsync(10);
    expect(tw.renderedLines.value[0].done).toBe(true);
    expect(tw.renderedLines.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(INTER_LINE_PAUSE_MS);
    expect(tw.renderedLines.value).toHaveLength(2);
    expect(tw.renderedLines.value[1].text).toBe('b');

    // Finish lineB.
    await vi.advanceTimersByTimeAsync(10);
    expect(tw.renderedLines.value[1].done).toBe(true);

    await vi.advanceTimersByTimeAsync(INTER_LINE_PAUSE_MS);
    expect(tw.isTyping.value).toBe(false);
  });
});
