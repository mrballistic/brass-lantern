# Brass Lantern 2.3.0 MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@brass-lantern/mcp`, a local stdio MCP server with three tools (`audit_world`, `play`, `docs`), so a coding agent can write a Brass Lantern world and check it itself, released with the other packages as 2.3.0.

**Architecture:** A new workspace package `packages/mcp`. `load.ts` imports the agent’s world module fresh with jiti; `engine.ts` picks the engine the world’s own project resolves (else the bundled one); `tools.ts` turns audit and play runs into plain-text reports; `docs.ts` serves the per-page markdown that the docs’ llms generator also writes, bundled into `dist/docs` at build; `server.ts` registers the tools on an `McpServer`; `cli.ts` connects it to stdio. Tools take the engine and docs directory as parameters, so tests run against the engine’s source and a freshly generated docs bundle.

**Tech Stack:** TypeScript 6 (NodeNext, ESM), Node 24, `@modelcontextprotocol/sdk` 1.32.1 (`McpServer.registerTool`, zod input shapes, `StdioServerTransport`; tests use `InMemoryTransport.createLinkedPair()` and `Client`), `zod` 4, `jiti` 2.7 (`createJiti(import.meta.url, { moduleCache: false, fsCache: false }).import(file)`), Vitest 5, tsx (build script).

**Spec:** `docs/superpowers/specs/2026-10-12-mcp-server-design.md`

## Global Constraints

- Repo `~/current_work/brass-lantern`, branch `mcp-server` (already holds the spec). The engine, vue and server packages change only where a task says so.
- Local and stdio only: no network listener, no remote transport, no telemetry. The server never writes to stdout except through the MCP transport (log with `console.error` if ever needed).
- Lockstep versions: every `package.json` in the repo (root, `packages/*`, `apps/*`) is 2.3.0 by the end. Until the release task, the new package is 2.2.1 (the workspace’s current version) and depends on `@brass-lantern/engine` `^2.2.0` so workspace linking works.
- Errors are results, not crashes: a bad path, a syntax error, a throwing module or a throwing engine call comes back as an `isError: true` text result. The server keeps running.
- Engine tools report the engine version they used and whether it was the project’s or the bundled one.
- `play`: default seed 1, at most 500 commands per call, output trimmed past 2,000 lines with a note.
- Text agents read uses smart punctuation (“ ” ’) and American spelling; code comments may use anything. Never read or print `.env` files.
- Coverage thresholds (from `vite.shared.ts`): 80 lines/functions/statements, 75 branches. `src/cli.ts` (stdio wiring only) is excluded from coverage like `packages/server/src/index.ts`.
- Each task ends with a commit whose message ends with a `Co-Authored-By:` trailer naming the model that wrote it, `<noreply@anthropic.com>`. Publishing, tagging and merging are the owner’s.

## Review Focus

1. **A world that imports from its own project**: a sibling helper file (an edit to the helper is seen on the next call; test in Task 1), or a value from `@brass-lantern/engine` itself, resolved through the project’s `node_modules`. In the repo that would resolve to an unbuilt `dist`, so the smoke test covers it against real tarballs (Task 6).
2. **Answers to the game’s own questions inside `play`** (“both”, “rusty”) after “Which do you mean?”. They are not reported as “not understood by the parser”. Test in Task 3.
3. **A world whose script throws during play or audit.** The tool returns an error result naming the problem, and the next tool call still works. Test in Task 5.
4. **A relative `path` when the client launched the server somewhere else.** Paths resolve against the server’s working directory, and the error says where it looked. Test in Task 1.
5. **A `docs` page name typed loosely** (`/reference/world-schema`, `reference/world-schema.md`, `guide/building-worlds/`). Each finds the page; an unknown one lists the valid names. Test in Task 4.

---

### Task 1: The package and world loading

**Files:**
- Create: `packages/mcp/package.json`, `packages/mcp/tsconfig.json`, `packages/mcp/tsconfig.build.json`, `packages/mcp/eslint.config.js`, `packages/mcp/vitest.config.ts`, `packages/mcp/LICENSE` (copy of `packages/server/LICENSE`)
- Create: `packages/mcp/src/load.ts`
- Create: `packages/mcp/tests/load.test.ts`, `packages/mcp/tests/fixtures/` (world files below)
- Modify: root `package.json` (`build:packages` builds mcp right after the engine), `.github/workflows/ci.yml` (add `"@brass-lantern/mcp"` to the workspace matrix)

**Interfaces:**
- Produces:
  ```ts
  export const WORLD_EXTENSIONS: readonly string[]; // ['.ts', '.mts', '.js', '.mjs']
  export class WorldLoadError extends Error {}
  export function isWorldShaped(value: unknown): value is World;
  export interface LoadedWorld { world: World; file: string; exportName: string }
  export function loadWorld(path: string, exportName: string | undefined, cwd: string): Promise<LoadedWorld>;
  ```

- [ ] **Step 1: Scaffold the package.** `packages/mcp/package.json`:

```json
{
  "name": "@brass-lantern/mcp",
  "version": "2.2.1",
  "author": "Todd Greco <mrballistic@gmail.com>",
  "description": "A Model Context Protocol server for brass-lantern: lets a coding agent audit, play and read the docs for the text-adventure world it is writing.",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/mrballistic/brass-lantern.git", "directory": "packages/mcp" },
  "homepage": "https://mrballistic.github.io/brass-lantern/",
  "bugs": "https://github.com/mrballistic/brass-lantern/issues",
  "keywords": ["text-adventure", "interactive-fiction", "mcp", "model-context-protocol", "coding-agent"],
  "type": "module",
  "sideEffects": false,
  "bin": { "brass-lantern-mcp": "./dist/cli.js" },
  "exports": {
    ".": { "@brass-lantern/source": "./src/server.ts", "types": "./dist/server.d.ts", "default": "./dist/server.js" },
    "./package.json": "./package.json"
  },
  "types": "./dist/server.d.ts",
  "files": ["dist", "!dist/**/*.map", "README.md", "LICENSE"],
  "scripts": {
    "prebuild": "node -e \"fs.rmSync('dist', { recursive: true, force: true })\"",
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit",
    "lint": "eslint .",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@brass-lantern/engine": "^2.2.0",
    "@modelcontextprotocol/sdk": "^1.32.1",
    "jiti": "^2.7.0",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.12.0",
    "eslint": "^10.12.0",
    "globals": "^17.0.0",
    "tsx": "^4.23.15",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.71.0",
    "vitest": "^5.0.3"
  },
  "publishConfig": { "access": "public", "provenance": true },
  "engines": { "node": ">=24" }
}
```

`tsconfig.json` is `packages/server/tsconfig.json` with `rootDir` and `outDir` removed (type-check only: `scripts/bundle-docs.ts` imports the shared generator from outside the package, which a `rootDir` would reject), `"include": ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"]`, and `"customConditions": ["@brass-lantern/source"]` added to `compilerOptions` (TypeScript then reads the engine’s types from source, as `tsconfig.base.json` does elsewhere; check `tsconfig.base.json` and extend it if the other packages do). `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "declaration": true, "rootDir": "src", "outDir": "dist", "customConditions": [] },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "tests", "scripts"]
}
```

