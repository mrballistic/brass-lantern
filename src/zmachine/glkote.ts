import { paragraphsToLines, statusFromGrid } from './format';
import type { FilePrompt, GlkUpdate, GlkWindow, StatusLine } from './types';

export interface GlkOteHandlers {
  onLines(lines: string[]): void;
  onStatus(status: StatusLine): void;
  /** The game is waiting for input of this kind. */
  onInput(kind: 'line' | 'char'): void;
  onFilePrompt(prompt: FilePrompt): void;
  onExit(): void;
  onError(message: string): void;
}

/** What glkapi hands to GlkOte.init. */
export interface GlkInterface {
  accept(event: Record<string, unknown>): void;
}

/** The terminal is a text console: one "pixel" is one character cell. */
export const METRICS = {
  buffercharheight: 1,
  buffercharwidth: 1,
  buffermarginx: 0,
  buffermarginy: 0,
  graphicsmarginx: 0,
  graphicsmarginy: 0,
  gridcharheight: 1,
  gridcharwidth: 1,
  gridmarginx: 0,
  gridmarginy: 0,
  height: 25,
  inspacingx: 0,
  inspacingy: 0,
  outspacingx: 0,
  outspacingy: 0,
  width: 80,
};

interface SavedDisplay {
  windows: GlkWindow[];
}

/**
 * A GlkOte for Brass Lantern's terminal. glkapi calls update() with display
 * changes; this turns buffer-window text into terminal lines and the top
 * grid window into the status line, and sends the player's input back.
 * Protocol: https://eblong.com/zarf/glk/glkote/docs.html
 */
export class BrowserGlkOte {
  private iface: GlkInterface | null = null;
  private gen = 0;
  private readonly windows = new Map<number, GlkWindow>();
  private input: { window: number; kind: 'line' | 'char' } | null = null;

  constructor(private readonly handlers: GlkOteHandlers) {}

  init(iface: GlkInterface): void {
    this.iface = iface;
    this.send({ type: 'init', gen: 0, metrics: METRICS, support: [] });
  }

  getinterface(): GlkInterface | null {
    return this.iface;
  }

  update(data: GlkUpdate, restored?: SavedDisplay): void {
    if (data.type === 'error') {
      this.handlers.onError(data.message ?? 'Unknown error');
      return;
    }
    if (data.type !== 'update' && data.type !== 'exit') return;
    if (data.gen === undefined || data.gen <= this.gen) return;
    this.gen = data.gen;

    for (const w of restored?.windows ?? []) this.windows.set(w.id, w);
    for (const w of data.windows ?? []) this.windows.set(w.id, w);

    for (const c of data.content ?? []) {
      if (this.windows.get(c.id)?.type === 'grid') {
        const status = statusFromGrid(c.lines);
        if (status) this.handlers.onStatus(status);
      } else if (c.text && !restored) {
        // After an autorestore the first update replays the old transcript,
        // which the terminal already has.
        const lines = paragraphsToLines(c.text);
        if (lines.length > 0) this.handlers.onLines(lines);
      }
    }

    if (data.type === 'exit') {
      this.input = null;
      this.handlers.onExit();
      return;
    }
    if (data.specialinput?.type === 'fileref_prompt') {
      this.input = null;
      this.handlers.onFilePrompt(data.specialinput);
      return;
    }
    const request = data.input?.find((i) => i.type === 'line' || i.type === 'char');
    this.input = request ? { window: request.id, kind: request.type } : null;
    if (request) this.handlers.onInput(request.type);
  }

  /** Send the player's command. Char input takes the first character, or Enter for an empty line. */
  sendLine(text: string): void {
    if (!this.input) return;
    const { window, kind } = this.input;
    this.input = null;
    if (kind === 'char') {
      this.send({ type: 'char', gen: this.gen, window, value: text.length > 0 ? text[0] : 'return' });
    } else {
      this.send({ type: 'line', gen: this.gen, window, value: text });
    }
  }

  /** Answer a save or restore prompt with a file reference, or null to cancel. */
  sendFile(ref: unknown): void {
    this.send({ type: 'specialresponse', gen: this.gen, response: 'fileref_prompt', value: ref });
  }

  /** Display state for autosaves; glkapi hands it back to update() after an autorestore. */
  save_allstate(): SavedDisplay {
    return { windows: [...this.windows.values()] };
  }

  log(): void {}

  warning(message: string): void {
    console.warn('[z-machine]', message);
  }

  error(message: string): void {
    this.handlers.onError(message);
  }

  /** glkapi expects replies after its current update has returned. */
  private send(event: Record<string, unknown>): void {
    setTimeout(() => this.iface?.accept(event), 0);
  }
}
