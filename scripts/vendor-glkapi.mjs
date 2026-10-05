// Regenerates src/zmachine/vendor/glkapi.js from glkote-term's copy of
// glkapi.js (MIT, Andrew Plotkin). Run: node scripts/vendor-glkapi.mjs
//
// Two changes to the original:
// 1. It's wrapped as a createGlk() factory instead of a module singleton, so
//    every game session gets its own Glk state.
// 2. Seven variables it assigns without declaring are declared, because ES
//    modules are strict and strict mode rejects implicit globals.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const srcPath = require.resolve('glkote-term/src/glkapi.js');
const version = require('glkote-term/package.json').version;
let s = readFileSync(srcPath, 'utf8');

function replaceOnce(pattern, replacement, what) {
  const count = typeof pattern === 'string' ? s.split(pattern).length - 1 : (s.match(new RegExp(pattern, 'g')) ?? []).length;
  if (count !== 1) throw new Error(`glkapi.js: expected exactly one ${what}, found ${count}`);
  s = s.replace(pattern, replacement);
}

replaceOnce(
  '\nGlk = function() {',
  '\nexport function createGlk() {\n' +
    '/* These were implicit globals in the original, which strict mode (ES modules)\n' +
    '   rejects. Declared here they behave the same, scoped to one instance. */\n' +
    'var ch, content_box, fref, ix, lineobj, lx, split;\n',
  'opening "Glk = function() {"',
);
replaceOnce(/if \(typeof module !== 'undefined' && module\.exports\) \{\n\s+module\.exports = api;\n\}\n/, '', 'module.exports block');
replaceOnce(/return api;\n\n\}\(\);/, 'return api;\n\n}', 'closing "}();"');

const header =
  '/* eslint-disable */\n' +
  `// Vendored from glkote-term ${version} (src/glkapi.js), MIT licensed; the\n` +
  '// original copyright notice follows. Modified by scripts/vendor-glkapi.mjs:\n' +
  '// wrapped as a createGlk() factory and made strict-mode safe.\n' +
  '// Do not edit by hand. Regenerate with: node scripts/vendor-glkapi.mjs\n\n';

mkdirSync(new URL('../src/zmachine/vendor/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/zmachine/vendor/glkapi.js', import.meta.url), header + s);
console.log(`Wrote src/zmachine/vendor/glkapi.js from glkote-term ${version}`);
