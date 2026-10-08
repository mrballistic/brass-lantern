#!/usr/bin/env node
// The consumer smoke test: what someone who runs `npm install @brass-lantern/…`
// gets. Packs each package exactly as `npm publish` would, installs the
// tarballs into a scratch project outside the repo, and uses them from plain
// Node (no DOM, no bundler, no workspace links) and from `tsc`.
//
//   npm run smoke            builds the packages first
//   node scripts/consumer-smoke.mjs --no-build   uses the dist/ already there
//
// Needs the npm registry for the peers (vue, pinia, express, ifvms, types).

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGES = ['@brass-lantern/engine', '@brass-lantern/vue', '@brass-lantern/server'];
const keep = process.argv.includes('--keep');
const build = !process.argv.includes('--no-build');

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

  for (const entry of ['@brass-lantern/engine/zmachine', '@brass-lantern/engine/zmachine/session']) {
    try {
      const out = node(
        app,
        `try { await import('${entry}'); console.log('LOADED'); } catch (e) { console.log('ERR ' + e.message); }`,
      );
      check(`engine: import('${entry}') without ifvms rejects naming ifvms`, out.startsWith('ERR') && /ifvms/.test(out), out);
      check(`engine: …and says how to install it`, /npm install ifvms/.test(out), out);
    } catch (error) {
      check(`engine: import('${entry}') without ifvms`, false, error.stderr || String(error));
    }
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
console.log(JSON.stringify({ createGame: typeof engine.createGame, gameOver: engine.createGame(tutorial).send('look').gameOver, parseIntent: typeof server.parseIntent }));
`,
  );
  try {
    const out = run(process.execPath, ['consumer.cjs'], app).trim();
    const result = JSON.parse(out);
    check("cjs: require('@brass-lantern/engine') and require('@brass-lantern/server') work", result.createGame === 'function' && result.gameOver === false && result.parseIntent === 'function', out);
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
    const story = join(ROOT, 'packages/engine/tests/fixtures/zork1.z3');
    const out = node(
      app,
      `import { readFileSync } from 'node:fs';
       const zm = await import('@brass-lantern/engine/zmachine');
       const { ZMachineSession } = await import('@brass-lantern/engine/zmachine/session');
       const lines = [];
       const storage = new Map();
       const store = { list: () => [...storage.keys()], read: (k) => storage.get(k) ?? null, write: (k, v) => void storage.set(k, v), remove: (k) => void storage.delete(k) };
       const dialog = new zm.LocalStorageDialog(store);
       let waiting = false;
       const session = new ZMachineSession(new Uint8Array(readFileSync(${JSON.stringify(story)})), dialog, {
         onLines: (l) => lines.push(...l), onStatus() {}, onWaiting() { waiting = true; }, onExit() {}, onError(m) { lines.push('ERROR ' + m); },
       });
       session.start();
       for (const t = Date.now(); !waiting && Date.now() - t < 5000; ) await new Promise((r) => setTimeout(r, 5));
       session.submit('open mailbox');
       waiting = false;
       for (const t = Date.now(); !waiting && Date.now() - t < 5000; ) await new Promise((r) => setTimeout(r, 5));
       console.log(JSON.stringify({ same: zm.ZMachineSession === ZMachineSession, waiting, text: lines.join(' ') }));`,
    );
    const result = JSON.parse(out);
    check('engine/zmachine: loads with ifvms installed (one ZMachineSession for both entries)', result.same === true, out);
    check('engine/zmachine: Zork I boots in Node and answers OPEN MAILBOX', result.waiting && /West of House/.test(result.text) && /leaflet/.test(result.text), out.slice(0, 400));
  } catch (error) {
    check('engine/zmachine: runs a story with ifvms installed', false, error.stderr || String(error));
  }

  try {
    const out = node(
      app,
      `const vue = await import('@brass-lantern/vue');
       const names = ['BrassLantern', 'Terminal', 'CrtBootSequence', 'ConsentBanner', 'mountGame', 'createGameStore', 'useTheme', 'resolveTheme', 'PRESETS'];
       console.log(JSON.stringify({ missing: names.filter((n) => !(n in vue)) }));`,
    );
    const result = JSON.parse(out);
    check('vue: the entry imports in Node and exports the public API', result.missing.length === 0, out);
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
import { createGameStore, mountGame, BrassLantern, resolveTheme, type GameOptions, type Theme } from '@brass-lantern/vue';
import { tutorial } from '@brass-lantern/engine/worlds';
import { ZMachineSession, localStorageSaveStore, type SaveStore } from '@brass-lantern/engine/zmachine';
import { intentRoute } from '@brass-lantern/server/express';
import type { Router } from 'express';

const options: GameOptions = {
  cartridges: [{ kind: 'world', id: 'snack', title: 'SNACK', world: tutorial }],
  storagePrefix: 'smoke',
  intentEndpoint: null,
  theme: 'crt-green',
  storyBaseUrl: '/games/',
  devChecks: false,
};
const useGame = createGameStore(options);
void useGame;
void createPinia;
void BrassLantern;
const theme: Theme = { ...resolveTheme('crt-amber', {}, {}, { reducedMotion: false, prefersDark: true }) } as unknown as Theme;
void theme;
const mount: typeof mountGame = mountGame;
void mount;
const store: SaveStore = localStorageSaveStore('smoke');
void store;
void ZMachineSession;
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
    `import { BrassLantern, createGameStore, mountGame, type GameOptions } from '@brass-lantern/vue';
import type { ResolvedTheme } from '@brass-lantern/vue';

// @ts-expect-error not an option
export const o: GameOptions = { cartridges: [], storagePrefix: 'x', bogus: 1 };
// @ts-expect-error a store factory isn't a number
export const n: number = createGameStore;
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
} catch (error) {
  check('the scratch project', false, error.stderr || error.stack || String(error));
} finally {
  if (keep) console.log(`\nKept ${scratch}`);
  else rmSync(scratch, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nConsumer smoke test passed.' : `\nConsumer smoke test: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);

