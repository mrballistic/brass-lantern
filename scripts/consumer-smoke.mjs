#!/usr/bin/env node
// The consumer smoke test: what someone who runs `npm install @brass-lantern/…`
// gets. Packs each package exactly as `npm publish` would, installs the
// tarballs into a scratch project outside the repo, and uses them from plain
// Node (no DOM, no bundler, no workspace links) and from `tsc`; then builds
// two small Vite apps from them and loads those in a real browser (Playwright)
// to check the stylesheet stays inside its containers and the Z-machine
// interpreter stays in its own chunk.
//
//   npm run smoke            builds the packages first
//   node scripts/consumer-smoke.mjs --no-build   uses the dist/ already there
//   node scripts/consumer-smoke.mjs --no-browser skips the browser checks
//
// Needs the npm registry for the peers (vue, pinia, express, ifvms, types,
// vite, playwright). The browser is Playwright's Chromium if it is installed,
// else the system's Chrome; failing both, it installs Playwright's.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGES = ['@brass-lantern/engine', '@brass-lantern/vue', '@brass-lantern/server'];
const keep = process.argv.includes('--keep');
const build = !process.argv.includes('--no-build');
const browserChecks = !process.argv.includes('--no-browser');
/** A string only ifvms's code contains: where it shows up is where the interpreter is bundled. */
const IFVMS_MARKER = 'xorshift_seed';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? `\n       ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function run(cmd, args, cwd, { quiet = true } = {}) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' },
  });
}

/** Runs a Node ESM snippet in the scratch project; resolves to its stdout, or throws with stderr. */
function node(cwd, code) {
  return run(process.execPath, ['--input-type=module', '-e', code], cwd).trim();
}

function tsc(cwd, project) {
  try {
    run(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', project], cwd);
    return '';
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() || String(error);
  }
}

if (build) {
  console.log('Building the packages…');
  run('npm', ['run', 'build:packages'], ROOT, { quiet: false });
}

// 1. What each tarball contains.
console.log('\nTarball contents (npm pack --dry-run):');
const contents = {};
for (const pkg of PACKAGES) {
  const [report] = JSON.parse(run('npm', ['pack', '--dry-run', '--json', '-w', pkg], ROOT));
  const files = report.files.map((f) => f.path);
  contents[pkg] = files;
  const short = pkg.replace('@brass-lantern/', '');
  check(`${short}: ${files.length} files, ${(report.unpackedSize / 1024).toFixed(0)} kB unpacked`, files.length > 0);
  check(`${short}: ships dist/`, files.some((f) => f.startsWith('dist/')));
  check(`${short}: ships package.json and LICENSE`, files.includes('package.json') && files.includes('LICENSE'));
  // The engine bundles third-party text (Zork I, glkapi.js), so its notices ship with it.
  if (short === 'engine') check('engine: ships THIRD_PARTY_NOTICES.md', files.includes('THIRD_PARTY_NOTICES.md'));
  const strays = files.filter((f) => /(^|\/)tests?\/|\.test\.|\.spec\.|test-setup|^src\/|coverage\/|\.env/.test(f));
  check(`${short}: no tests, sources, coverage or env files`, strays.length === 0, strays.join(', '));
  const maps = files.filter((f) => f.endsWith('.map'));
  check(`${short}: no source maps`, maps.length === 0, maps.join(', '));
  // Every entry in the exports map points at a file that ships.
  const manifest = JSON.parse(readFileSync(join(ROOT, 'packages', short, 'package.json'), 'utf8'));
  const targets = Object.values(manifest.exports).flatMap((entry) =>
    typeof entry === 'string' ? [entry] : Object.entries(entry).filter(([cond]) => !cond.startsWith('@brass-lantern/')).map(([, t]) => t),
  );
  const missing = targets.map((t) => t.replace(/^\.\//, '')).filter((t) => !files.includes(t));
  check(`${short}: every export target ships (${targets.length})`, missing.length === 0, missing.join(', '));
}
check('vue: ships the stylesheet', contents['@brass-lantern/vue'].includes('dist/style.css'));
check(
  'server: leaves the app entry (index, config) out',
  !contents['@brass-lantern/server'].some((f) => /^dist\/(index|config)\./.test(f)),
  contents['@brass-lantern/server'].filter((f) => /^dist\/(index|config)\./.test(f)).join(', '),
);
check(
  'engine: ships the vendored glkapi',
  contents['@brass-lantern/engine'].includes('dist/zmachine/vendor/glkapi.js'),
);

// 2. Pack for real and install into a scratch project.
const scratch = mkdtempSync(join(tmpdir(), 'brass-lantern-smoke-'));
const tarballs = {};
try {
  const packDir = join(scratch, 'tarballs');
  mkdirSync(packDir);
  for (const pkg of PACKAGES) {
    const [report] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', packDir, '-w', pkg], ROOT));
    tarballs[pkg] = join(packDir, report.filename);
  }

  const app = join(scratch, 'app');
  mkdirSync(app);
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'smoke-consumer', private: true, type: 'module' }, null, 2));

  // Phase A: a Node host with the engine and the server, and no ifvms.
  console.log(`\nPhase A: engine + server in ${app} (no ifvms)…`);
  run('npm', ['install', '--ignore-scripts', tarballs['@brass-lantern/engine'], tarballs['@brass-lantern/server'], '@types/node@24'], app);

  try {
    const out = node(
      app,
      `import { createGame, auditWorld } from '@brass-lantern/engine';
       import { tutorial } from '@brass-lantern/engine/worlds';
       const game = createGame(tutorial);
       let reply;
       for (const line of ['open drawer', 'take stapler', 'north', 'take mug and give mug to gary', 'talk to gary', 'north', 'smash machine with stapler']) reply = game.send(line);
       console.log(JSON.stringify({ gameOver: reply.gameOver, state: game.state.gameOver, audit: auditWorld(tutorial), opening: game.opening.length, typeofDocument: typeof document }));`,
    );
    const result = JSON.parse(out);
    check('engine: the tutorial plays to gameOver in Node', result.gameOver === true && result.state === true, out);
    check('engine: auditWorld(tutorial) is []', Array.isArray(result.audit) && result.audit.length === 0, out);
    check('engine: no DOM in this process', result.typeofDocument === 'undefined', out);
  } catch (error) {
    check('engine: core and worlds import and play in Node', false, error.stderr || String(error));
  }

  try {
    const out = node(
      app,
      `const zm = await import('@brass-lantern/engine/zmachine');
       console.log(JSON.stringify(Object.keys(zm).sort()));`,
    );
    const keys = JSON.parse(out);
    check(
      "engine: import('@brass-lantern/engine/zmachine') loads without ifvms (shelf, saves, story files)",
      ['IndexedDbShelf', 'SaveStoreDialog', 'localStorageSaveStore', 'readStoryFile'].every((k) => keys.includes(k)),
      out,
    );
    check("engine: …and has no ZMachineSession (that's ./zmachine/session)", !keys.includes('ZMachineSession'), out);
  } catch (error) {
    check("engine: import('@brass-lantern/engine/zmachine') without ifvms", false, error.stderr || String(error));
  }
  try {
    const out = node(
      app,
      `try { await import('@brass-lantern/engine/zmachine/session'); console.log('LOADED'); } catch (e) { console.log('ERR ' + e.message); }`,
    );
    check("engine: import('@brass-lantern/engine/zmachine/session') without ifvms rejects naming ifvms", out.startsWith('ERR') && /ifvms/.test(out), out);
    check('engine: …and says how to install it', /npm install ifvms/.test(out), out);
  } catch (error) {
    check("engine: import('@brass-lantern/engine/zmachine/session') without ifvms", false, error.stderr || String(error));
  }

  try {
    const out = node(
      app,
      `const server = await import('@brass-lantern/server');
       let threw = '';
       try { await server.parseIntent('look', { roomName: 'x', exits: [], items: [], npcs: [], inventory: [] }, { apiKey: '' }); } catch (e) { threw = e.message; }
       console.log(JSON.stringify({ parseIntent: typeof server.parseIntent, vocab: Array.isArray(server.ACTION_VOCAB), threw }));`,
    );
    const result = JSON.parse(out);
    check('server: exposes parseIntent', result.parseIntent === 'function', out);
    check('server: exposes ACTION_VOCAB', result.vocab === true, out);
    check('server: parseIntent refuses an empty key without calling out', result.threw.length > 0, out);
  } catch (error) {
    check('server: imports in Node without express', false, error.stderr || String(error));
  }

  // CommonJS consumers (an Express app, say): require() of an ES module, Node >= 22.12.
  writeFileSync(
    join(app, 'consumer.cjs'),
    `const engine = require('@brass-lantern/engine');
