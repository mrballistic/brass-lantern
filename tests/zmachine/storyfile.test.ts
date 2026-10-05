import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readStoryFile } from '@/zmachine/storyfile';

const zork = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));

/** An IFF chunk: 4-byte type, big-endian length, data, pad to even. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length % 2));
  out.set([...type].map((c) => c.charCodeAt(0)));
  new DataView(out.buffer).setUint32(4, data.length);
  out.set(data, 8);
  return out;
}

function blorb(...chunks: Uint8Array[]): Uint8Array {
  const body = new Uint8Array([...'IFRS'].map((c) => c.charCodeAt(0)).concat(...chunks.map((c) => [...c])));
  return chunk('FORM', body);
}

describe('readStoryFile', () => {
  it('reads a raw Z-code file: version, a stable id from the header, a title from the name', () => {
    const r = readStoryFile(zork, 'zork1.z3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.story.version).toBe(3);
    expect(r.story.format).toBe('Z-machine v3');
    expect(r.story.id).toBe('local-r119-880429-bf44');
    expect(r.story.title).toBe('ZORK1');
    expect(r.story.bytes).toEqual(zork);
  });

  it('makes a readable title from the file name', () => {
    const t = (name: string) => {
      const r = readStoryFile(zork, name);
      return r.ok ? r.story.title : null;
    };
    expect(t('the_lurking-horror.z3')).toBe('THE LURKING HORROR');
    expect(t('  .z5')).toBe('UNTITLED STORY');
    expect(t('a-very-long-story-file-name-indeed.z8')).toBe('A VERY LONG STORY FILE…');
  });

  it('unwraps the Z-code from a Blorb', () => {
    const wrapped = blorb(chunk('RIdx', new Uint8Array(4)), chunk('ZCOD', zork));
    const r = readStoryFile(wrapped, 'zork1.zblorb');
    expect(r.ok && r.story.bytes).toEqual(zork);
    expect(r.ok && r.story.title).toBe('ZORK1');
  });

  it('turns away Glulx games, raw or in a Blorb', () => {
    const glulx = new Uint8Array([0x47, 0x6c, 0x75, 0x6c, 0, 3, 1, 0]);
    expect(readStoryFile(glulx, 'game.ulx')).toEqual({ ok: false, error: 'glulx' });
    expect(readStoryFile(blorb(chunk('GLUL', glulx)), 'game.gblorb')).toEqual({ ok: false, error: 'glulx' });
  });

  it('turns away Z-machine versions the interpreter can’t run', () => {
    const v6 = zork.slice();
    v6[0] = 6;
    expect(readStoryFile(v6, 'arthur.z6')).toEqual({ ok: false, error: 'version', version: 6 });
  });

  it('turns away anything else', () => {
    expect(readStoryFile(new TextEncoder().encode('hello there, not a game'), 'notes.txt')).toEqual({
      ok: false,
      error: 'not-story',
    });
    expect(readStoryFile(new Uint8Array(10), 'tiny.z3')).toEqual({ ok: false, error: 'not-story' });
    expect(readStoryFile(blorb(chunk('RIdx', new Uint8Array(4))), 'empty.zblorb')).toEqual({
      ok: false,
      error: 'not-story',
    });
  });

  it('turns away a story bigger than the Z-machine allows', () => {
    const big = new Uint8Array(512 * 1024 + 1);
    big.set(zork.slice(0, 64));
    big[0] = 8;
    expect(readStoryFile(big, 'huge.z8')).toEqual({ ok: false, error: 'too-big' });
  });
});
