import ifvms from 'ifvms';
import ZVMDispatch from 'ifvms/src/zvm/dispatch.js';
import { createGlk } from './vendor/glkapi.js';
import { BrowserGlkOte } from './glkote';
import type { LocalStorageDialog } from './dialog';
import type { FilePrompt, StatusLine } from './types';

export interface SessionEvents {
  onLines(lines: string[]): void;
  onStatus(status: StatusLine): void;
  /** Ready for the player's next input: a command, or a save name. */
  onWaiting(): void;
  onExit(): void;
  onError(message: string): void;
}

/**
 * One running story file: a fresh Glk instance, VM and dispatcher, wired to
 * the terminal through BrowserGlkOte. Autosaves every turn, and resumes from
 * the autosave when a session for the same story starts again.
 */
export interface SessionOptions {
  /** Tests only: seeds the interpreter's generator (ifvms's xorshift), so a story replays exactly. */
  seed?: number;
}

export class ZMachineSession {
  private readonly glkote: BrowserGlkOte;
  private filePrompt: FilePrompt | null = null;
  private vm: unknown = null;
  private seeded = false;

  constructor(
    private readonly story: Uint8Array,
    private readonly dialog: LocalStorageDialog,
    private readonly events: SessionEvents,
    private readonly options: SessionOptions = {},
  ) {
    this.glkote = new BrowserGlkOte({
      onLines: (lines) => {
        events.onLines(lines);
        this.reportFailedWrite();
      },
      onStatus: (status) => events.onStatus(status),
      onInput: () => {
        this.reportFailedWrite();
        // ifvms zeroes the seed while starting, so it's set at the first prompt.
        if (this.options.seed && !this.seeded && this.vm) {
          (this.vm as { xorshift_seed: number }).xorshift_seed = this.options.seed;
          this.seeded = true;
        }
        events.onWaiting();
      },
      onFilePrompt: (prompt) => this.askForFile(prompt),
      onExit: () => events.onExit(),
      onError: (message) => events.onError(message),
    });
  }

  start(): void {
    const Glk = createGlk();
    const vm = new ifvms.ZVM();
    const options = {
      vm,
      Glk,
      GlkOte: this.glkote,
      Dialog: this.dialog,
      GiDispa: new ZVMDispatch(),
      do_vm_autosave: true,
    };
    // ifvms uses the buffer it's given as game memory, which changes the
    // game's signature. A fresh copy per session keeps saves matching.
    vm.prepare(new Uint8Array(this.story), options);
    this.vm = vm;
    Glk.init(options);
  }

  /** The player's input: a command, or the answer to a save or restore prompt. */
  submit(text: string): void {
    if (this.filePrompt) this.answerFile(text);
    else this.glkote.sendLine(text);
  }

  private reportFailedWrite(): void {
    if (this.dialog.takeWriteFailure()) this.events.onLines(['[That save didn’t fit: browser storage is full.]']);
  }

  private askForFile(prompt: FilePrompt): void {
    this.filePrompt = prompt;
    if (prompt.filetype !== 'save') {
      // SCRIPT and other file kinds: there's nowhere useful to put them.
      this.events.onLines([prompt.filetype === 'transcript' ? '[Transcripts aren’t supported here.]' : '[That kind of file isn’t supported here.]']);
      this.answerFile(null);
      return;
    }
    if (prompt.filemode === 'read') {
      const saves = this.dialog.listSaves(prompt.gameid ?? '');
      if (saves.length === 0) {
        this.events.onLines(['[There are no saved games yet.]']);
        this.answerFile(null);
        return;
      }
      this.events.onLines([`[Restore which save? ${saves.join(', ')}. Or CANCEL.]`]);
    } else {
      if (!this.dialog.isAvailable()) {
        this.events.onLines(['[Saving isn’t available in this browser.]']);
        this.answerFile(null);
        return;
      }
      this.events.onLines(['[Save as? Type a name, or CANCEL.]']);
    }
    this.events.onWaiting();
  }

  private answerFile(text: string | null): void {
    const prompt = this.filePrompt;
    this.filePrompt = null;
    const name = text?.trim() ?? '';
    if (!prompt) return;
    if (name === '' || name.toLowerCase() === 'cancel') {
      // glkapi crashes on a null answer in read mode, so a cancelled RESTORE
      // names a file that doesn't exist; the game then reports "Failed."
      this.glkote.sendFile(prompt.filemode === 'read' ? this.dialog.file_construct_temp_ref(prompt.filetype) : null);
      return;
    }
    this.glkote.sendFile(this.dialog.file_construct_ref(name, prompt.filetype, prompt.gameid ?? ''));
  }
}