const { tutorial } = require('@brass-lantern/engine/worlds');
const server = require('@brass-lantern/server');
const zm = require('@brass-lantern/engine/zmachine');
console.log(JSON.stringify({ createGame: typeof engine.createGame, gameOver: engine.createGame(tutorial).send('look').gameOver, parseIntent: typeof server.parseIntent, readStoryFile: typeof zm.readStoryFile }));
`,
  );
  try {
    const out = run(process.execPath, ['consumer.cjs'], app).trim();
    const result = JSON.parse(out);
    check("cjs: require('@brass-lantern/engine') and require('@brass-lantern/server') work", result.createGame === 'function' && result.gameOver === false && result.parseIntent === 'function', out);
    check("cjs: require('@brass-lantern/engine/zmachine') works (no ifvms needed)", result.readStoryFile === 'function', out);
  } catch (error) {
    check('cjs: require() of the engine and the server', false, error.stderr || String(error));
  }

  writeFileSync(
    join(app, 'consumer.ts'),
    `import { createGame, auditWorld, type EngineReply, type World, type GameState } from '@brass-lantern/engine';
import { tutorial, zork1 } from '@brass-lantern/engine/worlds';
import { parseIntent, type IntentContext, type ParseIntentOptions } from '@brass-lantern/server';

const world: World = tutorial;
const game = createGame(world, { seed: 7 });
const reply: EngineReply = game.send('look');
const state: GameState = game.state;
const problems: string[] = auditWorld(zork1);
const options: ParseIntentOptions = { apiKey: 'k', timeoutMs: 100 };
const context: IntentContext = { roomName: state.currentRoom, exits: [], items: [], npcs: [], inventory: [] };
void parseIntent('look', context, options);
// @ts-expect-error createGame needs a world
createGame();
export const summary: [boolean, number] = [reply.gameOver, problems.length];
`,
  );
  const nodeNext = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      // A Node host: Node's types, no DOM.
      types: ['node'],
      lib: ['ES2022'],
    },
    files: ['consumer.ts'],
  };
  writeFileSync(join(app, 'tsconfig.nodenext.json'), JSON.stringify(nodeNext, null, 2));
  const typeErrors = tsc(app, 'tsconfig.nodenext.json');
  check('types: engine + server resolve under NodeNext (strict, no skipLibCheck, Node types, no DOM lib)', typeErrors === '', typeErrors);

  // Phase B: add express for the adapter, ifvms for story files, and the Vue package.
  console.log('\nPhase B: + express, ifvms and the Vue package (with its vue and pinia peers)…');
  run(
    'npm',
    ['install', '--ignore-scripts', tarballs['@brass-lantern/vue'], 'express@5', '@types/express@5', 'ifvms@1.1.6'],
    app,
  );

  try {
    const out = node(
      app,
      `const { intentRoute } = await import('@brass-lantern/server/express');
       const router = intentRoute({ apiKey: 'k' });
       console.log(JSON.stringify({ intentRoute: typeof intentRoute, router: typeof router }));`,
    );
    const result = JSON.parse(out);
    check('server/express: exposes intentRoute, which builds a router', result.intentRoute === 'function' && result.router === 'function', out);
  } catch (error) {
    check('server/express: imports with express installed', false, error.stderr || String(error));
  }

  try {
    writeFileSync(join(app, 'consumer-express.cjs'), "const { intentRoute } = require('@brass-lantern/server/express');\nconsole.log(typeof intentRoute({ apiKey: 'k' }));\n");
    const out = run(process.execPath, ['consumer-express.cjs'], app).trim();
    check("cjs: require('@brass-lantern/server/express') builds a router", out === 'function', out);
  } catch (error) {
    check("cjs: require('@brass-lantern/server/express')", false, error.stderr || String(error));
  }

  try {
    writeFileSync(
      join(app, 'consumer-vue.cjs'),
      `const vue = require('@brass-lantern/vue');