`eslint.config.js`: copy `packages/server/eslint.config.js`, adding `'tests/fixtures/**'` to `ignores`. `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { coverageThresholds, resolveSources } from '../../vite.shared.ts';

export default defineConfig({
  // The engine from its source, not dist/ (see vite.shared.ts).
  ...resolveSources,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // cli.ts only connects the server to stdio; the smoke test runs it.
      exclude: ['src/cli.ts'],
      thresholds: coverageThresholds,
    },
  },
});
```

Then `npm install` at the repo root (links the workspace; prefix `NPM_CONFIG_USERCONFIG=/dev/null` if the user’s `~/.npmrc` `allow-scripts` setting breaks it). Root `package.json` `build:packages` becomes `npm run build -w @brass-lantern/engine && npm run build -w @brass-lantern/mcp && npm run build -w @brass-lantern/server && npm run build -w @brass-lantern/vue`. Add `- "@brass-lantern/mcp"` after `"@brass-lantern/server"` in `.github/workflows/ci.yml`’s workspace matrix.

- [ ] **Step 2: Fixtures.** `packages/mcp/tests/fixtures/`:
  - `two-worlds.ts`: two named world exports, `a` and `b`, each `{ startRoom: 'hall', rooms: { hall: { name: 'Hall', description: 'A hall.', exits: {}, items: [], npcs: [], onEnter: [] } }, items: {}, npcs: {}, events: {}, dialogue: {}, flagLabels: {} }` (typed `World` via `import type { World } from '@brass-lantern/engine'`).
  - `default-world.ts`: the same world as the default export, plus `export const notAWorld = 3`.
  - `no-world.ts`: `export const x = 1;`
  - `broken.ts`: `export const = ;` (a syntax error).
  - `uses-helper.ts`: `import { HALL } from './helper.ts'; export default { …the hall world, rooms: { hall: HALL } }`, and `helper.ts` exporting `HALL` (the hall room).

- [ ] **Step 3: Write the failing tests** (`packages/mcp/tests/load.test.ts`):

