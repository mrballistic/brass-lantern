import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Type-level checks: the tests aren't type-checked by `npm run type-check`
// (it covers src/), so these compile a snippet against src/options.ts.
const SRC = join(import.meta.dirname, '..', '..', 'src');

function diagnostics(code: string): string[] {
  const file = join(SRC, '__type-check__.ts');
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  host.readFile = (f) => (f === file ? code : read(f));
  const exists = host.fileExists.bind(host);
  host.fileExists = (f) => f === file || exists(f);
  const program = ts.createProgram([file], options, host);
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(file))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('GameOptions types', () => {
  it('theme takes a custom theme’s name, a preset or a theme object', () => {
    const errors = diagnostics(`
      import type { GameOptions } from './options.ts';
      const parchment = { palette: 'light' as const, effects: { bloom: false, scanlines: false, flicker: false, vignette: false, noise: false, glitch: false, decay: false } };
      const byName: GameOptions = { cartridges: [], storagePrefix: 'p', theme: 'parchment', themes: { parchment } };
      const preset: GameOptions = { cartridges: [], storagePrefix: 'p', theme: 'crt-green' };
      const object: GameOptions = { cartridges: [], storagePrefix: 'p', theme: parchment };
      export { byName, preset, object };
    `);
    expect(errors).toEqual([]);
  }, 30_000);

  it('still rejects a theme that is neither a name nor a theme', () => {
    const errors = diagnostics(`
      import type { GameOptions } from './options.ts';
      export const bad: GameOptions = { cartridges: [], storagePrefix: 'p', theme: 42 };
    `);
    expect(errors).toHaveLength(1);
  }, 30_000);
});
