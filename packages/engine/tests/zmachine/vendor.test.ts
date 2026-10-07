import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import ifvms from 'ifvms';
import ZVMDispatch from 'ifvms/src/zvm/dispatch.js';
import { createGlk } from '../../src/zmachine/vendor/glkapi.js';

// The real Zork I, Release 119 (MIT, Microsoft 2025).
const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));

const METRICS = {
  buffercharheight: 1, buffercharwidth: 1, buffermarginx: 0, buffermarginy: 0,
  graphicsmarginx: 0, graphicsmarginy: 0, gridcharheight: 1, gridcharwidth: 1,
  gridmarginx: 0, gridmarginy: 0, height: 25, inspacingx: 0, inspacingy: 0,
  outspacingx: 0, outspacingy: 0, width: 80,
};

type Paragraph = { content?: string[] };
type Update = { content?: Array<{ text?: Paragraph[] }> };

/** Boot the story with a bare-bones GlkOte and return the first screen of text. */
function firstScreen(): Promise<string> {
  return new Promise((resolve, reject) => {
    let iface: { accept(event: object): void } | null = null;
    const glkote = {
      init(i: { accept(event: object): void }) {
        iface = i;
        setTimeout(() => i.accept({ type: 'init', gen: 0, support: [], metrics: METRICS }), 0);
      },
      update(data: Update) {
        const text = (data.content ?? [])
          .flatMap((c) => c.text ?? [])
          .map((p) => (p.content ?? []).filter((_, i) => i % 2 === 1).join(''))
          .join('\n');
        resolve(text);
      },
      save_allstate: () => ({}),
      log() {},
      warning() {},
      error: (m: string) => reject(new Error(m)),
      getinterface: () => iface,
    };
    const Glk = createGlk();
    const vm = new ifvms.ZVM();
    const options = { vm, Glk, GlkOte: glkote, GiDispa: new ZVMDispatch(), Dialog: { streaming: false } };
    vm.prepare(new Uint8Array(story), options);
    Glk.init(options);
  });
}

describe('vendored glkapi with ifvms', () => {
  it('boots Zork I', async () => {
    const text = await firstScreen();
    expect(text).toContain('ZORK I: The Great Underground Empire');
    expect(text).toContain('West of House');
  });

  it('gives every session its own Glk instance, so a second boot works', async () => {
    expect(createGlk()).not.toBe(createGlk());
    expect(await firstScreen()).toContain('West of House');
  });
});
