# The npm library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split brass-lantern into three publishable packages (`@brass-lantern/engine`, `@brass-lantern/vue`, `@brass-lantern/server`) in npm workspaces, with themes in the Vue package and the brass-lantern site consuming the packages, without changing how anything looks or plays.

**Architecture:** Change behaviour first, in today's layout, where every test already runs: engine options for the four boundary crossings, the headless `createGame` and `auditWorld`, themes (tokens, presets, player commands), the store factory and mount API, and the server's function API. Then do the move as a mechanical step (git mv plus an import codemod) with the suite green before and after. Then the package builds, boundary checks, consumer smoke test, release workflow and docs.

**Tech Stack:** TypeScript 6, Vue 3.5 / Pinia 4, Vite 8 (library mode for the Vue package), vue-tsc, tsc (engine, server), Vitest 5, ESLint 10 flat config, npm workspaces, VitePress, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-07-npm-library-design.md`.

## Global Constraints

- Behaviour doesn't change: the brass-lantern site and its tests look and play exactly as at 1.13.0; Zork I still matches zork1.z3; every Zork II/III slice still matches its story file.
- The engine package imports no `vue`, `pinia`, `document`, `window` or `localStorage`, and nothing from the apps.
- The Gemini key never reaches a browser: the server package takes it as a parameter and never reads `VITE_*` or any env var itself.
- Engine invariants stand: no world-ID branching; misses never mutate; conditions only in conditions.ts; fuzzy only in fuzzy.ts; seeded randomness only; saves format 2.0.
- Curly quotes in player-facing text. `crt-amber` is pixel-for-pixel today's look and the default.
- Coverage thresholds per package: 80% lines, functions, statements; 75% branches.
- Long Zork tests keep their current gating; DOM-using test files start with `// @vitest-environment happy-dom`.
- Never delete the untracked `tests/zz/` folder (it moves with the engine tests in Task 8 only if tracked; it isn't, so it stays where it is and is excluded).
- Office Space is not touched in this plan. After Task 8 its file sync (`scripts/public-paths.txt`) no longer matches the layout; Office Space stays on 1.13.0 until its own track moves it onto the packages. Say so in the docs.

## Review Focus

1. Two games on one page: separate stores, storage keys, themes and boot state; one's SAVE/THEME doesn't reach the other. (Task 6 test.)
2. `intentEndpoint: null`, or an endpoint that errors or times out (5s): the player gets the engine's literal reply promptly; nothing hangs or throws. (Task 6 test.)
3. An unknown theme name (`THEME PURPLE`) lists the choices and changes nothing; a corrupt stored theme falls back to the author default. (Task 5 test.)
4. A Z-machine cartridge when `ifvms` isn't installed: a clear error naming the missing peer, not a crash at import of the engine. (Task 9 test.)
5. The engine package imported in plain Node (no DOM) plays a world to the end. (Task 9 consumer test.)

---

### Task 1: The engine's four boundary crossings become options

**Files:**
- Modify: `src/types/game.ts` (drops `import { storagePrefix } from '@/app.config'`), `src/engine/scripts.ts` (`FREEZE` from an option), `src/engine/intent-client.ts` (endpoint parameter), `src/zmachine/dialog.ts`, `src/zmachine/shelf.ts`, `src/zmachine/session.ts` (a `SaveStore` instead of `localStorage`), and their callers in `src/stores/game.ts`, `src/components/Terminal.vue`, `src/services/persistence.ts`
- Create: `src/zmachine/save-store.ts`
- Test: `tests/engine/scripts.test.ts`, `tests/engine/intent-client.test.ts`, `tests/zmachine/save-store.test.ts` (new), existing zmachine tests

**Interfaces:**
- Produces:
  - `src/engine/scripts.ts`: `setScriptFreeze(on: boolean): void` (module setting, default `false`); the store/app turns it on in development (`import.meta.env.DEV` read in the app, not the engine).
  - `src/engine/intent-client.ts`: `parseIntentRemote(input, context, options: { endpoint: string; timeoutMs?: number; fetch?: typeof fetch })` (endpoint required; default timeout 5000).
  - `src/zmachine/save-store.ts`: `interface SaveStore { list(): string[]; read(name: string): Uint8Array | null; write(name: string, data: Uint8Array): void; remove(name: string): void }` and `localStorageSaveStore(prefix: string): SaveStore`; `LocalStorageDialog` takes a `SaveStore`.
  - Whatever in `src/types/game.ts` used `storagePrefix` takes it as a parameter (read the file: if it's a key helper, it becomes `saveKeyFor(prefix, id)`).

- [ ] **Step 1: Write the failing tests:** `setScriptFreeze(true)` makes a script that assigns to `ctx.state` throw and `setScriptFreeze(false)` lets it run on the real state (assert both); `parseIntentRemote('x', ctx, { endpoint: 'https://e/x', fetch: fakeFetch })` posts to that URL, and a fetch that never resolves yields `{ action: 'unknown' }` after `timeoutMs`; `localStorageSaveStore('p:')` round-trips bytes under `p:`-prefixed keys and `list()` returns only its own names; a fake in-memory `SaveStore` passed to the Z-machine session's dialog receives a SAVE.
- [ ] **Step 2: Run** — `npx vitest run tests/engine/scripts.test.ts tests/engine/intent-client.test.ts tests/zmachine`. Expected: FAIL.
- [ ] **Step 3: Implement**; the app wiring (store, Terminal, persistence) passes `storagePrefix`, the endpoint `/api/parse-intent`, `localStorageSaveStore(prefix)`, and calls `setScriptFreeze(import.meta.env.DEV)` once at start.
- [ ] **Step 4: Run** the whole suite (`npx vitest run --exclude "tests/zz/**"`), `npm run lint`, `npm run type-check`. Expected: PASS, and `grep -rn "app.config\|import.meta.env\|localStorage" src/engine src/zmachine src/types src/worlds` finds only `src/zmachine/save-store.ts`'s `localStorageSaveStore` and `src/zmachine/vendor/`.
- [ ] **Step 5: Commit** — `git commit -m "Library: the engine takes its storage prefix, intent endpoint, save store and script freeze as options"`.

### Task 2: The headless `createGame` and `auditWorld`

**Files:**
- Create: `src/engine/game.ts` (`createGame`), `src/engine/audit.ts` (moved from `tests/helpers/audit.ts`)
- Modify: `tests/helpers/audit.ts` (re-exports from `src/engine/audit.ts`, so existing tests keep their import), `tests/worlds/zsession.ts` (`openNative`/`nativeTurn` use `createGame` where they duplicate it)
- Test: `tests/engine/game.test.ts` (new), `tests/worlds/audit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/engine/game.ts
  export interface EngineReply { lines: string[]; gameOver: boolean; question?: string }
  export function createGame(world: World, options?: { seed?: number }): {
    state: GameState;
    opening: string[];
    send(line: string): EngineReply;
  };
  // src/engine/audit.ts
  export function auditWorld(world: World): string[];
  ```
  `send` splits compound lines (`splitCommands`), runs captures, the regex parse, pronouns, AGAIN and questions exactly as `nativeTurn` in `tests/worlds/zsession.ts` does today (no LLM), and honours `stopLine`.

- [ ] **Step 1: Write the failing tests:** `createGame(tutorial, { seed: 1 })` returns its opening lines and plays the tutorial's winning commands (reuse the commands from `tests/worlds/tutorial.test.ts`) to `gameOver: true`; a compound line (`take x. look`) returns both replies' lines; AGAIN repeats; a question (which X?) is answered by the next `send`; `auditWorld(zork1)` and `auditWorld(tutorial)` return `[]`, and a broken world returns problems (reuse one case from `tests/worlds/audit.test.ts`).
- [ ] **Step 2: Run** — `npx vitest run tests/engine/game.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, moving `nativeTurn`'s logic into `createGame` and making `zsession.ts` call it (Zork I's differentials are the regression check). `src/engine/audit.ts` must not import from `tests/`.
- [ ] **Step 4: Run** the whole suite with `ZORK_LONG=1`, lint, type-check. Expected: PASS, Zork I and slices unchanged.
- [ ] **Step 5: Commit** — `git commit -m "Library: createGame, a headless turn loop, and auditWorld as engine exports"`.

### Task 3: Theme tokens (crt-amber unchanged)

**Files:**
- Modify: `src/styles/crt.css` (all `--crt-*` palette variables → `--bl-*` roles; every hard-coded `rgba()` glow → `color-mix()` from them), `src/components/*.vue` (any inline colours)
- Test: `tests/components/theme-tokens.test.ts` (new)

**Interfaces:**
- Produces the variable set: `--bl-fg`, `--bl-fg-bright`, `--bl-fg-dim`, `--bl-glow`, `--bl-glow-strong`, `--bl-bg`, `--bl-border`, `--bl-input`, `--bl-location`, `--bl-event`, `--bl-decorative`, `--bl-system`, plus today's timing/decay/typewriter variables renamed `--bl-*`. Default values = today's amber values.

- [ ] **Step 1: Write the failing test:** parse `src/styles/crt.css` (read the file as text in the test) and assert: no `--crt-` names remain; no `rgba(` literal remains outside the `:root` default block; every `--bl-*` palette role is defined in `:root`; and the computed default of each role equals today's value (a table in the test copied from the current `:root`: `--bl-fg: #ffb000`, `--bl-fg-bright: #ffc833`, `--bl-bg: #0a0a08`, `--bl-input: #88ffaa`, `--bl-event: #ff8844`, `--bl-decorative: #ffd866`, `--bl-border: #332800`, …).
- [ ] **Step 2: Run** — `npx vitest run tests/components/theme-tokens.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** For each glow, choose the `color-mix(in srgb, var(--bl-…) N%, transparent)` that reproduces today's `rgba()` exactly (same channel values and alpha); list the mapping in the commit message body.
- [ ] **Step 4: Run** the whole suite, lint, type-check, and `npm run build`; open the built site (`npx vite preview`) and compare a screenshot of the Terminal before/after on the same opening (Playwright if available; otherwise state the manual check in the report). Expected: identical.
- [ ] **Step 5: Commit** — `git commit -m "Themes: CSS variables named for their roles; crt-amber unchanged"`.

### Task 4: Themes: presets, resolution, and applying them

**Files:**
- Create: `src/theme/themes.ts` (types, presets, resolution), `src/theme/useTheme.ts` (composable: applies a resolved theme to a root element; watches `prefers-color-scheme` and `prefers-reduced-motion`)
- Modify: `src/styles/crt.css` (effect-off classes: `.bl-bloom-off`, `.bl-scanlines-off`, `.bl-flicker-off`, `.bl-vignette-off`, `.bl-noise-off`, `.bl-glitch-off`, `.bl-decay-off`), `src/components/Terminal.vue` (root element gets the classes and variables)
- Test: `tests/theme/themes.test.ts` (new), `tests/components/Terminal.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PaletteName = 'amber' | 'green' | 'light' | 'dark';
  export interface Palette { fg: string; fgBright: string; fgDim: string; glow: string; glowStrong: string; bg: string; border: string; input: string; location: string; event: string; decorative: string; system: string }
  export interface Effects { bloom: boolean; scanlines: boolean; flicker: boolean; vignette: boolean; noise: boolean; glitch: boolean; decay: boolean }
  export interface Theme { palette: PaletteName | Palette; effects: Effects }
  export type ThemeName = 'crt-amber' | 'crt-green' | 'simple' | 'simple-light' | 'simple-dark';
  export const PRESETS: Record<ThemeName, Theme>;
  export interface ThemeOverrides { bloom?: boolean; effects?: boolean }  // player's BLOOM / EFFECTS
  export function resolveTheme(
    base: ThemeName | Theme | string, custom: Record<string, Theme>, overrides: ThemeOverrides,
    env: { prefersDark: boolean; reducedMotion: boolean },
  ): { palette: Palette; effects: Effects; classes: string[]; vars: Record<string, string> };
  ```
  `simple` resolves to the `light` or `dark` palette by `env.prefersDark`; `reducedMotion` forces flicker, glitch and noise off; `overrides.effects === false` turns every effect off; `overrides.bloom` sets bloom; an unknown base name throws `UnknownTheme`.
  The `green`, `light` and `dark` palettes: choose readable values (green phosphor ~`#33ff66` family on near-black; light: near-black text on off-white; dark: light grey text on near-black, no glow) and record them in `PRESETS`; `amber` equals Task 3's defaults.

- [ ] **Step 1: Write the failing tests:** each preset resolves to its palette and effects; `crt-amber` resolves to exactly Task 3's defaults with no classes; `simple` flips with `prefersDark`; reduced motion turns off flicker/glitch/noise even for `crt-green`; `{ effects: false }` adds every `-off` class; `{ bloom: false }` adds only `bl-bloom-off`; a custom palette object resolves; `resolveTheme('purple', …)` throws `UnknownTheme`. Component test: mounting `Terminal` with `theme: 'simple-dark'` puts the `-off` classes and `--bl-bg` on the root; changing the theme updates them; two mounted terminals with different themes keep their own variables.
- [ ] **Step 2: Run** — `npx vitest run tests/theme tests/components/Terminal.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**; the effect-off classes disable the matching pseudo-elements, animations and `text-shadow`s; decay-off removes opacity steps.
- [ ] **Step 4: Run** the whole suite, lint, type-check. Expected: PASS; the default look unchanged (Task 3's check still passes).
- [ ] **Step 5: Commit** — `git commit -m "Themes: presets (crt-amber, crt-green, simple, simple-light, simple-dark), resolution and reduced motion"`.

### Task 5: Theme commands for players

**Files:**
- Modify: `src/stores/game.ts` (store commands THEME, BLOOM, EFFECTS; persisted choice), `src/engine/verbs/meta.ts` or wherever store-command help lines live (HELP lists them), `server/src/llm.ts` (`theme` in `ACTION_VOCAB`, target = preset name), `src/engine/parser.ts` only if store commands are recognised there
- Test: `tests/stores/game.test.ts`, `server/src/routes/parse-intent.test.ts`

**Interfaces:**
- Consumes: Task 4's `PRESETS`, `resolveTheme`, `ThemeOverrides`.
- Produces: store state `theme: { base: string; overrides: ThemeOverrides }`, persisted at `<storagePrefix>theme` as JSON `{ base, overrides }`; commands:
  - `THEME` → lists presets (built-in plus author's custom names) and the current one.
  - `THEME <name>` (case-insensitive; `SIMPLE LIGHT` = `simple-light`, `CRT GREEN`/`GREEN` = `crt-green`, `AMBER` = `crt-amber`) → switches; unknown → “There’s no theme called “purple”. Try: …” and nothing changes.
  - `BLOOM ON|OFF`, `EFFECTS ON|OFF` → set the override.
  All are store commands: no move, not saved in game saves, survive RESTART.

- [ ] **Step 1: Write the failing tests:** each command's exact reply and resulting store theme; persistence across a fresh store with the same prefix; `THEME PURPLE` lists choices and leaves the theme; a corrupt stored value (`'{not json'`) falls back to the author default; RESTART keeps the theme; HELP includes the commands; the server sanitizer accepts `{ action: 'theme', target: 'crt-green' }` and drops an unknown target.
- [ ] **Step 2: Run** — `npx vitest run tests/stores/game.test.ts` and `(cd server && npx vitest run)`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole suite and the server suite, lint, type-check. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Themes: THEME, BLOOM and EFFECTS commands, remembered per game"`.

### Task 6: The store factory and the mount API

**Files:**
- Modify: `src/stores/game.ts` (`createGameStore(options)` replaces the module singleton and its `@/app.config` / `@/cartridges` imports), `src/components/Terminal.vue`, `src/components/CrtBootSequence.vue`, `src/App.vue`, `src/main.ts`, `src/services/persistence.ts`, `src/services/analytics.ts` (stays app-side; the store calls an `onEvent` hook)
- Create: `src/components/BrassLantern.vue`, `src/mount.ts` (`mountGame`), `src/options.ts` (the options type and defaults)
- Test: `tests/stores/game.test.ts`, `tests/components/BrassLantern.test.ts` (new), `tests/app.config.test.ts`

**Interfaces:**
- Consumes: Task 1's options, Task 4/5's theme.
- Produces:
  ```ts
  // src/options.ts
  export interface GameOptions {
    cartridges: Cartridge[];
    terminalName?: string;            // default 'BRASS LANTERN'
    storagePrefix: string;
    intentEndpoint?: string | null;   // default null
    theme?: ThemeName | Theme;        // default 'crt-amber'
    themes?: Record<string, Theme>;
    analytics?: { onEvent(name: 'game_start' | 'game_completed' | 'session_resumed', params?: Record<string, unknown>): void };
    version?: string;                 // shown in the header (the app passes __APP_VERSION__)
  }
  // src/stores/game.ts
  export function createGameStore(options: GameOptions): /* a Pinia store definition with a unique id per options.storagePrefix */;
  // src/mount.ts
  export function mountGame(el: Element | string, options: GameOptions): { unmount(): void };
  ```
  `<BrassLantern :options="…" />` renders the boot sequence and terminal for one game. The site's `src/main.ts` becomes `mountGame('#app', { cartridges, terminalName: appName, storagePrefix, intentEndpoint: '/api/parse-intent', analytics, version })`, built from `src/app.config.ts`.

- [ ] **Step 1: Write the failing tests:** two `BrassLantern` instances on one page with different prefixes, themes and worlds: a SAVE in one doesn't appear in the other's save list, a THEME in one doesn't change the other, each boots its own world; `intentEndpoint: null` → an unparseable line gets the engine's literal reply and no fetch is attempted; an endpoint whose fetch rejects or exceeds 5s → the literal reply, no unhandled rejection; `analytics.onEvent` receives `game_start` and `game_completed`; the existing store/component tests pass through `createGameStore` with the site's options.
- [ ] **Step 2: Run** — `npx vitest run tests/stores tests/components`. Expected: FAIL.
- [ ] **Step 3: Implement**; no file outside `src/app.config.ts`, `src/main.ts` and `src/cartridges.ts` may import `@/app.config` afterwards.
- [ ] **Step 4: Run** the whole suite, lint, type-check, build; run the site (`npx vite preview`) and play a few commands. Expected: PASS, unchanged behaviour.
- [ ] **Step 5: Commit** — `git commit -m "Library: createGameStore, BrassLantern and mountGame; the site mounts itself through them"`.

### Task 7: The server's function API

**Files:**
- Modify: `server/src/llm.ts`, `server/src/routes/parse-intent.ts`, `server/src/rate-limit.ts`, `server/src/index.ts`, `server/src/config.ts`
- Create: `server/src/lib.ts` (package entry: `parseIntent`), `server/src/express.ts` (`intentRoute`)
- Test: `server/src/lib.test.ts` (new), existing server tests

**Interfaces:**
- Produces:
  ```ts
  // server/src/lib.ts
  export function parseIntent(input: string, context: IntentContext, options: { apiKey: string; models?: string[]; timeoutMs?: number; fetch?: typeof fetch }): Promise<ParsedAction>;
  // server/src/express.ts
  export function intentRoute(options: { apiKey: string; models?: string[]; timeoutMs?: number; rateLimitPerMinute?: number }): express.Router;
  ```
  `parseIntent` and `intentRoute` read no `process.env`; `server/src/index.ts` (the app's server) reads env via `config.ts` and calls `intentRoute`. An empty `apiKey` throws at construction (fail-fast).

- [ ] **Step 1: Write the failing tests:** `parseIntent` with a fake fetch returns the sanitized action and sends the key only in the `x-goog-api-key` header; it never touches `process.env` (stub `process.env` to a Proxy that throws on read during the call); `intentRoute({ apiKey: '' })` throws; the existing supertest route tests pass against `intentRoute` mounted on a fresh express app.
- [ ] **Step 2: Run** — `(cd server && npx vitest run)`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** server lint, `tsc --noEmit`, tests. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Library: the intent server as parseIntent and intentRoute, reading no environment"`.

### Task 8: The workspace split

A mechanical move; the suite must be green before and after, with no behaviour change.

**Files:**
- Create: `packages/engine/`, `packages/vue/`, `packages/server/`, `apps/site/`, each with `package.json`, `tsconfig.json`, `vitest.config.ts` (and `vite.config.ts` for vue/site); root `package.json` with `"workspaces": ["packages/*", "apps/*"]` and scripts that run each workspace; `scripts/codemod-imports.mjs`
- Move (`git mv`, preserving history):
  - `src/engine`, `src/types`, `src/zmachine` → `packages/engine/src/`; `src/worlds` → `packages/engine/src/worlds`
  - `src/stores`, `src/components`, `src/composables`, `src/theme`, `src/styles`, `src/services/persistence.ts`, `src/options.ts`, `src/mount.ts` → `packages/vue/src/`
  - `server/` → `packages/server/` (its own app entry `index.ts`, pm2/deploy bits stay in `apps/site/server/` or the app's own folder — decide by what `DEPLOY`/docs reference, and record it)
  - `src/main.ts`, `src/App.vue`, `src/app.config.ts`, `src/cartridges.ts`, `src/services/analytics.ts`, `src/services/consent.ts`, `src/services/cookies.ts`, `index.html`, `public/` → `apps/site/`
  - tests move with their code: `tests/engine`, `tests/worlds`, `tests/zmachine`, `tests/fixtures`, `tests/helpers` → `packages/engine/tests/`; `tests/stores`, `tests/components`, `tests/composables`, `tests/theme`, `tests/services/persistence*` → `packages/vue/tests/`; app tests → `apps/site/tests/`
- Modify: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `eslint.config.js`, `docs/.vitepress/config.*` (paths), `tsconfig*.json`

**Interfaces:**
- Produces: package names `@brass-lantern/engine` (entries `.`, `./zmachine`, `./worlds`), `@brass-lantern/vue` (entry `.`, plus `./style.css`), `@brass-lantern/server` (entries `.`, `./express`); the site imports only from these names. Inside a package, imports are relative (no `@/` alias), so emitted declaration files resolve for consumers.

- [ ] **Step 1: Record the baseline:** `ZORK_LONG=1 npx vitest run --exclude "tests/zz/**"` test count and pass state; server test count.
- [ ] **Step 2: Write `scripts/codemod-imports.mjs`:** for every `.ts`/`.vue` under the moved trees, rewrite `@/x/y` imports to a relative path from the file's new location when the target is in the same package, or to the package name (`@brass-lantern/engine`, `/zmachine`, `/worlds`, `@brass-lantern/vue`) when it crosses packages; rewrite test imports likewise; rewrite `vi.mock('@/…')` specifiers the same way. Print every rewrite it couldn't resolve and exit non-zero if any.
- [ ] **Step 3: Move and rewrite:** do the `git mv`s, run the codemod, add the workspace configs and each package's `index.ts` barrel (exporting what the spec lists: engine `createGame`, `auditWorld`, `execute`, `captureLine`, `initialState`, `openingLines`, `fallbackParse`, `splitCommands`, `evaluateCondition`, conversation helpers, `parseIntentRemote`, `buildContext`, `setScriptFreeze`, all types; zmachine `ZMachineSession`, `loadStory`, the shelf, `SaveStore`, `localStorageSaveStore`; worlds `zork1`, `tutorial`, the examples; vue `BrassLantern`, `mountGame`, `createGameStore`, `Terminal`, `CrtBootSequence`, `ConsentBanner`, `useTypewriter`, theme exports, `GameOptions`; server `parseIntent`; server/express `intentRoute`). `npm install` at the root to link workspaces.
- [ ] **Step 4: Run** every workspace's tests (`npm test --workspaces`, with `ZORK_LONG=1`), lint, type-check (`vue-tsc` for vue and site, `tsc` for engine and server), the site build and the docs build. Expected: the same test count passing as the baseline; site and docs build.
- [ ] **Step 5: Update CI and Pages** to run per workspace (lint, type-check, coverage per package, build, the dist key grep on the site build) and build the docs plus the demo from `apps/site`. Run `actionlint` if installed.
- [ ] **Step 6: Commit** — `git commit -m "Library: npm workspaces: packages/engine, packages/vue, packages/server, apps/site"`.

### Task 9: Package builds, boundaries and a consumer smoke test

**Files:**
- Modify: each package's `package.json` (`name`, `version` placeholder until Task 10, `type: module`, `exports` with `types`/`import` conditions, `files`, `sideEffects` (`["*.css"]` for vue), `peerDependencies` (vue: `vue`, `pinia`; engine: `ifvms` optional via `peerDependenciesMeta`; server/express: `express`), `publishConfig: { access: 'public', provenance: true }`), build scripts (engine and server: `tsc -p tsconfig.build.json`; vue: `vite build` in library mode with `vue` and `pinia` external plus `vue-tsc --declaration --emitDeclarationOnly`)
- Modify: `eslint.config.js` (for `packages/engine/**`: `no-restricted-imports` for `vue`, `pinia`, `@brass-lantern/vue`, `@brass-lantern/server`, and `no-restricted-globals` for `window`, `document`, `localStorage`, `sessionStorage`, except `src/zmachine/save-store.ts` and `src/zmachine/vendor/**`, `src/zmachine/glkote.ts` if it needs `document` — then that file moves behind the `./zmachine` entry only, which is already the case)
- Create: `scripts/consumer-smoke.mjs` (packs each package with `npm pack`, installs the tarballs into a temp project, and runs checks), `packages/engine/src/zmachine/require-ifvms.ts` (a clear error when the peer is missing)
- Test: `packages/engine/tests/boundary.test.ts`, `scripts/consumer-smoke.mjs` run in CI

**Interfaces:**
- Produces: built `dist/` per package; `npm run smoke` at the root.

- [ ] **Step 1: Write the failing checks:** `boundary.test.ts` greps `packages/engine/src` (outside the allowed files) for `from 'vue'`, `from 'pinia'`, `document.`, `window.`, `localStorage` and fails on any hit; `consumer-smoke.mjs` (Node, no DOM) does `import { createGame, auditWorld } from '@brass-lantern/engine'` and `import { tutorial } from '@brass-lantern/engine/worlds'`, plays the tutorial's winning commands to `gameOver`, checks `auditWorld(tutorial)` is `[]`, checks `import('@brass-lantern/engine/zmachine')` without `ifvms` installed rejects with an error whose message names `ifvms`, type-checks a tiny `consumer.ts` against the installed `.d.ts` with `tsc --noEmit`, and `import('@brass-lantern/server')` exposes `parseIntent`; `npm pack --dry-run` for each package lists no `tests/`, no source maps of tests, and includes `dist/` and the CSS.
- [ ] **Step 2: Run** — `npx vitest run packages/engine/tests/boundary.test.ts` and `node scripts/consumer-smoke.mjs`. Expected: FAIL (no builds/exports yet).
- [ ] **Step 3: Implement** the builds, exports and the ifvms guard.
- [ ] **Step 4: Run** the checks, every workspace's tests, lint (the new restricted rules pass), type-check. Expected: PASS. Add `npm run smoke` to CI.
- [ ] **Step 5: Commit** — `git commit -m "Library: package builds, exports, engine boundary checks and a consumer smoke test"`.

### Task 10: Release workflow, docs and 2.0.0

**Files:**
- Create: `.github/workflows/release.yml` (on a `v*` tag on `main`: `npm ci`, the CI checks, the smoke test, then `npm publish --workspaces --provenance --access public` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`; `permissions: id-token: write, contents: read`; it checks the tag equals every package's version), `docs/guide/using-the-library.md`, `packages/*/README.md`
- Modify: `docs/.vitepress/config.*` (sidebar), `docs/guide/getting-started.md`, `docs/guide/how-it-works.md`, `docs/guide/intent-server.md`, `docs/guide/deploying.md`, `README.md`, `CHANGELOG.md` (2.0.0), every `package.json` version → `2.0.0` (root, packages, site), `CLAUDE.md` (the Layout and Stack sections now describe the workspaces), `CONTRIBUTING.md` if it describes the layout, `scripts/public-paths.txt` (a header comment: frozen at 1.13.0; Office Space moves to the packages in its own track)

- [ ] **Step 1:** Write the guide: install (`npm i @brass-lantern/engine @brass-lantern/vue vue pinia`), mount (`mountGame` and `<BrassLantern>` with every `GameOptions` field), themes (presets, custom palettes, the player commands, reduced motion), headless use (`createGame` in Node, a CLI example), the intent server (`intentRoute` in an Express app, the key server-side only, `intentEndpoint`), writing a world and `auditWorld`, Z-machine cartridges and the `ifvms` peer. Package READMEs point to it.
- [ ] **Step 2:** CHANGELOG 2.0.0: the three packages, themes and commands, the mount API, what moved, that the world format is 1.13.0's, and that the first npm publish follows separately.
- [ ] **Step 3:** Versions to 2.0.0 (lockfile updated with `npm install --package-lock-only`); `actionlint` on the release workflow; the docs build.
- [ ] **Step 4:** Run everything: all workspaces' tests with `ZORK_LONG=1`, coverage per package, lint, type-check, builds, smoke test, docs build. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Library: release workflow, guide and 2.0.0"`. Do not push or tag: the first publish is a separate step with the owner's go-ahead (create the npm organization, add `NPM_TOKEN`, then tag).
