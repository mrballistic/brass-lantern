// tsc compiles src/ to dist/ but doesn't copy plain .js inputs or .d.ts files:
// the vendored glkapi (and its declaration) are copied as they are.
import { cpSync } from 'node:fs';
import { join } from 'node:path';

const pkg = join(import.meta.dirname, '..');
for (const file of ['glkapi.js', 'glkapi.d.ts']) {
  cpSync(join(pkg, 'src/zmachine/vendor', file), join(pkg, 'dist/zmachine/vendor', file));
}
