import type { LoadedStory } from './storyfile';

/** What the menu lists for a story on the shelf. */
export interface ShelfEntry {
  id: string;
  title: string;
  format: string;
}

interface Row extends ShelfEntry {
  bytes: Uint8Array;
  addedAt: number;
}

const STORE = 'stories';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Story files the player loaded from their own computer, kept in IndexedDB
 * (they can be up to 512 KB, too big to share browser key-value storage with saves). They
 * never leave the browser.
 */
export class IndexedDbShelf {
  private db: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly name: string,
    private readonly idb: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.idb) return Promise.reject(new Error('IndexedDB is unavailable'));
    this.db ??= new Promise((resolve, reject) => {
      const r = this.idb!.open(this.name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        this.db = null;
        reject(r.error ?? new Error('IndexedDB wouldn’t open'));
      };
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE);
  }

  /** Oldest first. Empty if storage is unavailable. */
  async list(): Promise<ShelfEntry[]> {
    try {
      const rows = await request((await this.store('readonly')).getAll() as IDBRequest<Row[]>);
      return rows.sort((a, b) => a.addedAt - b.addedAt).map(({ id, title, format }) => ({ id, title, format }));
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<Uint8Array | null> {
    try {
      const row = await request((await this.store('readonly')).get(id) as IDBRequest<Row | undefined>);
      return row ? row.bytes : null;
    } catch {
      return null;
    }
  }

  /** Throws if it can't be stored (no IndexedDB, or full). A story already there keeps its place and title. */
  async put(story: LoadedStory): Promise<void> {
    const rows = await request((await this.store('readonly')).getAll() as IDBRequest<Row[]>);
    if (rows.some((r) => r.id === story.id)) return;
    // Strictly after the newest, so two loads in the same millisecond keep their order.
    const addedAt = Math.max(Date.now(), ...rows.map((r) => r.addedAt + 1));
    const row: Row = { id: story.id, title: story.title, format: story.format, bytes: story.bytes, addedAt };
    await request((await this.store('readwrite')).put(row));
  }

  async remove(id: string): Promise<void> {
    try {
      await request((await this.store('readwrite')).delete(id));
    } catch {
      // Nothing to remove.
    }
  }
}
