// After `vite build` (JavaScript) and `vue-tsc` (declarations):
// - Declarations import components as './X.vue', which TypeScript's NodeNext
//   resolution looks up as X.d.vue.ts and doesn't find (so the types would
//   silently be any). './X.vue.js' resolves to vue-tsc's X.vue.d.ts under
//   both NodeNext and Bundler, so the specifiers are rewritten to that.
// - The stylesheet ships as dist/style.css ('@brass-lantern/vue/style.css').
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = join(import.meta.dirname, '..');
const dist = join(pkg, 'dist');

function declarations(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return declarations(path);
    return entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

for (const file of declarations(dist)) {
  const text = readFileSync(file, 'utf8');
  const next = text.replace(/(from\s+|import\(\s*)(['"])(\.\.?\/[^'"]+\.vue)\2/g, '$1$2$3.js$2');
  if (next !== text) writeFileSync(file, next);
}

copyFileSync(join(pkg, 'src/styles/crt.css'), join(dist, 'style.css'));
