# The npm library: engine, Vue terminal, intent server, and themes

**Status:** approved in conversation 2026-10-07; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** 1.13.0 (engine parity through stage 6a). The world format published here is 1.13.0's.

## Decisions made while brainstorming

- **Three packages** (owner's choice), all public under the `@brass-lantern` npm scope (owner's choice; the scope is free, the organization is created at first publish):
  - `@brass-lantern/engine`: framework-free; runs in Node or a browser.
  - `@brass-lantern/vue`: the CRT terminal, its store and the themes; Vue and Pinia are peer dependencies.
  - `@brass-lantern/server`: the optional intent handler (owner's choice: a third, optional package).
- **One repo, npm workspaces** (owner's choice of approach A): `packages/engine`, `packages/vue`, `packages/server`; the brass-lantern site and the VitePress docs become apps that consume them through workspace links. The compiler, a lint rule and a Node-only test run enforce the boundaries.
- **Themes are designed into the Vue package before the first publish** (owner's question: theming first or library first; answer: design together, build the split first and themes before publishing, so the UI's options aren't a breaking change later).
- **Theme control** (owner's choice): the author sets a default; players switch in play with THEME commands, remembered per game.
- **Presets:** `crt-amber` (default, today's look), `crt-green`, `simple` (follows the system light/dark setting), `simple-light`, `simple-dark` (owner added the light/dark pair).
- **Office Space moves onto the published packages in the next track**, the world upgrades the owner planned as the library's test bed. Not in this stage.

## Invariants

- Behaviour doesn't change. The brass-lantern site and Office Space look and play exactly as at 1.13.0; Zork I still matches zork1.z3; every slice still matches its story file.
- The engine package imports no `vue`, `pinia`, `document`, `window` or `localStorage`, and nothing from the apps.
- The Gemini key never reaches a browser: the server package takes it as a parameter and never reads `VITE_*` or any env var itself.
- The engine's own invariants stand (no world-ID branching; misses never mutate; conditions only in conditions.ts; fuzzy only in fuzzy.ts; seeded randomness only; saves format 2.0).
- Curly quotes in player-facing text. The CRT aesthetic is the default product; `crt-amber` is pixel-for-pixel today's look. Coverage thresholds stay (80% lines, functions, statements; 75% branches) per package.

## 1. Package boundaries

### `@brass-lantern/engine`

- **Contents:** `src/engine/`, `src/types/`, parser, fuzzy matching, conditions, the intent client (endpoint passed in), and the world audit (today `tests/helpers/audit.ts`), exported as `auditWorld(world): string[]` so authors can lint their worlds.
- **Main entry:**
  ```ts
  createGame(world: World, options?: { seed?: number }): { state: GameState; opening: string[]; send(line: string): EngineReply }
  ```
  A headless turn loop with compound-line splitting, pronouns, AGAIN and questions (what `tests/worlds/zsession.ts`'s `openNative`/`nativeTurn` does today), without the LLM fallback. Lower-level exports (`execute`, `captureLine`, `initialState`, `openingLines`, `fallbackParse`, `splitCommands`, `evaluateCondition`, the conversation helpers, types) stay available for UIs that need them.
- **Subpaths:**
  - `@brass-lantern/engine/zmachine`: the Infocom story-file runtime (`ZMachineSession`, `storyfile`, the shelf); `ifvms` becomes an optional peer dependency. Its save storage becomes an interface (`SaveStore`: `list`, `read`, `write`, `remove`) with a `localStorageSaveStore(prefix)` shipped for browsers.
  - `@brass-lantern/engine/worlds`: Zork I, the tutorial and the examples, so the core doesn't carry them.
- **The four crossings found in the audit become options:** the storage prefix (`types/game.ts` imports it from the app config today), the scripts' development freeze (`import.meta.env.DEV` today; a `freezeScripts` option, default off), the intent endpoint (`/api/parse-intent` hard-coded today), and Z-machine storage (`localStorage` today).

### `@brass-lantern/vue`

- **Contents:** `Terminal`, `CrtBootSequence`, `ConsentBanner`, `useTypewriter`, the game store as a factory (`createGameStore(options)`, so two games can share a page), persistence, the themes and the CSS.
- **Main entry:** a `<BrassLantern>` component and a `mountGame(el, options)` helper. Options:
  ```ts
  {
    cartridges: Cartridge[];            // one or more worlds or story files (today's src/cartridges.ts shape)
    terminalName?: string;
    storagePrefix: string;
    intentEndpoint?: string | null;     // null: misses get the engine's reply only
    theme?: ThemeName | Theme;          // default 'crt-amber'
    themes?: Record<string, Theme>;     // extra named presets
    analytics?: { onEvent(name: string, params?: Record<string, unknown>): void };  // the app's consent-gated sender
  }
  ```
- Analytics and consent stay the app's: the package calls `onEvent` for `game_start`, `game_completed` and `session_resumed` and ships `ConsentBanner` as an optional component; the GA4 sender stays in the apps.

### `@brass-lantern/server`

- **Contents:** `parseIntent(input, context, { apiKey, models?, timeoutMs? })` (the Gemini REST client, model chain and sanitizer from `server/src/llm.ts`), an Express middleware factory `intentRoute({ apiKey, ... })` with the input caps, and the rate limiter. Express is a peer dependency of the middleware only (subpath `@brass-lantern/server/express`).
- pm2, Apache, systemd and deploy scripts stay app-specific.

### Apps in the repo

- `apps/site`: the brass-lantern demo (its cartridges, app config, GA4 sender), consuming the packages through workspace links.
- `docs/`: the VitePress site, which becomes the packages' documentation.

## 2. Themes

### Semantic variables

The palette moves from `--crt-amber*` names to roles: `--bl-fg`, `--bl-fg-bright`, `--bl-fg-dim`, `--bl-glow`, `--bl-glow-strong`, `--bl-bg`, `--bl-border`, and a colour per line type (`--bl-input`, `--bl-location`, `--bl-event`, `--bl-decorative`, `--bl-system`). Every hard-coded `rgba()` glow in `crt.css` becomes `color-mix()` from those. Typewriter speeds, decay and timing variables keep their roles under the `--bl-` prefix.

### The theme object

```ts
type Palette = { fg; fgBright; fgDim; glow; glowStrong; bg; border; input; location; event; decorative; system };  // CSS colours
type Theme = {
  palette: 'amber' | 'green' | 'light' | 'dark' | Palette;
  effects: { bloom: boolean; scanlines: boolean; flicker: boolean; vignette: boolean; noise: boolean; glitch: boolean; decay: boolean };
};
```

### Presets

| Preset | Palette | Effects |
|---|---|---|
| `crt-amber` (default) | today's amber | all on (today's look exactly) |
| `crt-green` | green phosphor | all on |
| `simple` | `light` or `dark` by `prefers-color-scheme`, switching live | all off |
| `simple-light` | dark text on light | all off |
| `simple-dark` | light text on dark | all off |

### Applying a theme

- The palette is CSS variables on the terminal's root element; effects are classes there (`bl-bloom-off`, `bl-scanlines-off`, …). Two terminals on one page are independent. Pure CSS, no canvas.
- `prefers-reduced-motion: reduce` turns flicker, glitch and noise off whatever the theme says.
- The typewriter isn't part of a theme (it's the product; the boot sequence and restored sessions already handle it).

### Player control

Store commands, like SAVE and RESTORE (the engine stays out of it):

- `THEME`: lists the presets (built-in and the author's) and the current one.
- `THEME <name>` (`THEME GREEN`, `THEME AMBER`, `THEME SIMPLE`, `THEME SIMPLE LIGHT`, `THEME SIMPLE DARK`, or an author preset): switches.
- `BLOOM ON|OFF`, `EFFECTS ON|OFF`: override on top of the preset.

The choice is stored in `localStorage` under the game's storage prefix (`<prefix>theme`), separate from saves, and survives RESTART. HELP lists the commands. The intent server learns `theme` (target: the preset name) so “make it green” works.

## 3. Publishing and Office Space

- **Version:** the three packages share one version line starting at **2.0.0** (the repo split and mount API are breaking for anyone copying files; the world format is 1.13.0's).
- **Release:** a `v*` tag runs CI and publishes all three packages from GitHub Actions with an npm automation token (repo secret `NPM_TOKEN`) and npm provenance. Before the first publish the owner creates the free `brass-lantern` npm organization and the token.
- **This stage builds, tests and moves the brass-lantern site onto the packages. The first publish is a separate step with the owner's go-ahead.**
- **Office Space** moves in the next track: it installs the packages; `scripts/public-paths.txt`, `sync-from-public.sh`, `sync-to-public.sh` and the duplicated engine files go; its deploy, server and tests stay its own; the first proof is that its 100-point run and visible-change probe don't change.
- **Docs:** a “Using the library” guide (install, mount, themes, the intent server, writing a world, the audit); package READMEs; the CHANGELOG 2.0.0 entry.

## Testing

- Each package carries its own tests (today's tests move with their code): the engine's unit tests, Zork I's differentials and the Zork II/III slices; the Vue package's store and component tests; the server's route and LLM tests.
- **Boundary checks:** an ESLint `no-restricted-imports`/`no-restricted-globals` rule on `packages/engine`, and the engine's test suite runs in the Node environment only.
- **Consumer checks:** a smoke test that builds each package and imports it from a scratch project (ESM, types resolve, no missing files in the tarball via `npm pack --dry-run`).
- **Themes:** theme resolution (preset, player overrides, reduced motion, system light/dark), component tests that the root classes and variables change, store tests for the commands and persistence, and a check that `crt-amber`'s variables equal today's values.
- **Nothing changes:** the site's existing store and component tests pass unchanged through the packages.

## Edge cases the review checks

- Two `<BrassLantern>` games on one page: separate stores, storage, themes.
- `intentEndpoint: null`, an endpoint that fails or times out (5s), and a server without a key (fail-fast).
- A theme preset name that doesn't exist (THEME PURPLE): listed choices, nothing changes; a corrupt stored theme: falls back to the author default.
- `simple` while the system setting changes mid-session.
- A Z-machine cartridge without `ifvms` installed: a clear error naming the missing peer.
- The engine imported in Node with no DOM.

## Out of scope

- Office Space's move onto the packages and its world upgrades (next track).
- A framework-free (Web Component) terminal; React or other bindings.
- Zork II (6b) and Zork III (6c) native.
- New engine features; the backlog stays as is.
