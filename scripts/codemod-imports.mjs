#!/usr/bin/env node
// Rewrites import specifiers after the workspace split (1.13.0 → packages/*,
// apps/site). Run from the repo root once the files have been moved with
// `git mv`: `node scripts/codemod-imports.mjs [--dry-run]`.
//
// For every .ts/.vue file under the moved trees it finds each `@/…` or
// relative specifier (static and dynamic imports, `export … from`, side-effect
// imports, vi.mock / vi.importActual / vi.doMock), works out which file it
// pointed at in the old layout, and rewrites it:
//   - same package: a relative path from the file's new location;
//   - another package: the package name (and entry) that exports it;
//   - another package's test support (fixtures, helpers): a relative path,
//     since tests are never published.
// A relative specifier that still resolves from the file's new location is
// left alone, so the script is safe to run twice. Anything it can't resolve is
// printed, and the script exits non-zero.

import { existsSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const dryRun = process.argv.includes('--dry-run');

// Old path → new path, most specific first. Directories end in '/'.
const MOVES = [
  ['tests/worlds/zork1-store.test.ts', 'packages/vue/tests/worlds/zork1-store.test.ts'],
  ['src/engine/', 'packages/engine/src/engine/'],
  ['src/types/', 'packages/engine/src/types/'],
  ['src/zmachine/', 'packages/engine/src/zmachine/'],
  ['src/worlds/', 'packages/engine/src/worlds/'],
  ['tests/engine/', 'packages/engine/tests/engine/'],
  ['tests/worlds/', 'packages/engine/tests/worlds/'],
  ['tests/zmachine/', 'packages/engine/tests/zmachine/'],
  ['tests/fixtures/', 'packages/engine/tests/fixtures/'],
  ['tests/helpers/', 'packages/engine/tests/helpers/'],
  ['tests/setup.ts', 'packages/engine/tests/setup.ts'],
  ['src/stores/', 'packages/vue/src/stores/'],
  ['src/components/', 'packages/vue/src/components/'],
  ['src/composables/', 'packages/vue/src/composables/'],
  ['src/theme/', 'packages/vue/src/theme/'],
  ['src/styles/', 'packages/vue/src/styles/'],
  ['src/services/persistence.ts', 'packages/vue/src/services/persistence.ts'],
  ['src/options.ts', 'packages/vue/src/options.ts'],
  ['src/mount.ts', 'packages/vue/src/mount.ts'],
  ['tests/stores/', 'packages/vue/tests/stores/'],
  ['tests/components/', 'packages/vue/tests/components/'],
  ['tests/composables/', 'packages/vue/tests/composables/'],
  ['tests/theme/', 'packages/vue/tests/theme/'],
  ['tests/services/persistence.test.ts', 'packages/vue/tests/services/persistence.test.ts'],
  ['src/main.ts', 'apps/site/src/main.ts'],
  ['src/app.config.ts', 'apps/site/src/app.config.ts'],
  ['src/SiteConsent.vue', 'apps/site/src/SiteConsent.vue'],
  ['src/env.d.ts', 'apps/site/src/env.d.ts'],
  ['src/services/analytics.ts', 'apps/site/src/services/analytics.ts'],
  ['src/services/consent.ts', 'apps/site/src/services/consent.ts'],
  ['tests/app.config.test.ts', 'apps/site/tests/app.config.test.ts'],
  ['tests/services/analytics.test.ts', 'apps/site/tests/services/analytics.test.ts'],
  ['tests/services/consent.test.ts', 'apps/site/tests/services/consent.test.ts'],
];

// A target that a package other than its own reaches through a local stand-in.
// The engine's fixture world is wrapped by the vue package's own fixture,
// which adds the GameOptions (a vue type the engine mustn't import).
const REDIRECTS = {
  'packages/vue': { 'packages/engine/tests/fixtures/world.ts': 'packages/vue/tests/fixtures/world.ts' },
};

const PACKAGES = ['packages/engine', 'packages/vue', 'packages/server', 'apps/site'];

/** The entry another package imports a source file through. */
function entryFor(target, dynamic) {
  if (target === 'packages/engine/src/zmachine/session.ts' && dynamic) {
    // Loaded on demand so the interpreter stays out of the main bundle.
    return '@brass-lantern/engine/zmachine/session';
  }
  if (target.startsWith('packages/engine/src/zmachine/')) return '@brass-lantern/engine/zmachine';
  if (target.startsWith('packages/engine/src/worlds/')) return '@brass-lantern/engine/worlds';
  if (target.startsWith('packages/engine/src/')) return '@brass-lantern/engine';
  if (target === 'packages/vue/src/styles/crt.css') return '@brass-lantern/vue/style.css';
  if (target.startsWith('packages/vue/src/')) return '@brass-lantern/vue';
  return null;
}

const toPosix = p => p.split('\\').join('/');
const packageOf = p => PACKAGES.find(pkg => p === pkg || p.startsWith(`${pkg}/`)) ?? null;

function oldPathOf(newPath) {
  for (const [from, to] of MOVES) {
    if (to.endsWith('/') ? newPath.startsWith(to) : newPath === to) return from + newPath.slice(to.length);
  }
  return null;
}

function newPathOf(oldPath) {
  for (const [from, to] of MOVES) {
    if (from.endsWith('/') ? oldPath.startsWith(from) : oldPath === from) return to + oldPath.slice(from.length);
  }
  return null;
}

const EXTENSIONS = ['', '.ts', '.vue', '.js', '.d.ts', '/index.ts'];

/** The first existing file for `base` with a module extension, as a repo-relative path. */
function resolveFile(base, exists) {
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (exists(candidate)) return candidate;
  }
  return null;
}

