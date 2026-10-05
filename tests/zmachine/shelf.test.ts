import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbShelf } from '@/zmachine/shelf';

const story = (id: string, title = id.toUpperCase()) => ({
  id,
  title,
  format: 'Z-machine v3',
  version: 3,
  bytes: new Uint8Array([3, 0, 0, 1]),
});

let n = 0;
const freshShelf = () => new IndexedDbShelf(`shelf-test-${++n}`);

describe('IndexedDbShelf', () => {
  it('keeps stories across instances, listed in the order they were added', async () => {
    const name = `shelf-test-${++n}`;
    const a = new IndexedDbShelf(name);
    await a.put(story('zeta'));
    await a.put(story('alpha'));
    const b = new IndexedDbShelf(name);
    expect(await b.list()).toEqual([
      { id: 'zeta', title: 'ZETA', format: 'Z-machine v3' },
      { id: 'alpha', title: 'ALPHA', format: 'Z-machine v3' },
    ]);
    expect(await b.get('alpha')).toEqual(new Uint8Array([3, 0, 0, 1]));
  });

  it('putting the same story again keeps its place and title', async () => {
    const shelf = freshShelf();
    await shelf.put(story('one'));
    await shelf.put(story('two'));
    await shelf.put(story('one', 'RENAMED'));
    expect((await shelf.list()).map((s) => s.title)).toEqual(['ONE', 'TWO']);
  });

  it('removes a story', async () => {
    const shelf = freshShelf();
    await shelf.put(story('one'));
    await shelf.remove('one');
    expect(await shelf.list()).toEqual([]);
    expect(await shelf.get('one')).toBeNull();
  });

  it('reports an empty shelf when IndexedDB is unavailable, and fails puts', async () => {
    const shelf = new IndexedDbShelf('x', null);
    expect(await shelf.list()).toEqual([]);
    expect(await shelf.get('one')).toBeNull();
    await expect(shelf.put(story('one'))).rejects.toThrow();
  });
});