```ts
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isWorldShaped, loadWorld, WorldLoadError } from '../src/load.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

describe('loadWorld', () => {
  it('takes the default export when it is a world', async () => {
    const loaded = await loadWorld('default-world.ts', undefined, FIXTURES);
    expect(loaded.exportName).toBe('default');
    expect(loaded.world.startRoom).toBe('hall');
    expect(loaded.file).toBe(join(FIXTURES, 'default-world.ts'));
  });
  it('takes a named export when asked', async () => {
    expect((await loadWorld('two-worlds.ts', 'b', FIXTURES)).exportName).toBe('b');
  });
  it('several worlds and no name: an error naming them', async () => {
    await expect(loadWorld('two-worlds.ts', undefined, FIXTURES)).rejects.toThrow(/several worlds \(a, b\)/);
  });
  it('an export that is not a world, or missing, is an error', async () => {
    await expect(loadWorld('default-world.ts', 'notAWorld', FIXTURES)).rejects.toThrow(/isn’t a world/);
    await expect(loadWorld('default-world.ts', 'nope', FIXTURES)).rejects.toThrow(/no export “nope”/);
  });
  it('no world at all is an error listing the exports', async () => {
    await expect(loadWorld('no-world.ts', undefined, FIXTURES)).rejects.toThrow(/no world-shaped export \(exports: x\)/);
  });
  it('a syntax error comes back as a WorldLoadError naming the file', async () => {
    const error = await loadWorld('broken.ts', undefined, FIXTURES).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorldLoadError);
    expect(String((error as Error).message)).toMatch(/^broken\.ts: /);
  });
  it('a missing file says where it looked; a non-module extension is refused', async () => {
    await expect(loadWorld('missing.ts', undefined, FIXTURES)).rejects.toThrow(`missing.ts: no such file (looked in ${FIXTURES})`);
    await expect(loadWorld('world.json', undefined, FIXTURES)).rejects.toThrow(/\.ts, \.mts, \.js or \.mjs/);
  });
  it('sees an edit, in the world or a file it imports, on the next call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bl-mcp-'));
    cpSync(join(FIXTURES, 'uses-helper.ts'), join(dir, 'uses-helper.ts'));
    cpSync(join(FIXTURES, 'helper.ts'), join(dir, 'helper.ts'));
    expect((await loadWorld('uses-helper.ts', undefined, dir)).world.rooms.hall.name).toBe('Hall');
    writeFileSync(
      join(dir, 'helper.ts'),
      "export const HALL = { name: 'Great Hall', description: 'A hall.', exits: {}, items: [], npcs: [], onEnter: [] };\n",
    );
    expect((await loadWorld('uses-helper.ts', undefined, dir)).world.rooms.hall.name).toBe('Great Hall');
  });
  it('loads a real world that imports from the engine (the tutorial source)', async () => {
    const tutorial = resolve(import.meta.dirname, '../../engine/src/worlds/tutorial.ts');
    expect((await loadWorld(tutorial, 'tutorial', FIXTURES)).world.startRoom).toBe('cubicle');
  });
  it('isWorldShaped needs rooms, items, npcs and startRoom', () => {
    expect(isWorldShaped({ rooms: {}, items: {}, npcs: {}, startRoom: 'x' })).toBe(true);
    expect(isWorldShaped({ rooms: {}, items: {}, startRoom: 'x' })).toBe(false);
    expect(isWorldShaped(null)).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify they fail.** `npx vitest run packages/mcp/tests/load.test.ts` (from the repo root). Expected: FAIL, cannot find `../src/load.ts`.

- [ ] **Step 5: Implement** `packages/mcp/src/load.ts`:

```ts
import { existsSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import type { World } from '@brass-lantern/engine';
import { createJiti } from 'jiti';

/** The module kinds a world can be written as. */
export const WORLD_EXTENSIONS: readonly string[] = ['.ts', '.mts', '.js', '.mjs'];

/** A world file that couldn't be loaded: its message is the tool’s reply. */
export class WorldLoadError extends Error {}

/** A world is an object with rooms, items, characters and a starting room. */
export function isWorldShaped(value: unknown): value is World {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return ['rooms', 'items', 'npcs'].every((key) => typeof v[key] === 'object' && v[key] !== null) && typeof v.startRoom === 'string';
}

export interface LoadedWorld {
  world: World;
  /** The absolute path loaded. */
  file: string;
  /** The export the world came from ('default' for a default export). */
  exportName: string;
}

/**
 * Loads a world module fresh (no module or transpile cache, so an edit is seen on the next call),
 * resolving `path` against `cwd`. The export is the one named, else a world default export, else
 * the only world-shaped named export. Every failure is a WorldLoadError whose message starts with
 * the path as given.
 */
export async function loadWorld(path: string, exportName: string | undefined, cwd: string): Promise<LoadedWorld> {
  const file = isAbsolute(path) ? path : resolve(cwd, path);
  if (!WORLD_EXTENSIONS.includes(extname(file))) throw new WorldLoadError(`${path}: a world is a .ts, .mts, .js or .mjs module`);
  if (!existsSync(file)) throw new WorldLoadError(`${path}: no such file (looked in ${cwd})`);
  let mod: Record<string, unknown>;
  try {
    mod = await createJiti(import.meta.url, { moduleCache: false, fsCache: false }).import<Record<string, unknown>>(file);
  } catch (error) {
    throw new WorldLoadError(`${path}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
  const exportsList = () => Object.keys(mod).join(', ') || 'none';
  if (exportName !== undefined) {
    if (!(exportName in mod)) throw new WorldLoadError(`${path}: no export “${exportName}” (exports: ${exportsList()})`);
    const value = mod[exportName];
    if (!isWorldShaped(value)) throw new WorldLoadError(`${path}: export “${exportName}” isn’t a world (a world has rooms, items, npcs and startRoom)`);
    return { world: value, file, exportName };
  }
  if (isWorldShaped(mod.default)) return { world: mod.default, file, exportName: 'default' };
  const candidates = Object.keys(mod).filter((key) => key !== 'default' && isWorldShaped(mod[key]));
  if (candidates.length === 1) return { world: mod[candidates[0]] as World, file, exportName: candidates[0] };
  if (candidates.length === 0) throw new WorldLoadError(`${path}: no world-shaped export (exports: ${exportsList()})`);
  throw new WorldLoadError(`${path}: several worlds (${candidates.join(', ')}); name one with “export”`);
}
```

- [ ] **Step 6: Run the tests, lint, type-check.** `npx vitest run packages/mcp/tests/load.test.ts` → PASS; `npm run lint -w @brass-lantern/mcp && npm run type-check -w @brass-lantern/mcp` → clean. If `createJiti(...).import` has no type parameter in jiti 2.7, cast the result instead.

- [ ] **Step 7: Commit.**

```bash
git add packages/mcp package.json package-lock.json .github/workflows/ci.yml
git commit -m "MCP: the @brass-lantern/mcp package and world loading (jiti, fresh each call)"
```

---

### Task 2: Which engine

**Files:**
- Create: `packages/mcp/src/engine.ts`
- Test: `packages/mcp/tests/engine.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  export type Engine = Pick<typeof import('@brass-lantern/engine'), 'createGame' | 'auditWorld' | 'ENGINE_VERSION'> &
    Partial<Pick<typeof import('@brass-lantern/engine'), 'fallbackParse' | 'splitCommands' | 'andNames'>>;
  export interface ResolvedEngine { engine: Engine; version: string; source: 'project' | 'bundled'; note?: string }
  export function resolveEngine(worldFile: string, bundled: Engine): Promise<ResolvedEngine>;
  ```

- [ ] **Step 1: Write the failing tests** (`packages/mcp/tests/engine.test.ts`):

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { describe, expect, it } from 'vitest';
import { resolveEngine } from '../src/engine.ts';

/** A scratch project with a world file and, optionally, its own engine package. */
function project(engineSource?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bl-mcp-engine-'));
  writeFileSync(join(dir, 'world.ts'), 'export default {};\n');
  if (engineSource !== undefined) {
    const pkg = join(dir, 'node_modules', '@brass-lantern', 'engine');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({ name: '@brass-lantern/engine', version: '9.9.9', type: 'module', exports: { '.': './index.js', './package.json': './package.json' } }),
    );
    writeFileSync(join(pkg, 'index.js'), engineSource);
  }
  return join(dir, 'world.ts');
}

describe('resolveEngine', () => {
  it('uses the project’s own engine when it has one', async () => {
    const r = await resolveEngine(project("export const ENGINE_VERSION = '9.9.9'; export function createGame() {} export function auditWorld() { return ['fake']; }"), bundled);
    expect(r.source).toBe('project');
    expect(r.version).toBe('9.9.9');
    expect(r.engine.auditWorld({} as never)).toEqual(['fake']);
  });
  it('falls back to the bundled engine when the project has none', async () => {
    const r = await resolveEngine(project(), bundled);
    expect(r).toMatchObject({ source: 'bundled', version: bundled.ENGINE_VERSION });
    expect(r.note).toBeUndefined();
  });
  it('falls back, with a note, when the project’s engine throws on import', async () => {
    const r = await resolveEngine(project("throw new Error('boom');"), bundled);
    expect(r.source).toBe('bundled');
    expect(r.note).toMatch(/couldn’t load the project’s @brass-lantern\/engine \(boom\)/);
  });
  it('falls back, with a note, when it lacks createGame or auditWorld', async () => {
    const r = await resolveEngine(project("export const ENGINE_VERSION = '0.1.0';"), bundled);
    expect(r.source).toBe('bundled');
    expect(r.note).toMatch(/doesn’t export createGame and auditWorld/);
  });
});
```

- [ ] **Step 2: Run to verify they fail.** `npx vitest run packages/mcp/tests/engine.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `packages/mcp/src/engine.ts`:

```ts
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type * as EngineModule from '@brass-lantern/engine';

/** What the tools use of an engine. The parser helpers are optional: older engines may lack them. */
export type Engine = Pick<typeof EngineModule, 'createGame' | 'auditWorld' | 'ENGINE_VERSION'> &
  Partial<Pick<typeof EngineModule, 'fallbackParse' | 'splitCommands' | 'andNames'>>;

export interface ResolvedEngine {
  engine: Engine;
  version: string;
  source: 'project' | 'bundled';
  /** Why the project’s engine wasn’t used, when it was found but couldn’t be. */
  note?: string;
}

/**
 * The engine the world’s own project resolves (so a 2.2 project is audited by 2.2’s rules),
 * else `bundled`. A project engine that can’t be imported, or lacks the API, falls back with a note.
 */
export async function resolveEngine(worldFile: string, bundled: Engine): Promise<ResolvedEngine> {
  const fallback = (note?: string): ResolvedEngine => ({ engine: bundled, version: bundled.ENGINE_VERSION, source: 'bundled', ...(note ? { note } : {}) });
  let entry: string;
  try {
    entry = createRequire(worldFile).resolve('@brass-lantern/engine');
  } catch {
    return fallback();
  }
  try {
    const mod = (await import(pathToFileURL(entry).href)) as Partial<Engine>;
    if (typeof mod.createGame !== 'function' || typeof mod.auditWorld !== 'function') {
      return fallback(`the project’s @brass-lantern/engine doesn’t export createGame and auditWorld; used the bundled engine`);
    }
    return { engine: mod as Engine, version: typeof mod.ENGINE_VERSION === 'string' ? mod.ENGINE_VERSION : 'unknown', source: 'project' };
  } catch (error) {
    return fallback(`couldn’t load the project’s @brass-lantern/engine (${error instanceof Error ? error.message : String(error)}); used the bundled engine`);
  }
}
```

- [ ] **Step 4: Run the tests, lint, type-check** → PASS, clean.
- [ ] **Step 5: Commit.** `git add packages/mcp && git commit -m "MCP: use the world’s project’s engine, else the bundled one"`

---

### Task 3: The audit and play reports

**Files:**
- Create: `packages/mcp/src/tools.ts`
- Test: `packages/mcp/tests/tools.test.ts`

**Interfaces:**
- Consumes: `LoadedWorld` (Task 1), `ResolvedEngine`/`Engine` (Task 2).
- Produces:
  ```ts
  export const MAX_COMMANDS = 500;
  export const MAX_LINES = 2000;
  export function auditReport(loaded: LoadedWorld, resolved: ResolvedEngine): string;
  export function playReport(loaded: LoadedWorld, resolved: ResolvedEngine, commands: string[], seed?: number): string;
  ```

- [ ] **Step 1: Write the failing tests** (`packages/mcp/tests/tools.test.ts`):

```ts
import { resolve } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../src/load.ts';
import { auditReport, MAX_COMMANDS, MAX_LINES, playReport } from '../src/tools.ts';
import type { ResolvedEngine } from '../src/engine.ts';

const ENGINE: ResolvedEngine = { engine: bundled, version: bundled.ENGINE_VERSION, source: 'bundled' };
const TUTORIAL = resolve(import.meta.dirname, '../../engine/src/worlds/tutorial.ts');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const WIN = ['open drawer', 'take stapler', 'north', 'take mug and give mug to gary', 'talk to gary', 'north', 'smash machine with stapler'];

describe('auditReport', () => {
  it('a clean world: the engine used, the size and “No problems.”', async () => {
    const text = auditReport(await loadWorld(TUTORIAL, 'tutorial', FIXTURES), ENGINE);
    expect(text).toContain(`Engine: @brass-lantern/engine ${bundled.ENGINE_VERSION} (bundled with the MCP server)`);
    expect(text).toMatch(/Size: \d+ rooms, \d+ items, \d+ characters, \d+ events/);
    expect(text).toContain('No problems.');
  });
  it('lists each problem', async () => {
    const loaded = await loadWorld('audit-problem.ts', undefined, FIXTURES);
    const text = auditReport(loaded, ENGINE);
    expect(text).toMatch(/1 problem:\n- .*nowhere/);
  });
  it('says when the project’s engine was used, and carries a fallback note', async () => {
    const loaded = await loadWorld(TUTORIAL, 'tutorial', FIXTURES);
    expect(auditReport(loaded, { ...ENGINE, source: 'project', version: '2.2.0' })).toContain('2.2.0 (the project’s)');
    expect(auditReport(loaded, { ...ENGINE, note: 'used the bundled engine' })).toContain('Note: used the bundled engine');
  });
});

describe('playReport', () => {
  it('plays the tutorial to its ending, as its own test does', async () => {
    const text = playReport(await loadWorld(TUTORIAL, 'tutorial', FIXTURES), ENGINE, WIN);
    expect(text).toContain('> smash machine with stapler');
    expect(text).toContain('[Score: 50 of 50');
    expect(text).toContain('"gameOver": true');
    expect(text).toContain('"score": 50');
  });
  it('is the same every run with the same seed', async () => {
    const loaded = await loadWorld(TUTORIAL, 'tutorial', FIXTURES);
    expect(playReport(loaded, ENGINE, ['look', 'wait'], 7)).toBe(playReport(loaded, ENGINE, ['look', 'wait'], 7));
  });
  it('marks lines the parser can’t read, but not answers to the game’s own question', async () => {
    const loaded = await loadWorld('ambiguous.ts', undefined, FIXTURES);
    const text = playReport(loaded, ENGINE, ['frobnicate the thing', 'take key', 'rusty']);
    expect(text).toMatch(/> frobnicate the thing\n\[not understood by the parser/);
    expect(text).toMatch(/Which do you mean/);
    expect(text).not.toMatch(/> rusty\n\[not understood/);
  });
  it('stops at game over and says how many commands ran', async () => {
    const text = playReport(await loadWorld(TUTORIAL, 'tutorial', FIXTURES), ENGINE, [...WIN, 'look', 'look']);
    expect(text).toContain(`Game over after ${WIN.length} of ${WIN.length + 2} commands.`);
  });
  it('caps commands and lines', async () => {
    const loaded = await loadWorld(TUTORIAL, 'tutorial', FIXTURES);
    const text = playReport(loaded, ENGINE, Array.from({ length: MAX_COMMANDS + 5 }, () => 'look'));
    expect(text).toContain(`Only the first ${MAX_COMMANDS} commands ran.`);
    expect(text).toMatch(new RegExp(`\\[… \\d+ more lines cut \\(over ${MAX_LINES}\\)\\]`));
  });
});
```

Add two fixtures to `packages/mcp/tests/fixtures/`:
- `audit-problem.ts`: the hall world, with `exits: { north: 'nowhere' }` on the hall (one audit problem naming “nowhere”; if the audit reports it in other words, match the real wording in the test).
- `ambiguous.ts`: a world whose start room has two portable items, `key` (“brass key”, alias `key`) and `rusty_key` (“rusty key”, alias `key`), so `take key` asks which.

- [ ] **Step 2: Run to verify they fail** → FAIL (module not found).

- [ ] **Step 3: Implement** `packages/mcp/src/tools.ts`:

```ts
import type { World } from '@brass-lantern/engine';
import type { ResolvedEngine } from './engine.ts';
import type { LoadedWorld } from './load.ts';

export const MAX_COMMANDS = 500;
export const MAX_LINES = 2000;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The lines every engine tool opens with: which world, which engine. */
function header(loaded: LoadedWorld, resolved: ResolvedEngine): string[] {
  const whose = resolved.source === 'project' ? 'the project’s' : 'bundled with the MCP server';
  return [
    `World: ${loaded.exportName} in ${loaded.file}`,
    `Engine: @brass-lantern/engine ${resolved.version} (${whose})`,
    ...(resolved.note ? [`Note: ${resolved.note}`] : []),
  ];
}

export function auditReport(loaded: LoadedWorld, resolved: ResolvedEngine): string {
  const w = loaded.world;
  const problems = resolved.engine.auditWorld(w);
  const size = [
    count(Object.keys(w.rooms).length, 'room', 'rooms'),
    count(Object.keys(w.items).length, 'item', 'items'),
    count(Object.keys(w.npcs).length, 'character', 'characters'),
    count(Object.keys(w.events ?? {}).length, 'event', 'events'),
  ].join(', ');
  return [
    ...header(loaded, resolved),
    `Size: ${size}`,
    '',
    problems.length === 0 ? 'No problems.' : `${count(problems.length, 'problem', 'problems')}:`,
    ...problems.map((p) => `- ${p}`),
  ].join('\n');
}

/** The pieces of a typed line the regex parser can’t read (what the intent server would be asked about). */
function unread(resolved: ResolvedEngine, world: World, line: string): string[] {
  const { splitCommands, fallbackParse, andNames } = resolved.engine;
  if (!splitCommands || !fallbackParse) return [];
  return splitCommands(line, world.verbs, andNames?.(world)).filter((piece) => !fallbackParse(piece, world.verbs));
}

export function playReport(loaded: LoadedWorld, resolved: ResolvedEngine, commands: string[], seed = 1): string {
  const world = loaded.world;
  const game = resolved.engine.createGame(world, { seed });
  const run = commands.slice(0, MAX_COMMANDS);
  const transcript: string[] = [...game.opening];
  let awaiting = false;
  let ran = 0;
  let over = game.state.gameOver;
  for (const command of run) {
    if (over) break;
    transcript.push(`> ${command}`);
    // An answer to “Which do you mean?” isn’t a command, so it isn’t checked as one.
    const missed = awaiting ? [] : unread(resolved, world, command);
    if (missed.length > 0) {
      transcript.push(`[not understood by the parser: ${missed.map((p) => `“${p}”`).join(', ')}. With the intent server running, an LLM would get a chance to read it.]`);
    }
    const reply = game.send(command);
    transcript.push(...reply.lines);
    awaiting = reply.awaiting;
    over = reply.gameOver;
    ran += 1;
  }
  const shown = transcript.length > MAX_LINES ? [...transcript.slice(0, MAX_LINES), `[… ${transcript.length - MAX_LINES} more lines cut (over ${MAX_LINES})]`] : transcript;
  const s = game.state;
  const state = {
    room: `${world.rooms[s.currentRoom]?.name ?? s.currentRoom} (${s.currentRoom})`,
    inventory: Object.entries(s.locations ?? {})
      .filter(([, place]) => place === 'player')
      .map(([id]) => world.items[id]?.name ?? id),
    flags: Object.keys(s.flags).filter((f) => s.flags[f]).sort(),
    score: s.vars?.score ?? null,
    moves: s.moveCount,
    gameOver: s.gameOver,
  };
  const notes = [
    ...(commands.length > MAX_COMMANDS ? [`Only the first ${MAX_COMMANDS} commands ran.`] : []),
    ...(over && ran < run.length ? [`Game over after ${ran} of ${run.length} commands.`] : []),
  ];
  return [...header(loaded, resolved), `Seed: ${seed}`, '', ...shown, '', ...notes, 'Final state:', '```json', JSON.stringify(state, null, 2), '```'].join('\n');
}
```

- [ ] **Step 4: Run the tests, lint, type-check** → PASS, clean. Adjust only test expectations that depend on real engine wording you verify (e.g. the audit problem text), never the report format.
- [ ] **Step 5: Commit.** `git add packages/mcp && git commit -m "MCP: audit and play reports"`

---

### Task 4: Bundled docs and the docs tool

**Files:**
- Move: `docs/.vitepress/llms.ts` → `scripts/llms.ts` (update the import in `docs/.vitepress/config.mts`)
- Create: `docs/.vitepress/sidebar.ts` (the `sidebar`, `site` and llms description, moved out of `config.mts`, which imports them)
- Modify: `scripts/llms.ts` (split a pure `renderLlms` out of `writeLlms`)
- Create: `packages/mcp/scripts/bundle-docs.ts`, `packages/mcp/src/docs.ts`
- Modify: `packages/mcp/package.json` (`build` also bundles the docs)
- Test: `packages/mcp/tests/docs.test.ts`

**Interfaces:**
- Produces in `scripts/llms.ts`:
  ```ts
  export interface LlmsRendered { index: string; full: string; pages: Array<{ relative: string; title: string; markdown: string }> }
  export function renderLlms(opts: Omit<LlmsOptions, 'outDir'>): LlmsRendered; // throws on leftovers, as writeLlms did
  export function writeLlms(opts: LlmsOptions): void; // renderLlms, then writes llms.txt, llms-full.txt and each page
  ```
- Produces in `docs/.vitepress/sidebar.ts`: `export const site: string; export const sidebar: Array<{ text: string; items: Array<{ text: string; link: string }> }>; export const llmsTitle = 'Brass Lantern'; export const llmsDescription: string;`
- Produces in `packages/mcp/scripts/bundle-docs.ts`: `export function bundleDocs(outDir: string): void` (writes `outDir/llms.txt`, `outDir/pages.json` as `[{ path, title }]` where `path` is `relative` without `.md`, and `outDir/pages/<relative>`). Run as a script, it bundles into `packages/mcp/dist/docs`.
- Produces in `packages/mcp/src/docs.ts`:
  ```ts
  export interface DocPage { path: string; title: string; markdown: string }
  export interface Docs { index: string; pages: DocPage[] }
  export function readDocs(dir: string): Docs;
  export function normalizePage(page: string): string; // '/reference/world-schema.md' → 'reference/world-schema'; 'guide/building-worlds/' → 'guide/building-worlds/index'
  export function docsReport(docs: Docs, args: { page?: string; query?: string }): { text: string; isError: boolean };
  ```

- [ ] **Step 1: Move and split the generator (no behavior change).**
  - `git mv docs/.vitepress/llms.ts scripts/llms.ts`.
  - Move `site`, `sidebar` and the llms description string out of `config.mts` into `docs/.vitepress/sidebar.ts` and import them back.
  - In `scripts/llms.ts`, make `renderLlms` do everything `writeLlms` does except file writes. It returns `index` (the llms.txt text), `full` (the llms-full.txt text) and `pages` (each sidebar page’s `relative` path, e.g. `guide/testing.md`, its title and its standalone markdown). It runs the same leftover checks and throws.
  - `writeLlms` calls `renderLlms` and writes the files exactly as before.
  - `config.mts`’s `buildEnd` keeps calling `writeLlms`.
  - Verify: before you start, `npm run docs:build` and copy `docs/.vitepress/dist/llms.txt` and `llms-full.txt` to `/tmp/llms-before/`. After the move, rebuild and `diff` both files against the copies: no differences. Then `npm run lint:root` → clean.

- [ ] **Step 2: Write the failing tests** (`packages/mcp/tests/docs.test.ts`):

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { bundleDocs } from '../scripts/bundle-docs.ts';
import { docsReport, normalizePage, readDocs, type Docs } from '../src/docs.ts';

let docs: Docs;
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'bl-mcp-docs-'));
  bundleDocs(dir);
  docs = readDocs(dir);
});

