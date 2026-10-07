/**
 * Where the Z-machine's save files and autosave live. The engine only sees
 * this interface; a browser app passes `localStorageSaveStore`, a Node host
 * passes whatever it likes (a directory, a database, a Map).
 *
 * `write` throws if the data can't be stored (full, blocked, unavailable);
 * the dialog turns that into the game's "Failed." and a note to the player.
 * `read` returns null for a missing or unreadable entry.
 */
export interface SaveStore {
  list(): string[];
  read(name: string): Uint8Array | null;
  write(name: string, data: Uint8Array): void;
  remove(name: string): void;
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const BRACE = 0x7b; // '{'
const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * A SaveStore over localStorage, every key starting with `prefix`. It keeps
 * the layout earlier versions wrote, so existing saves still load: a binary
 * entry (a save file) is stored as a JSON array of byte values, and a JSON
 * text entry (the autosave, which starts with "{"; a Quetzal save never
 * does) is stored as the text itself.
 */
export function localStorageSaveStore(prefix: string, storage: Storage | null = defaultStorage()): SaveStore {
  return {
    list() {
      const names: string[] = [];
      if (!storage) return names;
      try {
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k?.startsWith(prefix)) names.push(k.slice(prefix.length));
        }
      } catch {
        return [];
      }
      return names.sort();
    },
    read(name) {
      let raw: string | null;
      try {
        raw = storage?.getItem(prefix + name) ?? null;
      } catch {
        return null;
      }
      if (raw === null) return null;
      if (raw.startsWith('{')) return encoder.encode(raw);
      try {
        const value: unknown = JSON.parse(raw);
        return Array.isArray(value) ? Uint8Array.from(value as number[]) : null;
      } catch {
        return null;
      }
    },
    write(name, data) {
      if (!storage) throw new Error('No storage is available');
      const text = data[0] === BRACE ? decoder.decode(data) : JSON.stringify(Array.from(data));
      storage.setItem(prefix + name, text);
    },
    remove(name) {
      try {
        storage?.removeItem(prefix + name);
      } catch {
        // Nothing to do.
      }
    },
  };
}