let session = 'loaded';
try { require('@brass-lantern/engine/zmachine/session'); } catch (e) { session = e.code; }
console.log(JSON.stringify({ mountGame: typeof vue.mountGame, session }));
`,
    );
    const result = JSON.parse(run(process.execPath, ['consumer-vue.cjs'], app).trim());
    check("cjs: require('@brass-lantern/vue') works", result.mountGame === 'function', JSON.stringify(result));
    check(
      "cjs: require('@brass-lantern/engine/zmachine/session') throws ERR_REQUIRE_ASYNC_MODULE (it is ESM only, as documented)",
      result.session === 'ERR_REQUIRE_ASYNC_MODULE',
      JSON.stringify(result),
    );
  } catch (error) {
    check("cjs: require('@brass-lantern/vue')", false, error.stderr || String(error));
  }

  try {
    const story = join(ROOT, 'packages/engine/tests/fixtures/zork1.z3');
    const out = node(
      app,
      `import { readFileSync } from 'node:fs';
       const zm = await import('@brass-lantern/engine/zmachine');
       const { ZMachineSession } = await import('@brass-lantern/engine/zmachine/session');
       const lines = [];
       const storage = new Map();
       const store = { list: () => [...storage.keys()], read: (k) => storage.get(k) ?? null, write: (k, v) => void storage.set(k, v), remove: (k) => void storage.delete(k) };
       const dialog = new zm.SaveStoreDialog(store);
       let waiting = false;
       const session = new ZMachineSession(new Uint8Array(readFileSync(${JSON.stringify(story)})), dialog, {
         onLines: (l) => lines.push(...l), onStatus() {}, onWaiting() { waiting = true; }, onExit() {}, onError(m) { lines.push('ERROR ' + m); },
       });
       session.start();
       for (const t = Date.now(); !waiting && Date.now() - t < 5000; ) await new Promise((r) => setTimeout(r, 5));
       session.submit('open mailbox');
       waiting = false;
       for (const t = Date.now(); !waiting && Date.now() - t < 5000; ) await new Promise((r) => setTimeout(r, 5));
       console.log(JSON.stringify({ separate: !('ZMachineSession' in zm) && typeof ZMachineSession === 'function', waiting, text: lines.join(' ') }));`,
    );
    const result = JSON.parse(out);
    check('engine/zmachine/session: loads with ifvms installed; ./zmachine stays without it', result.separate === true, out);
    check('engine/zmachine: Zork I boots in Node and answers OPEN MAILBOX', result.waiting && /West of House/.test(result.text) && /leaflet/.test(result.text), out.slice(0, 400));
  } catch (error) {
    check('engine/zmachine: runs a story with ifvms installed', false, error.stderr || String(error));
  }

  try {
    const out = node(
      app,
      `const vue = await import('@brass-lantern/vue');
       const names = ['BrassLantern', 'ConsentBanner', 'mountGame', 'useTypewriter', 'resolveTheme', 'PRESETS', 'PALETTES', 'UnknownTheme'];
       const internal = ['Terminal', 'CrtBootSequence', 'createGameStore', 'setDownload', 'useTheme', 'createCatalog', 'createPersistenceService'];
       console.log(JSON.stringify({ missing: names.filter((n) => !(n in vue)), leaked: internal.filter((n) => n in vue) }));`,
    );
    const result = JSON.parse(out);
    check('vue: the entry imports in Node and exports the public API', result.missing.length === 0, out);
    check('vue: …and none of the internals (Terminal, the boot sequence, the stores)', result.leaked.length === 0, out);
  } catch (error) {
    check('vue: the entry imports in Node', false, error.stderr || String(error));
  }

  try {
    const css = readFileSync(join(app, 'node_modules/@brass-lantern/vue/dist/style.css'), 'utf8');
    const resolved = node(app, `console.log(import.meta.resolve('@brass-lantern/vue/style.css'))`);
    check("vue: '@brass-lantern/vue/style.css' resolves to the shipped stylesheet", resolved.endsWith('/dist/style.css') && css.includes('--'), resolved);
  } catch (error) {
    check("vue: '@brass-lantern/vue/style.css' resolves", false, error.stderr || String(error));
  }

  writeFileSync(
    join(app, 'consumer-vue.ts'),
    `import { createPinia } from 'pinia';