const existsNow = p => existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile();
// A path in the old layout existed if its new location does now.
const existedBefore = p => {
  const moved = newPathOf(p);
  return moved !== null ? existsNow(moved) : existsNow(p);
};

/** Strips an extension the original specifier didn't spell out. */
function specifierPath(fromFile, target, originalSpec) {
  let rel = toPosix(relative(dirname(fromFile), target));
  if (!rel.startsWith('.')) rel = `./${rel}`;
  const spelled = posix.extname(originalSpec);
  if (spelled) return rel;
  if (rel.endsWith('/index.ts')) return rel.slice(0, -'/index.ts'.length);
  if (rel.endsWith('.d.ts')) return rel.slice(0, -'.d.ts'.length);
  if (rel.endsWith('.ts')) return rel.slice(0, -'.ts'.length);
  return rel;
}

function walk(dir, out = []) {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'vendor') continue;
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|vue)$/.test(entry.name)) out.push(p);
  }
  return out;
}

// Group 2 is the local name of a default import (`import X from '…'`).
const SPECIFIER =
  /(\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+|\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.(?:mock|importActual|doMock)\(\s*)(['"])([^'"\n]+)\3/g;

const unresolved = [];
let rewrites = 0;
let filesChanged = 0;

const files = ['packages/engine', 'packages/vue', 'apps/site'].flatMap(d => walk(d));

for (const file of files) {
  const oldFile = oldPathOf(file);
  if (oldFile === null) continue; // created for the split, not moved
  const pkg = packageOf(file);
  const source = readFileSync(join(ROOT, file), 'utf8');

  const next = source.replace(SPECIFIER, (match, lead, defaultName, quote, spec) => {
    const isAlias = spec.startsWith('@/');
    const isRelative = spec.startsWith('./') || spec.startsWith('../');
    if (!isAlias && !isRelative) return match;

    if (isRelative && resolveFile(toPosix(join(dirname(file), spec)), existsNow)) return match; // already right

    const oldBase = isAlias ? `src/${spec.slice(2)}` : toPosix(join(dirname(oldFile), spec));
    const oldTarget = resolveFile(oldBase, existedBefore);
    let target = oldTarget && (newPathOf(oldTarget) ?? oldTarget);
    if (!target || !existsNow(target)) {
      unresolved.push(`${file}: ${spec}`);
      return match;
    }
    target = REDIRECTS[pkg]?.[target] ?? target;

    const targetPkg = packageOf(target);
    let replacement;
    let newLead = lead;
    if (targetPkg === pkg) {
      replacement = specifierPath(file, target, spec);
    } else if (target.startsWith(`${targetPkg}/tests/`) && file.startsWith(`${pkg}/tests/`)) {
      replacement = specifierPath(file, target, spec);
    } else {
      // A mock must name the module it replaces, so a crossing one is fixed by hand.
      replacement = lead.startsWith('vi.') ? null : entryFor(target, /^import\s*\(/.test(lead));
      if (replacement && defaultName) {
        // A barrel has no default export: a component is exported under its file name.
        if (!target.endsWith('.vue')) replacement = null;
        else {
          const exported = posix.basename(target, '.vue');
          newLead = `import { ${exported === defaultName ? exported : `${exported} as ${defaultName}`} } from `;
        }
      }
      if (!replacement) {
        unresolved.push(`${file}: ${spec} (→ ${target}, no entry from ${pkg})`);
        return match;
      }
    }
    if (replacement === spec && newLead === lead) return match;
    rewrites++;
    return `${newLead}${quote}${replacement}${quote}`;
  });

  if (next !== source) {
    filesChanged++;
    if (!dryRun) writeFileSync(join(ROOT, file), next);
  }
}

console.log(`${dryRun ? '[dry run] ' : ''}${rewrites} specifiers rewritten in ${filesChanged} files.`);
if (unresolved.length) {
  console.error(`\n${unresolved.length} specifiers could not be resolved:`);
  for (const u of unresolved) console.error(`  ${u}`);
  process.exit(1);
}
