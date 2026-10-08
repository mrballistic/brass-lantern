import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// The engine runs in Node or a browser and knows nothing of Vue, Pinia, the
// DOM or the apps. ESLint enforces the same rules (no-restricted-imports and
// no-restricted-globals in eslint.config.js); this test catches what a
// disabled lint rule or an `eslint-disable` would let through.

const SRC = join(import.meta.dirname, '..', 'src');

/** The only files allowed to touch browser storage or the DOM. */
const ALLOWED = [
  // localStorageSaveStore: the browser SaveStore, behind the ./zmachine entry.
  'zmachine/save-store.ts',
  // Vendored glkapi (generated) and ifvms's ambient types.
  'zmachine/vendor/',
];

const FORBIDDEN: { what: string; pattern: RegExp }[] = [
  { what: "an import of 'vue'", pattern: /\bfrom\s+['"]vue['"]|import\(\s*['"]vue['"]\s*\)/ },
  { what: "an import of 'pinia'", pattern: /\bfrom\s+['"]pinia['"]|import\(\s*['"]pinia['"]\s*\)/ },
  { what: 'an import of another @brass-lantern package', pattern: /['"]@brass-lantern\/(?:vue|server)\b/ },
  { what: 'an import from the apps', pattern: /['"][./]*apps\// },
  // An identifier after the dot, so prose like 'the boarded window.' isn't a hit.
  { what: 'document', pattern: /\bdocument\.[A-Za-z_$]/ },
  { what: 'window', pattern: /\bwindow\.[A-Za-z_$]/ },
  { what: 'localStorage', pattern: /\blocalStorage\b/ },
  { what: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  // A library build would freeze Vite's values at build time.
  { what: 'import.meta.env', pattern: /\bimport\.meta\.env\b/ },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

/** Comments may mention the browser; only code counts. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function hits(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file).split(sep).join('/');
    if (ALLOWED.some((allowed) => (allowed.endsWith('/') ? rel.startsWith(allowed) : rel === allowed))) continue;
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const { what, pattern } of FORBIDDEN) {
        if (pattern.test(line)) found.push(`src/${rel}:${i + 1}: ${what}`);
      }
    });
  }
  return found;
}

describe('the engine boundary', () => {
  it('finds source files to check', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(50);
  });

  it('imports no vue, pinia, other packages or apps, and touches no DOM or browser storage', () => {
    expect(hits()).toEqual([]);
  });

  it('loads ifvms only in the Z-machine session (and the guard that checks for it)', () => {
    const users = sourceFiles(SRC)
      .map((file) => relative(SRC, file).split(sep).join('/'))
      .filter((rel) => !rel.startsWith('zmachine/vendor/'))
      .filter((rel) => /from\s+['"]ifvms|import\(\s*['"]ifvms/.test(readFileSync(join(SRC, rel), 'utf8')));
    expect(users.sort()).toEqual(['zmachine/require-ifvms.ts', 'zmachine/session.ts']);
  });

  it('checks for ifvms in the session’s Node entry before anything loads it, so a missing peer names itself', () => {
    const entry = 'zmachine/session-node.ts';
    const code = stripComments(readFileSync(join(SRC, entry), 'utf8'));
    // The only static import is the guard; the runtime comes after it, dynamically.
    const staticImports = [...code.matchAll(/^import\s.*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(staticImports, entry).toEqual(['./require-ifvms.ts']);
    expect(code.indexOf('await requireIfvms()'), entry).toBeGreaterThan(-1);
    expect(code.indexOf('await requireIfvms()'), entry).toBeLessThan(code.indexOf('await import('));
  });

  it('keeps ./zmachine free of the interpreter: only ./zmachine/session loads ifvms', () => {
    // Every module index.ts loads, statically or dynamically, following relative imports.
    const seen = new Set<string>();
    const visit = (rel: string) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      const code = stripComments(readFileSync(join(SRC, rel), 'utf8'));
      for (const [, spec] of code.matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g)) {
        expect(spec, `${rel} loads ${spec}`).not.toMatch(/^ifvms/);
        if (spec.startsWith('.')) visit(join(rel, '..', spec).split(sep).join('/'));
      }
    };
    visit('zmachine/index.ts');
    expect([...seen].filter((rel) => /zmachine\/(session|glkote|vendor\/)/.test(rel))).toEqual([]);
  });

  it('keeps the core entry free of the Z-machine runtime and the bundled worlds', () => {
    // Everything '@brass-lantern/engine' loads lives in engine/ and types/.
    const crossings = sourceFiles(SRC)
      .map((file) => relative(SRC, file).split(sep).join('/'))
      .filter((rel) => rel === 'index.ts' || rel.startsWith('engine/') || rel.startsWith('types/'))
      .filter((rel) => /(?:from\s+|import\(\s*)['"][./]*(?:\.\.\/|\.\/)(?:zmachine|worlds)\//.test(readFileSync(join(SRC, rel), 'utf8')));
    expect(crossings).toEqual([]);
  });

  it('points ./zmachine/session at the guarded Node file under the "node" condition', () => {
    const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as {
      exports: Record<string, Record<string, string>>;
    };
    expect(pkg.exports['./zmachine/session'].node).toBe('./dist/zmachine/session-node.js');
    // Core, worlds and ./zmachine never need ifvms, so they have no guard.
    expect(pkg.exports['.'].node).toBeUndefined();
    expect(pkg.exports['./worlds'].node).toBeUndefined();
    expect(pkg.exports['./zmachine'].node).toBeUndefined();
  });
});