import { mountGame, BrassLantern, resolveTheme, type Cartridge, type GameOptions, type Theme } from '@brass-lantern/vue';
import { tutorial } from '@brass-lantern/engine/worlds';
import { SaveStoreDialog, localStorageSaveStore, type SaveStore } from '@brass-lantern/engine/zmachine';
import { ZMachineSession } from '@brass-lantern/engine/zmachine/session';
import { intentRoute } from '@brass-lantern/server/express';
import type { Router } from 'express';

const options: GameOptions = {
  cartridges: [{ kind: 'world', id: 'snack', title: 'SNACK', world: tutorial }],
  storagePrefix: 'smoke',
  intentEndpoint: null,
  theme: 'crt-green',
  storyBaseUrl: '/games/',
  devChecks: false,
  autofocus: false,
};
const cart: Cartridge = options.cartridges[0];
void cart;
void createPinia;
void BrassLantern;
const theme: Theme = { ...resolveTheme('crt-amber', {}, {}, { reducedMotion: false, prefersDark: true }) } as unknown as Theme;
void theme;
const mount: typeof mountGame = mountGame;
void mount;
const store: SaveStore = localStorageSaveStore('smoke');
void store;
void ZMachineSession;
void new SaveStoreDialog(store);
const router: Router = intentRoute({ apiKey: 'k' });
void router;
`,
  );
  const bundler = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      types: ['node'],
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    },
    files: ['consumer.ts', 'consumer-vue.ts'],
  };
  writeFileSync(join(app, 'tsconfig.bundler.json'), JSON.stringify(bundler, null, 2));
  const bundlerErrors = tsc(app, 'tsconfig.bundler.json');
  check('types: all three packages resolve under Bundler (strict, no skipLibCheck)', bundlerErrors === '', bundlerErrors);

  // Under NodeNext, unresolvable relative specifiers in the vue package's
  // .d.ts would make its types silently `any`; the expected errors catch that.
  writeFileSync(
    join(app, 'consumer-vue-nodenext.ts'),
    `import { BrassLantern, mountGame, resolveTheme, type GameOptions } from '@brass-lantern/vue';
