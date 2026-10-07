// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageDialog } from '../../src/zmachine/dialog';
import { localStorageSaveStore } from '../../src/zmachine/save-store';

/** A Storage whose writes always fail, like a full or locked-down localStorage. */
function brokenStorage(): Storage {
  return {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
    clear: () => {},
  };
}

describe('LocalStorageDialog', () => {
  beforeEach(() => localStorage.clear());

  it('builds refs with a cleaned name under its prefix', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:'));
    const ref = d.file_construct_ref('my/save!', 'save', 'game1');
    expect(ref).toEqual({ filename: 'mysave', usage: 'save', gameid: 'game1', dirent: 'z:file:save:game1:mysave' });
    expect(d.file_clean_fixed_name('   ')).toBe('save');
  });

  it('writes and reads files as byte arrays', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:'));
    const ref = d.file_construct_ref('slot', 'save', 'g');
    expect(d.file_ref_exists(ref)).toBe(false);
    expect(d.file_write(ref, new Uint8Array([1, 2, 3]))).toBe(true);
    expect(d.file_ref_exists(ref)).toBe(true);
    expect(d.file_read(ref)).toEqual([1, 2, 3]);
    d.file_remove_ref(ref);
    expect(d.file_read(ref)).toBeNull();
  });

  it('creates an empty file for a raw write', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:'));
    const ref = d.file_construct_ref('slot', 'save', 'g');
    d.file_write(ref, '', true);
    expect(d.file_read(ref)).toEqual([]);
  });

  it('treats unreadable contents as missing', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:'));
    const ref = d.file_construct_ref('slot', 'save', 'g');
    localStorage.setItem(`test:${ref.dirent}`, 'not json');
    expect(d.file_read(ref)).toBeNull();
    localStorage.setItem(`test:${ref.dirent}`, '"a string"');
    expect(d.file_read(ref)).toBeNull();
  });

  it('makes distinct temp refs', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:'));
    expect(d.file_construct_temp_ref('data').dirent).not.toBe(d.file_construct_temp_ref('data').dirent);
  });

  it('lists only this game’s saves, sorted', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:'));
    d.file_write(d.file_construct_ref('zeta', 'save', 'g1'), [1]);
    d.file_write(d.file_construct_ref('alpha', 'save', 'g1'), [1]);
    d.file_write(d.file_construct_ref('other', 'save', 'g2'), [1]);
    d.file_write(d.file_construct_ref('notes', 'data', 'g1'), [1]);
    expect(d.listSaves('g1')).toEqual(['alpha', 'zeta']);
  });

  it('stores, reads and clears autosaves', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:'));
    d.autosave_write('sig', { ram: [1, 2] });
    expect(d.autosave_read('sig')).toEqual({ ram: [1, 2] });
    d.autosave_write('sig', null);
    expect(d.autosave_read('sig')).toBeNull();
    localStorage.setItem('test:z:auto:sig', '{bad');
    expect(d.autosave_read('sig')).toBeNull();
  });

  it('never throws when storage fails, and says it isn’t available', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:', brokenStorage()));
    const ref = d.file_construct_ref('slot', 'save', 'g');
    expect(d.isAvailable()).toBe(false);
    expect(d.file_write(ref, [1])).toBe(false);
    expect(() => d.file_remove_ref(ref)).not.toThrow();
    expect(() => d.autosave_write('sig', { a: 1 })).not.toThrow();
    expect(() => d.autosave_write('sig', null)).not.toThrow();
  });

  it('works without storage at all', () => {
    const d = new LocalStorageDialog(localStorageSaveStore('test:', null));
    const ref = d.file_construct_ref('slot', 'save', 'g');
    expect(d.isAvailable()).toBe(false);
    expect(d.file_read(ref)).toBeNull();
    expect(d.file_write(ref, [1])).toBe(false);
    expect(d.listSaves('g')).toEqual([]);
    expect(d.autosave_read('sig')).toBeNull();
  });

  it('is available with working localStorage', () => {
    expect(new LocalStorageDialog(localStorageSaveStore('test:')).isAvailable()).toBe(true);
  });
});