describe('docs', () => {
  it('no arguments: the index, with how to ask for more', () => {
    const r = docsReport(docs, {});
    expect(r.isError).toBe(false);
    expect(r.text).toContain('# Brass Lantern');
    expect(r.text).toContain('reference/world-schema');
    expect(r.text).toMatch(/page.*query/);
  });
  it('a page by name, however it is typed', () => {
    for (const name of ['reference/world-schema', '/reference/world-schema', 'reference/world-schema.md']) {
      expect(docsReport(docs, { page: name }).text, name).toContain('typoReplies');
    }
    expect(docsReport(docs, { page: 'guide/building-worlds/' }).text).toContain('How names are matched');
  });
  it('an unknown page lists the real ones', () => {
    const r = docsReport(docs, { page: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('reference/conditions-and-events');
  });
  it('a query returns the best sections first, with their page', () => {
    const r = docsReport(docs, { query: 'typo replies misspelling' });
    expect(r.isError).toBe(false);
    expect(r.text.indexOf('typoReplies')).toBeGreaterThan(-1);
    expect(r.text).toMatch(/Source: \S+/);
  });
  it('a query that matches nothing says so', () => {
    expect(docsReport(docs, { query: 'xylophonequux' }).text).toMatch(/No sections matched “xylophonequux”/);
  });
  it('normalizePage', () => {
    expect(normalizePage('/reference/world-schema.md')).toBe('reference/world-schema');
    expect(normalizePage('guide/building-worlds/')).toBe('guide/building-worlds/index');
    expect(normalizePage('')).toBe('index');
  });
});
```

- [ ] **Step 3: Run to verify they fail** → FAIL (modules not found).

- [ ] **Step 4: Implement the bundler** `packages/mcp/scripts/bundle-docs.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLlms } from '../../../scripts/llms.ts';
import { llmsDescription, llmsTitle, sidebar, site } from '../../../docs/.vitepress/sidebar.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

/** The docs of this version, as the docs tool reads them: llms.txt, pages.json and each page’s markdown. */
export function bundleDocs(outDir: string): void {
  const rendered = renderLlms({
    srcDir: join(ROOT, 'docs'),
    site,
    title: llmsTitle,
    description: llmsDescription,
    sections: sidebar.map((s) => ({ text: s.text, items: s.items.map((i) => ({ title: i.text, link: i.link })) })),
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'llms.txt'), rendered.index);
  writeFileSync(join(outDir, 'pages.json'), JSON.stringify(rendered.pages.map((p) => ({ path: p.relative.replace(/\.md$/, ''), title: p.title })), null, 2));
  for (const page of rendered.pages) {
    const file = join(outDir, 'pages', page.relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, page.markdown);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) bundleDocs(resolve(import.meta.dirname, '../dist/docs'));
```

In `packages/mcp/package.json`, `"build": "tsc -p tsconfig.build.json && tsx scripts/bundle-docs.ts"`.

- [ ] **Step 5: Implement the tool logic** `packages/mcp/src/docs.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DocPage {
  /** 'reference/world-schema', 'guide/building-worlds/index'. */
  path: string;
  title: string;
  markdown: string;
}

export interface Docs {
  index: string;
  pages: DocPage[];
}

const MAX_SECTIONS = 5;
const MAX_SECTION_CHARS = 4000;

/** Reads a bundle written by scripts/bundle-docs.ts. */
export function readDocs(dir: string): Docs {
  const list = JSON.parse(readFileSync(join(dir, 'pages.json'), 'utf8')) as Array<{ path: string; title: string }>;
  return {
    index: readFileSync(join(dir, 'llms.txt'), 'utf8'),
    pages: list.map((p) => ({ ...p, markdown: readFileSync(join(dir, 'pages', `${p.path}.md`), 'utf8') })),
  };
}

/** A page name as an agent might type it, as a bundle path. */
export function normalizePage(page: string): string {
  const trimmed = page.trim().replace(/^\/+/, '').replace(/\.md$/, '');
  if (trimmed === '' || trimmed.endsWith('/')) return `${trimmed}index`;
  return trimmed;
}

/** A page split at its headings: each heading with the text under it. */
function sections(page: DocPage): Array<{ heading: string; text: string }> {
  const out: Array<{ heading: string; text: string }> = [];
  let current = { heading: page.title, text: '' };
  let fenced = false;
  for (const line of page.markdown.split('\n')) {
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) {
      if (current.text.trim()) out.push(current);
      current = { heading: heading[1].trim(), text: `${line}\n` };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim()) out.push(current);
  return out;
}

/** Counts how often `term` appears in `text`, up to `cap`, without a regex (both are plain lowercase strings). */
function occurrences(text: string, term: string, cap: number): number {
  let n = 0;
  for (let at = text.indexOf(term); at !== -1 && n < cap; at = text.indexOf(term, at + term.length)) n += 1;
  return n;
}

export function docsReport(docs: Docs, args: { page?: string; query?: string }): { text: string; isError: boolean } {
  if (args.page !== undefined) {
    const wanted = normalizePage(args.page);
    const page = docs.pages.find((p) => p.path === wanted);
    if (!page) return { isError: true, text: `No page “${args.page}”. Pages:\n${docs.pages.map((p) => `- ${p.path} (${p.title})`).join('\n')}` };
    return { isError: false, text: page.markdown };
  }
  if (args.query !== undefined && args.query.trim() !== '') {
    const terms = [...new Set(args.query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3))];
    const scored = docs.pages
      .flatMap((page) => sections(page).map((s) => ({ page, ...s })))
      .map((s) => {
        const heading = s.heading.toLowerCase();
        const body = s.text.toLowerCase();
        const score = terms.reduce((sum, t) => sum + (heading.includes(t) ? 3 : 0) + occurrences(body, t, 5), 0);
        return { ...s, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SECTIONS);
    if (scored.length === 0) return { isError: false, text: `No sections matched “${args.query}”. Try other words, or call docs with no arguments for the index.` };
    return {
      isError: false,
      text: scored
        .map((s) => `## ${s.page.title} › ${s.heading}\nSource: ${s.page.path}\n\n${s.text.length > MAX_SECTION_CHARS ? `${s.text.slice(0, MAX_SECTION_CHARS)}\n[… cut; ask for the page “${s.page.path}” for all of it]` : s.text.trim()}`)
        .join('\n\n'),
    };
  }
  return { isError: false, text: `${docs.index}\n\nAsk for a page with “page” (e.g. reference/world-schema), or search with “query”.` };
}
```

- [ ] **Step 6: Run the tests, lint, type-check, build.** `npx vitest run packages/mcp/tests/docs.test.ts` → PASS. `npm run build -w @brass-lantern/mcp` → `packages/mcp/dist/docs/pages.json` exists and lists 17 pages. `npm run docs:build && npm run lint:root` → clean.
- [ ] **Step 7: Commit.** `git add -A scripts docs/.vitepress packages/mcp && git commit -m "MCP: bundle this version’s docs and serve them (page, search, index)"`

---

### Task 5: The server and the binary

**Files:**
- Create: `packages/mcp/src/server.ts`, `packages/mcp/src/cli.ts`
- Test: `packages/mcp/tests/server.test.ts`

**Interfaces:**
- Consumes: `loadWorld`/`WorldLoadError` (Task 1), `resolveEngine`/`Engine` (Task 2), `auditReport`/`playReport` (Task 3), `readDocs`/`docsReport` (Task 4).
- Produces:
  ```ts
  export interface ServerOptions { bundled: Engine; docsDir: string; cwd: string; version: string }
  export function createServer(options: ServerOptions): McpServer; // tools: audit_world, play, docs
  ```

- [ ] **Step 1: Write the failing tests** (`packages/mcp/tests/server.test.ts`):

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleDocs } from '../scripts/bundle-docs.ts';
import { createServer } from '../src/server.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');
let client: Client;

beforeAll(async () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'bl-mcp-server-docs-'));
  bundleDocs(docsDir);
  const server = createServer({ bundled, docsDir, cwd: FIXTURES, version: '0.0.0-test' });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(clientSide);
});
afterAll(() => client.close());

const text = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');

describe('the MCP server', () => {
  it('lists the three tools with their inputs', async () => {
    const tools = (await client.listTools()).tools.map((t) => [t.name, Object.keys(t.inputSchema.properties ?? {}).sort()]);
    expect(tools).toEqual([
      ['audit_world', ['export', 'path']],
      ['play', ['commands', 'export', 'path', 'seed']],
      ['docs', ['page', 'query']],
    ]);
  });
  it('audit_world on a world with a problem', async () => {
    const r = await client.callTool({ name: 'audit_world', arguments: { path: 'audit-problem.ts' } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/1 problem:/);
  });
  it('play drives the tutorial (path relative to cwd, by export name)', async () => {
    const r = await client.callTool({
      name: 'play',
      arguments: { path: '../../../engine/src/worlds/tutorial.ts', export: 'tutorial', commands: ['open drawer', 'take stapler', 'north', 'take mug and give mug to gary', 'talk to gary', 'north', 'smash machine with stapler'] },
    });
    expect(text(r)).toContain('"gameOver": true');
  });
  it('a broken world is an error result, and the server keeps working', async () => {
    const bad = await client.callTool({ name: 'audit_world', arguments: { path: 'broken.ts' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/^broken\.ts: /);
    const thrower = await client.callTool({ name: 'play', arguments: { path: 'throws.ts', commands: ['look'] } });
    expect(thrower.isError).toBe(true);
    expect(text(thrower)).toMatch(/The engine threw: .*kaboom/);
    const ok = await client.callTool({ name: 'audit_world', arguments: { path: 'default-world.ts' } });
    expect(ok.isError).toBeFalsy();
  });
  it('bad arguments are refused by the schema', async () => {
    const r = await client.callTool({ name: 'play', arguments: { path: 'default-world.ts', commands: [] } });
    expect(r.isError).toBe(true);
  });
  it('docs answers from the bundle', async () => {
    expect(text(await client.callTool({ name: 'docs', arguments: { page: 'reference/world-schema' } }))).toContain('typoReplies');
  });
});
```

Add fixture `packages/mcp/tests/fixtures/throws.ts`: the hall world plus `scripts: { boom: () => { throw new Error('kaboom'); } }` and `descriptionScript: 'boom'` on the hall room, so describing the room (the opening, or `look`) throws. If the engine catches script errors itself in this version, make the throw happen in `createGame` some other way you verify (for example a getter on `rooms` that throws) and say so in your report.

- [ ] **Step 2: Run to verify they fail** → FAIL (module not found).

- [ ] **Step 3: Implement** `packages/mcp/src/server.ts`:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { docsReport, readDocs } from './docs.ts';
import { resolveEngine, type Engine } from './engine.ts';
import { loadWorld, WorldLoadError, type LoadedWorld } from './load.ts';
import { auditReport, MAX_COMMANDS, playReport } from './tools.ts';
import type { ResolvedEngine } from './engine.ts';

export interface ServerOptions {
  /** The engine to use when a world’s project has none of its own. */
  bundled: Engine;
  /** Where the docs bundle is (dist/docs when published). */
  docsDir: string;
  /** Relative world paths resolve against this (the client’s launch directory). */
  cwd: string;
  version: string;
}

type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const reply = (text: string, isError = false): Result => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });

const PATH = z.string().min(1).describe('The world module: a .ts, .mts, .js or .mjs file, relative to the directory the server was started in, or absolute.');
const EXPORT = z.string().min(1).optional().describe('Which export is the world. Default: the default export, else the only world-shaped export.');

export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: 'brass-lantern', version: options.version });

  /** Loads the world and its engine, runs `report`, and turns any failure into an error result. */
  async function withWorld(path: string, exportName: string | undefined, report: (loaded: LoadedWorld, resolved: ResolvedEngine) => string): Promise<Result> {
    try {
      const loaded = await loadWorld(path, exportName, options.cwd);
      const resolved = await resolveEngine(loaded.file, options.bundled);
      return reply(report(loaded, resolved));
    } catch (error) {
      if (error instanceof WorldLoadError) return reply(error.message, true);
      return reply(`The engine threw: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  server.registerTool(
    'audit_world',
    {
      title: 'Audit a Brass Lantern world',
      description: 'Checks a world file the way the engine’s auditWorld does: exits that go nowhere, conditions that don’t parse, effects naming things that don’t exist, unmapped flag labels and more. Reports the engine version used.',
      inputSchema: { path: PATH, export: EXPORT },
    },
    ({ path, export: exportName }) => withWorld(path, exportName, auditReport),
  );

  server.registerTool(
    'play',
    {
      title: 'Play commands in a Brass Lantern world',
      description: `Starts a fresh game (seeded, so runs repeat exactly) and types each command, as a player would, with no LLM. Returns the transcript and the final state (room, inventory, flags, score, moves, game over). Each call starts from the beginning; at most ${MAX_COMMANDS} commands.`,
      inputSchema: {
        path: PATH,
        export: EXPORT,
        commands: z.array(z.string()).min(1).describe('Commands to type, in order (e.g. ["open drawer", "take key", "north"]).'),
        seed: z.number().int().optional().describe('Random seed. Default 1.'),
      },
    },
    ({ path, export: exportName, commands, seed }) => withWorld(path, exportName, (loaded, resolved) => playReport(loaded, resolved, commands, seed)),
  );

  server.registerTool(
    'docs',
    {
      title: 'Brass Lantern documentation',
      description: 'The docs for this version: with no arguments, the index of pages; with “page”, one page’s markdown (e.g. reference/world-schema); with “query”, the best-matching sections.',
      inputSchema: {
        page: z.string().optional().describe('A page path from the index, e.g. reference/world-schema or guide/building-worlds/recipes.'),
        query: z.string().optional().describe('Words to search the docs for, e.g. "timers fuses".'),
      },
    },
    ({ page, query }) => {
      try {
        const r = docsReport(readDocs(options.docsDir), { page, query });
        return reply(r.text, r.isError);
      } catch (error) {
        return reply(`The docs bundle couldn’t be read (${error instanceof Error ? error.message : String(error)}).`, true);
      }
    },
  );

  return server;
}
```

`packages/mcp/src/cli.ts`:

```ts
#!/usr/bin/env node
// The stdio entry point an MCP client launches (`npx -y @brass-lantern/mcp`). Nothing may be
// written to stdout except through the transport: it carries the protocol.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as bundled from '@brass-lantern/engine';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const server = createServer({ bundled, docsDir: fileURLToPath(new URL('./docs/', import.meta.url)), cwd: process.cwd(), version: pkg.version });
await server.connect(new StdioServerTransport());
```

Imports inside `src/` use `.ts` extensions in the repo; check how `packages/server/src` imports siblings and whether `tsconfig` sets `rewriteRelativeImportExtensions` (or uses `.js` specifiers), and follow the same pattern so `dist/` runs under plain Node.

- [ ] **Step 4: Run the tests, lint, type-check, build, and run the binary once.** `npx vitest run packages/mcp` → PASS. `npm run build -w @brass-lantern/mcp`. Then check that the built binary answers over stdio:

```bash
node -e "
import('@modelcontextprotocol/sdk/client/index.js').then(async ({ Client }) => {
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const c = new Client({ name: 'probe', version: '1' });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: ['packages/mcp/dist/cli.js'], cwd: process.cwd() }));
  console.log((await c.listTools()).tools.map(t => t.name).join(','));
  await c.close();
});"
```

Run it from the repo root with `NODE_PATH` unset; expected output: `audit_world,play,docs`. `npm run test:coverage -w @brass-lantern/mcp` → meets thresholds.

- [ ] **Step 5: Commit.** `git add packages/mcp && git commit -m "MCP: the server (audit_world, play, docs) and the stdio binary"`

---

### Task 6: Release plumbing

**Files:**
- Modify: every `package.json` with a version (root, `packages/engine`, `packages/vue`, `packages/server`, `packages/mcp`, `apps/site`), `packages/engine/src/version.ts`, `packages/vue/package.json` (engine range `^2.3.0`), `packages/mcp/package.json` (engine range `^2.3.0`), `apps/site/package.json` (pins `2.3.0`), `package-lock.json`
- Modify: `scripts/release-check.mjs` (include `mcp`), `.github/workflows/release.yml` (publish loop `engine mcp server vue`; comments mentioning “three packages” become four), `scripts/consumer-smoke.mjs` (pack and check `@brass-lantern/mcp`)

- [ ] **Step 1: Versions.** Set every version to 2.3.0 (`npm pkg set version=2.3.0` in each workspace and the root; `ENGINE_VERSION = '2.3.0'`), the vue and mcp engine ranges to `^2.3.0`, and the site pins to `2.3.0`. Then `npm install --package-lock-only`. Verify: `node -e "const l=require('./package-lock.json');console.log(Object.keys(l.packages).filter(k=>/node_modules\/@brass-lantern\//.test(k)&&!l.packages[k].link))"` prints `[]` (every internal package links to its workspace).
- [ ] **Step 2: Release check and workflow.** In `scripts/release-check.mjs` the package list becomes `['engine', 'mcp', 'server', 'vue']`. In `release.yml` the publish loop becomes `for dir in engine mcp server vue; do`. Run `node scripts/release-check.mjs 2.3.0` → every line `ok`.
- [ ] **Step 3: Smoke.** In `scripts/consumer-smoke.mjs`:
  - Add `'@brass-lantern/mcp'` to `PACKAGES`.
  - Tarball contents check: `check('mcp: ships the binary and the docs bundle', contents['@brass-lantern/mcp'].includes('dist/cli.js') && contents['@brass-lantern/mcp'].includes('dist/docs/pages.json'))`.
  - Install the mcp tarball in the same `npm install` as the engine and server tarballs. That way its `@brass-lantern/engine@^2.3.0` dependency is met by the local tarball, not the registry.
  - Add a check that writes `world.ts` into the scratch app: `import { tutorial } from '@brass-lantern/engine/worlds'; export default tutorial;`. That is a value import from the project’s own installed engine, which jiti has to resolve. It then runs this through the existing `node(app, code)` helper:

```js
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
const client = new Client({ name: 'smoke', version: '1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['node_modules/@brass-lantern/mcp/dist/cli.js'], cwd: process.cwd() }));
const tools = (await client.listTools()).tools.map((t) => t.name);
const audit = await client.callTool({ name: 'audit_world', arguments: { path: 'world.ts' } });
const play = await client.callTool({ name: 'play', arguments: { path: 'world.ts', commands: ['look'] } });
const docs = await client.callTool({ name: 'docs', arguments: { page: 'reference/world-schema' } });
await client.close();
console.log(JSON.stringify({ tools, audit: audit.content[0].text, play: play.content[0].text, docs: docs.content[0].text.slice(0, 200) }));
```

  with checks: the tools are `audit_world,play,docs`; the audit text contains `No problems.` and `(the project’s)` (the scratch project has its own engine); play contains `> look`; docs contains `World schema`.
  - Run `NPM_CONFIG_USERCONFIG=/dev/null npm run smoke` → all `ok`.
- [ ] **Step 4: Full checks.** `npm run lint && npm run type-check && npm run test:coverage && npm run build:packages && npm run build && npm run docs:build` → green.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "2.3.0: release plumbing for @brass-lantern/mcp (versions, release check, publish loop, smoke)"`

---

### Task 7: Docs and changelog

**Files:**
- Create: `docs/guide/coding-agents.md`, `packages/mcp/README.md`
- Modify: `docs/.vitepress/sidebar.ts` (add “Coding agents” to the Guide section after “Using the library”), `docs/guide/getting-started.md` (the “For coding agents” section links the new page), `README.md` (the docs list gains “Coding agents”, and the package list mentions the fourth package), `CHANGELOG.md` (a 2.3.0 entry)

- [ ] **Step 1: `docs/guide/coding-agents.md`.** Write it in the docs’ voice: smart punctuation, American spelling, em-dashes only where they earn their place and closed up. Sections:
  1. **The docs as one file:** `llms.txt` and `llms-full.txt`, what is in each, and when to use which.
  2. **The MCP server:**
     - What it does and the write → audit → play → fix loop.
     - Install, as client config:
       - Claude Code: `claude mcp add brass-lantern -- npx -y @brass-lantern/mcp`.
       - Generic JSON: `{ "mcpServers": { "brass-lantern": { "command": "npx", "args": ["-y", "@brass-lantern/mcp"] } } }`.
     - Paths are relative to where the client starts it.
  3. **The tools:** `audit_world`, `play` (stateless, seeded, the caps, the “not understood by the parser” note), and `docs`. Give one example call and an abbreviated reply for each.
  4. **Which engine:** the project’s own first, then the bundled one, and the version is always reported.
  5. **Safety:** it runs the world module it is pointed at, with your permissions, like your test runner. It is local stdio only, with no network.
- [ ] **Step 2: `packages/mcp/README.md`.** The npm page: one paragraph on what it is, the two install snippets, the three tools in one line each, the safety sentence, and a link to the guide page. Match `packages/server/README.md`’s length and tone.
- [ ] **Step 3: CHANGELOG.** At the top:

```markdown
## 2.3.0 (YYYY-MM-DD)

- **`@brass-lantern/mcp`**, a new package: a local Model Context Protocol server for coding agents. `audit_world` audits a world file, `play` runs commands in a fresh seeded game and returns the transcript and final state, and `docs` serves this version’s documentation. It uses the world’s own project’s engine when it has one. See [Coding agents](https://mrballistic.github.io/brass-lantern/guide/coding-agents).
- The docs come as markdown for agents too: `llms.txt`, `llms-full.txt` and a `.md` copy of every page.
- `@brass-lantern/engine`, `/vue` and `/server`: no changes beyond the version.
```

(Use the release date when Task 8 runs.)
- [ ] **Step 4: Checks.** `npm run docs:build && npm run lint:root`, then confirm `docs/.vitepress/dist/llms.txt` lists “Coding agents”. `npm run build -w @brass-lantern/mcp` → `dist/docs/pages.json` has 18 pages.
- [ ] **Step 5: Commit.** `git add -A docs README.md CHANGELOG.md packages/mcp/README.md && git commit -m "Docs: coding agents (llms.txt and the MCP server); 2.3.0 changelog"`

---

### Task 8: Real-client check, review, PR (controller)

- [ ] **Step 1: A real client.**
  - Register the built server in Claude Code at user scope, pointing at the local build: `claude mcp add brass-lantern-dev -- node ~/current_work/brass-lantern/packages/mcp/dist/cli.js`.
  - From a scratch directory, ask a fresh session to write a three-room world with a key, audit it and play it to the end using only the brass-lantern tools.
  - Record the result: it worked, or what broke, with each break fixed test-first in the relevant task area.
  - Remove the dev registration afterward with `claude mcp remove brass-lantern-dev`.
- [ ] **Step 2: Whole-branch review** on the most capable model, over `git diff main...mcp-server`, with the spec, this plan and the ledger.
- [ ] **Step 3: PR.** Push `mcp-server` and open the PR. In the body, list the owner’s pre-tag steps:
  - Publish a placeholder `@brass-lantern/mcp@0.0.0-stage` (as was done for the first three packages).
  - Add its npm Trusted Publisher: `mrballistic/brass-lantern`, `release.yml`, environment `npm-publish`.
  - After the npm publish, create the GitHub release `v2.3.0` from the CHANGELOG entry.

  Merging, tagging and publishing are the owner’s.