import type { ResolvedTheme } from '@brass-lantern/vue';

// @ts-expect-error not an option
export const o: GameOptions = { cartridges: [], storagePrefix: 'x', bogus: 1 };
// @ts-expect-error a function isn't a number
export const n: number = resolveTheme;
// @ts-expect-error mountGame needs options
mountGame('#app');
// @ts-expect-error a component isn't a number (the .vue declarations resolve)
export const b: number = BrassLantern;
export const ok: GameOptions = { cartridges: [], storagePrefix: 'x', storyBaseUrl: '/', devChecks: true };
export type T = ResolvedTheme;
`,
  );
  const vueNodeNext = {
    compilerOptions: { ...nodeNext.compilerOptions, lib: ['ES2022', 'DOM', 'DOM.Iterable'], skipLibCheck: true },
    files: ['consumer-vue-nodenext.ts'],
  };
  writeFileSync(join(app, 'tsconfig.vue-nodenext.json'), JSON.stringify(vueNodeNext, null, 2));
  const vueNodeNextErrors = tsc(app, 'tsconfig.vue-nodenext.json');
  check('types: the vue package resolves under NodeNext (its types aren’t any)', vueNodeNextErrors === '', vueNodeNextErrors);

  // Phase C: a bundler and a browser.
  console.log('\nPhase C: Vite builds of two small apps, then a browser…');
  run('npm', ['install', '--ignore-scripts', 'vite@8', 'playwright@1.64'], app);
  const builds = {
    // Native worlds only: the interpreter must stay out of the entry chunk and never load.
    native: {
      html: `<!doctype html>
