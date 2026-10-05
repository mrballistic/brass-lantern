import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserGlkOte, METRICS, type GlkOteHandlers } from '@/zmachine/glkote';
import type { GlkUpdate } from '@/zmachine/types';

const WINDOWS = [
  { id: 104, rock: 202, type: 'grid' as const, gridwidth: 80, gridheight: 1 },
  { id: 102, rock: 201, type: 'buffer' as const },
];

function setup() {
  const handlers: GlkOteHandlers = {
    onLines: vi.fn(),
    onStatus: vi.fn(),
    onInput: vi.fn(),
    onFilePrompt: vi.fn(),
    onExit: vi.fn(),
    onError: vi.fn(),
  };
  const accept = vi.fn();
  const glkote = new BrowserGlkOte(handlers);
  glkote.init({ accept });
  return { glkote, handlers, accept };
}

function turn(gen: number, extra: Partial<GlkUpdate> = {}): GlkUpdate {
  return {
    type: 'update',
    gen,
    windows: gen === 1 ? WINDOWS : null,
    content: [
      { id: 104, lines: [{ line: 0, content: ['normal', ' West of House     Score: 0  Turns: 1 '] }] },
      { id: 102, text: [{ content: ['input', 'look'], append: true }, { content: ['normal', 'West of House'] }, { content: ['normal', '>'] }] },
    ],
    input: [{ id: 102, type: 'line', gen, maxlen: 119 }],
    ...extra,
  };
}

describe('BrowserGlkOte', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends init with console metrics after init()', () => {
    const { accept } = setup();
    expect(accept).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(accept).toHaveBeenCalledWith({ type: 'init', gen: 0, metrics: METRICS, support: [] });
  });

  it('turns buffer text into lines and the grid into the status line', () => {
    const { glkote, handlers } = setup();
    glkote.update(turn(1));
    expect(handlers.onLines).toHaveBeenCalledWith(['West of House']);
    expect(handlers.onStatus).toHaveBeenCalledWith({ location: 'West of House', detail: 'Score: 0  Turns: 1' });
    expect(handlers.onInput).toHaveBeenCalledWith('line');
  });

  it('sends a line event for the pending input, once', () => {
    const { glkote, accept } = setup();
    vi.runAllTimers();
    glkote.update(turn(1));
    glkote.sendLine('open mailbox');
    glkote.sendLine('ignored: nothing is pending now');
    vi.runAllTimers();
    expect(accept).toHaveBeenLastCalledWith({ type: 'line', gen: 1, window: 102, value: 'open mailbox' });
    expect(accept).toHaveBeenCalledTimes(2);
  });

  it('answers char input with the first character, or Enter', () => {
    const { glkote, accept } = setup();
    glkote.update(turn(1, { input: [{ id: 102, type: 'char', gen: 1 }] }));
    glkote.sendLine('yes');
    glkote.update(turn(2, { input: [{ id: 102, type: 'char', gen: 2 }] }));
    glkote.sendLine('');
    vi.runAllTimers();
    expect(accept).toHaveBeenCalledWith({ type: 'char', gen: 1, window: 102, value: 'y' });
    expect(accept).toHaveBeenCalledWith({ type: 'char', gen: 2, window: 102, value: 'return' });
  });

  it('ignores stale or repeated generations', () => {
    const { glkote, handlers } = setup();
    glkote.update(turn(2));
    glkote.update(turn(2));
    glkote.update(turn(1));
    expect(handlers.onLines).toHaveBeenCalledTimes(1);
  });

  it('after an autorestore, skips the replayed transcript but keeps status and input', () => {
    const { glkote, handlers } = setup();
    // The restored update carries no window list: it comes from the saved display state.
    glkote.update({ ...turn(7), windows: null }, { windows: WINDOWS });
    expect(handlers.onLines).not.toHaveBeenCalled();
    expect(handlers.onStatus).toHaveBeenCalled();
    expect(handlers.onInput).toHaveBeenCalledWith('line');
    glkote.update(turn(8));
    expect(handlers.onLines).toHaveBeenCalledWith(['West of House']);
  });

  it('reports a save/restore prompt and sends the answer', () => {
    const { glkote, handlers, accept } = setup();
    const prompt = { type: 'fileref_prompt' as const, filemode: 'write' as const, filetype: 'save', gameid: 'abc' };
    glkote.update(turn(1, { input: [], specialinput: prompt }));
    expect(handlers.onFilePrompt).toHaveBeenCalledWith(prompt);
    expect(handlers.onInput).not.toHaveBeenCalled();
    glkote.sendFile({ filename: 'slot1' });
    vi.runAllTimers();
    expect(accept).toHaveBeenLastCalledWith({ type: 'specialresponse', gen: 1, response: 'fileref_prompt', value: { filename: 'slot1' } });
  });

  it('shows the last text, then reports the end of the game', () => {
    const { glkote, handlers } = setup();
    glkote.update(turn(1));
    glkote.update({ type: 'exit', gen: 2, disable: true, input: [], content: [{ id: 102, text: [{ content: ['normal', 'Goodbye.'] }] }] });
    expect(handlers.onLines).toHaveBeenLastCalledWith(['Goodbye.']);
    expect(handlers.onExit).toHaveBeenCalled();
    glkote.sendLine('anything');
    expect(handlers.onInput).toHaveBeenCalledTimes(1);
  });

  it('reports errors', () => {
    const { glkote, handlers } = setup();
    glkote.update({ type: 'error', message: 'boom' });
    glkote.error('bang');
    expect(handlers.onError).toHaveBeenCalledWith('boom');
    expect(handlers.onError).toHaveBeenCalledWith('bang');
  });

  it('saves its window list for autosaves', () => {
    const { glkote } = setup();
    glkote.update(turn(1));
    expect(glkote.save_allstate()).toEqual({ windows: WINDOWS });
    expect(glkote.getinterface()).not.toBeNull();
  });
});
