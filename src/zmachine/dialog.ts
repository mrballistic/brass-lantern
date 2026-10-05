/** A file reference, as glkapi passes it back to us. */
export interface FileRef {
  filename: string;
  usage: string;
  gameid: string;
  dirent: string;
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Glk's file layer, kept in localStorage. Non-streaming: glkapi reads and
 * writes whole files, which we store as JSON byte arrays. Also holds
 * ifvms's per-turn autosave. Every method swallows storage errors: a full
 * or blocked localStorage costs persistence, never the game.
 */
export class LocalStorageDialog {
  readonly streaming = false;
  private writeFailed = false;

  constructor(
    private readonly prefix: string,
    private readonly storage: Storage | null = defaultStorage(),
  ) {}

  /** Can we actually write? (False in some private modes, or when full.) */
  isAvailable(): boolean {
    const probe = this.key('probe');
    if (!this.write(probe, '1')) return false;
    try {
      this.storage?.removeItem(probe);
    } catch {
      return false;
    }
    return true;
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
    try {
      this.storage?.removeItem(ref.dirent);
    } catch {
      // Nothing to do.
    }
  }

  file_read(ref: FileRef): number[] | null {
    const raw = this.read(ref.dirent);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? (value as number[]) : null;
    } catch {
      return null;
    }
  }

  /** `israw` with a string means "create an empty file". Returns whether it was stored. */
  file_write(ref: FileRef, content: ArrayLike<number> | string, israw?: boolean): boolean {
    const bytes = israw || typeof content === 'string' ? [] : Array.from(content);
    const ok = this.write(ref.dirent, JSON.stringify(bytes));
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
    const storage = this.storage;
    if (!storage) return [];
    const start = this.key('file', 'save', gameid, '');
    const names: string[] = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(start)) names.push(k.slice(start.length));
      }
    } catch {
      return [];
    }
    return names.sort();
  }

  autosave_read(signature: string): unknown {
    const raw = this.read(this.key('auto', signature));
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  autosave_write(signature: string, snapshot: unknown): void {
    const k = this.key('auto', signature);
    if (snapshot == null) {
      try {
        this.storage?.removeItem(k);
      } catch {
        // Nothing to do.
      }
      return;
    }
    this.write(k, JSON.stringify(snapshot));
  }

  private key(...parts: string[]): string {
    return [this.prefix, 'z', ...parts].join(':');
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