<html><head><meta charset="utf-8"><title>host</title>
<style>
  body { font-family: Georgia, serif; margin: 0; padding: 20px; }
  .box { width: 600px; height: 300px; margin: 40px 0; }
  .probe { width: 100px; padding: 10px; border: 5px solid #888; }
  .filler { height: 3000px; }
</style></head>
<body>
  <h1>A host page with two games</h1>
  <div id="probe" class="probe">content-box</div>
  <div id="game-a" class="box"></div>
  <div id="game-b" class="box"></div>
  <div class="filler" id="filler">more page</div>
  <script type="module" src="./main.js"></script>
</body></html>`,
      main: `import { mountGame } from '@brass-lantern/vue';
import '@brass-lantern/vue/style.css';
import { tutorial } from '@brass-lantern/engine/worlds';
// The whole ./zmachine entry, used as a namespace so no tree-shaking can drop
// any of it: it must still bring no interpreter with it.
import * as zmachine from '@brass-lantern/engine/zmachine';
window.zmachineEntry = Object.keys(zmachine);
const cartridges = [{ kind: 'world', id: 'snack', title: 'SNACK', world: tutorial }];
mountGame('#game-a', { cartridges, storagePrefix: 'game-a' });
mountGame('#game-b', { cartridges, storagePrefix: 'game-b', theme: 'crt-green', autofocus: false });
`,
    },
    // One story file: the interpreter loads, from a chunk of its own.
    zcode: {
      html: `<!doctype html>
<html><head><meta charset="utf-8"><title>zcode</title>
<style>html, body, #app { height: 100%; margin: 0; overflow: hidden; }</style></head>
<body><div id="app"></div><script type="module" src="./main.js"></script></body></html>`,
      main: `import { mountGame } from '@brass-lantern/vue';
import '@brass-lantern/vue/style.css';
mountGame('#app', { cartridges: [{ kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' }], storagePrefix: 'z' });
`,
    },
  };
  const dists = {};
  for (const [name, { html, main }] of Object.entries(builds)) {
    const dir = join(app, `web-${name}`);
    mkdirSync(join(dir, 'public', 'stories'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
    writeFileSync(join(dir, 'main.js'), main);
    if (name === 'zcode') copyFileSync(join(ROOT, 'packages/engine/tests/fixtures/zork1.z3'), join(dir, 'public', 'stories', 'zork1.z3'));
    try {
      run(process.execPath, [join(app, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'error'], dir);
    } catch (error) {
      check(`vite: the ${name} app builds from the tarballs`, false, error.stderr || String(error));
      continue;
    }
    const dist = join(dir, 'dist');
    dists[name] = dist;
    const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
    const entry = indexHtml.match(/<script[^>]+src="\/?(assets\/[^"]+\.js)"/)?.[1];
    const chunks = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js')).map((f) => `assets/${f}`);
    const withIfvms = chunks.filter((c) => readFileSync(join(dist, c), 'utf8').includes(IFVMS_MARKER));
    const entryKb = entry ? (statSync(join(dist, entry)).size / 1024).toFixed(0) : '?';
    check(`vite (${name}): the entry chunk (${entry}, ${entryKb} kB) has no ifvms code`, Boolean(entry) && !withIfvms.includes(entry), `ifvms in: ${withIfvms.join(', ')}`);
    check(`vite (${name}): ifvms is in one separate, lazily imported chunk`, withIfvms.length === 1 && withIfvms[0] !== entry, `ifvms in: ${withIfvms.join(', ') || 'none'}`);
    dists[`${name}:ifvmsChunk`] = withIfvms[0];
  }

  if (!browserChecks) {
    console.log('skip the browser checks (--no-browser)');
  } else if (dists.native && dists.zcode) {
    await browserPhase(app, dists);
  }
} catch (error) {
  check('the scratch project', false, error.stderr || error.stack || String(error));
} finally {
  if (keep) console.log(`\nKept ${scratch}`);
  else rmSync(scratch, { recursive: true, force: true });
}

/** Serves a built app's dist/ on a free port; resolves to its URL and a close(). */
async function serve(dist) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const server = createServer((req, res) => {
    let path = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!existsSync(path) || statSync(path).isDirectory()) path = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((done) => server.close(done)) };
}

/** Playwright's Chromium, else the system's Chrome, else Playwright's after installing it. */
async function launchBrowser(app) {
  const { chromium } = await import(pathToFileURL(join(app, 'node_modules/playwright/index.mjs')).href);
  const attempts = [() => chromium.launch(), () => chromium.launch({ channel: 'chrome' })];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch {
      // Try the next.
    }
  }
  console.log('Installing Playwright’s Chromium…');
  run(process.execPath, [join(app, 'node_modules/playwright/cli.js'), 'install', 'chromium'], app, { quiet: false });
  return chromium.launch();
}

async function browserPhase(app, dists) {
  let browser;
  try {
    browser = await launchBrowser(app);
  } catch (error) {
    check('browser: launch Chromium or Chrome', false, String(error).slice(0, 400));
    return;
  }
  try {
    // 1. Two games in fixed-size boxes on a page that scrolls.
    const native = await serve(dists.native);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const requested = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await page.goto(native.url);
    await page.waitForSelector('#game-a .crt-boot');
    await page.waitForSelector('#game-b .crt-boot');
    const layout = () =>
      page.evaluate(() => {
        const rect = (el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        };
        return ['#game-a', '#game-b'].map((id) => {
          const box = document.querySelector(id);
          const shell = box.querySelector('.crt-shell');
          const overlays = Object.fromEntries(
            ['.crt-noise', '.crt-vignette', '.crt-boot', '.terminal'].map((s) => [s, shell.querySelector(s) ? rect(shell.querySelector(s)) : null]),
          );
          return { box: rect(box), shell: rect(shell), overlays };
        });
      });
    const near = (a, b) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2;
    const booting = await layout();
    await page.waitForSelector('#game-a .terminal', { timeout: 20000 });
    await page.waitForSelector('#game-b .terminal', { timeout: 20000 });
    const booted = await layout();
    const measurements = { booting, booted };
    for (const [i, id] of ['game-a', 'game-b'].entries()) {
      const { box, shell } = booted[i];
      check(`layout: #${id}’s shell is its container’s size and place (${shell.w}×${shell.h} at ${shell.x},${shell.y}; box ${box.w}×${box.h})`, near(shell, box) && box.w === 600 && box.h === 300, JSON.stringify(booted[i]));
      const during = booting[i];
      const inside = (r) => r === null || near(r, during.shell);
      check(`layout: #${id}’s noise, vignette and boot overlay cover its shell, not the page`, inside(during.overlays['.crt-noise']) && inside(during.overlays['.crt-vignette']) && during.overlays['.crt-boot'] !== null && inside(during.overlays['.crt-boot']), JSON.stringify(during));
      check(`layout: #${id}’s terminal fills its shell`, near(booted[i].overlays['.terminal'], shell), JSON.stringify(booted[i]));
    }
    const [a, b] = booted.map((g) => g.shell);
    check('layout: the two games don’t overlap', a.y + a.h <= b.y || b.y + b.h <= a.y, JSON.stringify({ a, b }));
    const host = await page.evaluate(async () => {
      const cs = (el) => getComputedStyle(el);
      const before = window.scrollY;
      window.scrollTo(0, 1200);
      await new Promise((r) => requestAnimationFrame(() => r()));
      const filler = document.querySelector('#filler').getBoundingClientRect();
      const hit = document.elementFromPoint(640, Math.min(window.innerHeight - 10, Math.max(10, filler.top + 100)));
      return {
        bodyFont: cs(document.body).fontFamily,
        htmlOverflow: cs(document.documentElement).overflow,
        bodyOverflow: cs(document.body).overflow,
        scrollHeight: document.scrollingElement.scrollHeight,
        innerHeight: window.innerHeight,
        before,
        scrolled: window.scrollY,
        probeWidth: document.querySelector('#probe').offsetWidth,
        hit: hit ? hit.id || hit.className || hit.tagName : null,
        focusedIn: document.activeElement?.closest('#game-a') ? 'game-a' : document.activeElement?.closest('#game-b') ? 'game-b' : document.activeElement?.tagName,
      };
    });
    measurements.host = host;
    check(`layout: the host body font is unchanged (${host.bodyFont})`, /^Georgia,\s*serif$/.test(host.bodyFont), JSON.stringify(host));
    check(`layout: the page still scrolls (${host.scrollHeight}px tall in an ${host.innerHeight}px window; scrolled to ${host.scrolled})`, host.htmlOverflow !== 'hidden' && host.bodyOverflow !== 'hidden' && host.scrollHeight > host.innerHeight && host.scrolled === 1200, JSON.stringify(host));
    check('layout: the host’s own boxes keep content-box sizing (100px + 2×10 padding + 2×5 border = 130)', host.probeWidth === 130, JSON.stringify(host));
    check('layout: below the games, the page is the page (no overlay covers it)', host.hit === 'filler', JSON.stringify(host));
    check('autofocus: the default game took focus; the autofocus: false one didn’t', host.focusedIn === 'game-a', JSON.stringify(host));
    const ifvmsChunk = `/${dists['native:ifvmsChunk']}`;
    check(`lazy: a page with only native worlds never loads the interpreter (${dists['native:ifvmsChunk']})`, !requested.includes(ifvmsChunk), requested.join(', '));
    writeFileSync(join(app, 'layout-measurements.json'), JSON.stringify(measurements, null, 2));
    console.log(`     measurements: ${join(app, 'layout-measurements.json')}`);
    await page.close();
    await native.close();

    // 2. A story file: the interpreter's chunk loads, and Zork I boots.
    const zcode = await serve(dists.zcode);
    const zpage = await browser.newPage({ viewport: { width: 1024, height: 700 } });
    const zrequested = [];
    zpage.on('request', (r) => zrequested.push(new URL(r.url()).pathname));
    await zpage.goto(zcode.url);
    let storyBooted = true;
    try {
      await zpage.waitForFunction(() => /West of House/.test(document.querySelector('.terminal-output')?.textContent ?? ''), null, { timeout: 30000 });
    } catch {
      storyBooted = false;
    }
    const shell = await zpage.evaluate(() => {
      const r = document.querySelector('.crt-shell').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    check(`lazy: a story cartridge loads the interpreter’s chunk (${dists['zcode:ifvmsChunk']}) and Zork I boots`, storyBooted && zrequested.includes(`/${dists['zcode:ifvmsChunk']}`), zrequested.join(', '));
    check(`layout: a full-screen container gives the shell the viewport (${shell.w}×${shell.h})`, shell.w === 1024 && shell.h === 700, JSON.stringify(shell));
    await zpage.close();
    await zcode.close();
  } catch (error) {
    check('browser: the checks ran', false, error.stack || String(error));
  } finally {
    await browser.close();
  }
}

console.log(failures === 0 ? '\nConsumer smoke test passed.' : `\nConsumer smoke test: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);

