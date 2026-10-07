import type { SaveStore } from './save-store';

/** A file reference, as glkapi passes it back to us. */
export interface FileRef {
  filename: string;
  usage: string;
  gameid: string;
  dirent: string;
}

/**
 * Glk's file layer, kept in a SaveStore (browser storage in the app). Non-streaming: glkapi reads and
 * writes whole files, which we store as JSON byte arrays. Also holds
 * ifvms's per-turn autosave. Every method swallows storage errors: a full
 * or blocked store costs persistence, never the game.
 */
export class LocalStorageDialog {
  readonly streaming = false;
  private writeFailed = false;

  constructor(private readonly store: SaveStore) {}

  /** Can we actually write? (False in some private modes, or when full.) */
  isAvailable(): boolean {
    const probe = this.key('probe');
    try {
      this.store.write(probe, new Uint8Array([1]));
      this.store.remove(probe);
      return true;
    } catch {
      return false;
    }
  }

  file_construct_ref(filename: string, usage = '', gameid = ''): FileRef {
    const name = this.file_clean_fixed_name(filename);
    return { filename: name, usage, gameid, dirent: this.key('file', usage, gameid, name) };
  }

  file_construct_temp_ref(usage: string): FileRef {
    return this.file_construct_ref(`temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, usage);
  }

  file_clean_fixed_name(name: string): string {
    return String(name ?? '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 40) || 'save';
  }

  file_ref_exists(ref: FileRef): boolean {
    return this.read(ref.dirent) !== null;
  }

  file_remove_ref(ref: FileRef): void {
    this.remove(ref.dirent);
  }

  file_read(ref: FileRef): number[] | null {
    const bytes = this.read(ref.dirent);
    return bytes === null ? null : Array.from(bytes);
  }

  /** `israw` with a string means "create an empty file". Returns whether it was stored. */
  file_write(ref: FileRef, content: ArrayLike<number> | string, israw?: boolean): boolean {
    const bytes = israw || typeof content === 'string' ? [] : Array.from(content);
    const ok = this.write(ref.dirent, Uint8Array.from(bytes));
    if (!ok) this.writeFailed = true;
    return ok;
  }

  /**
   * Did a file write fail since the last call? glkapi ignores file_write's
   * result, so the game would say "Ok." about a save that wasn't stored.
   */
  takeWriteFailure(): boolean {
    const failed = this.writeFailed;
    this.writeFailed = false;
    return failed;
  }

  /** Names of this game's saved games, sorted. */
  listSaves(gameid: string): string[] {
    const start = this.key('file', 'save', gameid, '');
    let names: string[];
    try {
      names = this.store.list();
    } catch {
      return [];
    }
    return names.filter((n) => n.startsWith(start)).map((n) => n.slice(start.length)).sort();
  }

  autosave_read(signature: string): unknown {
    const bytes = this.read(this.key('auto', signature));
    if (bytes === null) return null;
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  autosave_write(signature: string, snapshot: unknown): void {
    const k = this.key('auto', signature);
    if (snapshot == null) {
      this.remove(k);
      return;
    }
    this.write(k, new TextEncoder().encode(JSON.stringify(snapshot)));
  }

  private key(...parts: string[]): string {
    return ['z', ...parts].join(':');
  }

  private read(name: string): Uint8Array | null {
    try {
      return this.store.read(name);
    } catch {
      return null;
    }
  }

  private write(name: string, data: Uint8Array): boolean {
    try {
      this.store.write(name, data);
      return true;
    } catch {
      return false;
    }
  }

  private remove(name: string): void {
    try {
      this.store.remove(name);
    } catch {
      // Nothing to do.
    }
  }
}
