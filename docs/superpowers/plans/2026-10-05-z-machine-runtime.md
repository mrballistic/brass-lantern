# Z-machine Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brass Lantern plays Z-machine story files (starting with Zork I) in its CRT terminal, chosen from a cartridge menu alongside native worlds, with SAVE/RESTORE and per-turn autosave.

**Architecture:**
- **The interpreter stack:** ifvms (the Z-machine) runs the story. A vendored, factory-wrapped `glkapi.js` provides the Glk API. A new `BrowserGlkOte` translates GlkOte protocol updates into terminal lines and a header status line.
- **One session per game:** `ZMachineSession` owns a fresh Glk + VM + dispatcher, with a `LocalStorageDialog` for files and autosaves.
- **Stores:** a new `zgame` Pinia store runs Z-machine sessions, a `cartridges` store runs the boot menu, and a `useSession()` router lets the existing `Terminal.vue` drive whichever is active. The native `game` store becomes per-cartridge.

**Tech Stack:** Vue 3, Pinia 4, TypeScript 6, Vite 8, Vitest 5 (happy-dom), ifvms 1.1.6, glkote-term 0.4.4 (source of glkapi.js).

**Spec:** `docs/superpowers/specs/2026-10-05-z-machine-runtime-design.md`

## Global Constraints

- Repo: `~/current_work/brass-lantern`, branch `z-machine`; merge via PR (the `main` ruleset requires PR + green CI). Commit as `mrballistic@gmail.com` (already the repo's local git identity).
- Node ≥ 24. TypeScript `~6.0.3`. Dependencies must be MIT/BSD/ISC: `ifvms` `1.1.6` (exact) as a dependency; `glkote-term` `0.4.4` (exact) as a devDependency (vendoring source only). Never Frotz (GPL-2.0).
- Coverage thresholds stay at ≥80% lines/functions/statements, ≥75% branches; `src/zmachine/vendor/**` is excluded from coverage and lint.
- Player-facing copy uses curly quotes and apostrophes (“ ” ’); code delimiters, keys and comments are exempt.
- Engine code stays world-agnostic: the only places that name Zork are `src/app.config.ts`, `public/stories/`, `tests/fixtures/`, tests, and docs.
- The LLM is not involved in Z-machine games in this phase.
- Every new VM gets its own copy of the story bytes: `new Uint8Array(story)`.
- Storage keys live under `${storagePrefix}:z:` for Z-machine data; native save keys default to `${storagePrefix}:save:${cartridgeId}` with an optional per-cartridge override.
- Run checks with: `npm run lint && npm run type-check && npm run test:coverage && npm run build` (repo root).

## Review Focus

1. **Reload mid-game:** the transcript renders instantly and the VM resumes at the same turn with no replayed text. Tested in Task 5 (session autorestore) and Task 7 (zgame restore).
2. **Storage unavailable:** the game still plays; SAVE reports it isn’t available and the game says “Failed.”, and nothing throws. Tested in Task 4 (dialog) and Task 5 (session).
3. **Story download fails:** a clear message appears, nothing hangs, and EJECT returns to the menu. Tested in Task 7 (zgame) and Task 8 (router).
4. **RESTORE with no saves, or a misspelled name:** a message, then the game’s own “Failed.”, and play continues. Tested in Task 5.
5. **Game over (QUIT, Y):** an end message, PLAY starts again, and the autosave and transcript are cleared, so a reload doesn’t resume a dead game. Tested in Task 5 (exit and autosave) and Task 7 (PLAY and transcript).

---

### Task 1: Interpreter dependencies, vendored glkapi, story files

**Files:**
- Modify: `package.json` (via npm)
- Create: `scripts/vendor-glkapi.mjs`
- Create (generated): `src/zmachine/vendor/glkapi.js`
- Create: `src/zmachine/vendor/glkapi.d.ts`, `src/zmachine/vendor/ifvms.d.ts`
- Create: `public/stories/zork1.z3`, `public/stories/LICENSE-zork1.txt`, `tests/fixtures/zork1.z3`, `tests/fixtures/LICENSE-zork1.txt`
- Modify: `eslint.config.js`, `vitest.config.ts`
- Test: `tests/zmachine/vendor.test.ts`

**Interfaces:**
- Produces: `createGlk(): GlkApi` from `@/zmachine/vendor/glkapi.js` (fresh instance per call; `GlkApi.init(options)`); `import ifvms from 'ifvms'` with `new ifvms.ZVM()` and `vm.prepare(story: Uint8Array, options)`; `import ZVMDispatch from 'ifvms/src/zvm/dispatch.js'`.

- [ ] **Step 1: Install dependencies**

```bash
npm i ifvms@1.1.6 --save-exact
npm i -D glkote-term@0.4.4 --save-exact
```

- [ ] **Step 2: Add the story files and their license**

```bash
mkdir -p public/stories tests/fixtures
curl -sL -o public/stories/zork1.z3 https://raw.githubusercontent.com/historicalsource/zork1/master/COMPILED/zork1.z3
curl -sL -o public/stories/LICENSE-zork1.txt https://raw.githubusercontent.com/historicalsource/zork1/master/LICENSE
cp public/stories/zork1.z3 tests/fixtures/zork1.z3
cp public/stories/LICENSE-zork1.txt tests/fixtures/LICENSE-zork1.txt
xxd -l 4 public/stories/zork1.z3   # expect: 0300 0077 (version 3, release 119)
head -3 public/stories/LICENSE-zork1.txt   # expect: MIT License / Copyright (c) 2025 Microsoft
```

- [ ] **Step 3: Write the vendoring script**

`scripts/vendor-glkapi.mjs`:

```js
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
```

Run: `node scripts/vendor-glkapi.mjs`
Expected: `Wrote src/zmachine/vendor/glkapi.js from glkote-term 0.4.4`

- [ ] **Step 4: Type declarations for the untyped JavaScript**

`src/zmachine/vendor/glkapi.d.ts`:

```ts
/** The Glk API object glkapi.js builds. We call init(); ifvms uses the rest. */
export interface GlkApi {
  init(options: Record<string, unknown>): void;
}

/** A fresh, independent Glk instance. */
export function createGlk(): GlkApi;
```

`src/zmachine/vendor/ifvms.d.ts`:

```ts
declare module 'ifvms' {
  export class ZVM {
    prepare(story: Uint8Array, options: Record<string, unknown>): void;
  }
  const ifvms: { ZVM: typeof ZVM };
  export default ifvms;
}

declare module 'ifvms/src/zvm/dispatch.js' {
  /** ifvms's Glk dispatch layer (glkapi calls it GiDispa). Needed for autosave. */
  export default class ZVMDispatch {}
}
```

- [ ] **Step 5: Exclude the vendored file from lint and coverage**

In `eslint.config.js`, add `'src/zmachine/vendor/**'` to the `ignores` array:

```js
    ignores: ['dist/**', 'coverage/**', 'server/**', 'node_modules/**', 'docs/.vitepress/cache/**', 'docs/.vitepress/dist/**', 'src/zmachine/vendor/**'],
```

In `vitest.config.ts`, add it to `coverage.exclude`:

```ts
      exclude: [
        'src/main.ts',
        'src/env.d.ts',
        'src/**/*.d.ts',
        'src/worlds/**',
        'src/zmachine/vendor/**',
      ],
```

- [ ] **Step 6: Write the smoke test**

`tests/zmachine/vendor.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ifvms from 'ifvms';
import ZVMDispatch from 'ifvms/src/zvm/dispatch.js';
import { createGlk } from '@/zmachine/vendor/glkapi.js';

// The real Zork I, Release 119 (MIT, Microsoft 2025).
const story = new Uint8Array(readFileSync(new URL('../fixtures/zork1.z3', import.meta.url)));

const METRICS = {
  buffercharheight: 1, buffercharwidth: 1, buffermarginx: 0, buffermarginy: 0,
  graphicsmarginx: 0, graphicsmarginy: 0, gridcharheight: 1, gridcharwidth: 1,
  gridmarginx: 0, gridmarginy: 0, height: 25, inspacingx: 0, inspacingy: 0,
  outspacingx: 0, outspacingy: 0, width: 80,
};

type Paragraph = { content?: string[] };
type Update = { content?: Array<{ text?: Paragraph[] }> };

/** Boot the story with a bare-bones GlkOte and return the first screen of text. */
function firstScreen(): Promise<string> {
  return new Promise((resolve, reject) => {
    let iface: { accept(event: object): void } | null = null;
    const glkote = {
      init(i: { accept(event: object): void }) {
        iface = i;
        setTimeout(() => i.accept({ type: 'init', gen: 0, support: [], metrics: METRICS }), 0);
      },
      update(data: Update) {
        const text = (data.content ?? [])
          .flatMap((c) => c.text ?? [])
          .map((p) => (p.content ?? []).filter((_, i) => i % 2 === 1).join(''))
          .join('\n');
        resolve(text);
      },
      save_allstate: () => ({}),
      log() {},
      warning() {},
      error: (m: string) => reject(new Error(m)),
      getinterface: () => iface,
    };
    const Glk = createGlk();
    const vm = new ifvms.ZVM();
    const options = { vm, Glk, GlkOte: glkote, GiDispa: new ZVMDispatch(), Dialog: { streaming: false } };
    vm.prepare(new Uint8Array(story), options);
    Glk.init(options);
  });
}

describe('vendored glkapi with ifvms', () => {
  it('boots Zork I', async () => {
    const text = await firstScreen();
    expect(text).toContain('ZORK I: The Great Underground Empire');
    expect(text).toContain('West of House');
  });

  it('gives every session its own Glk instance, so a second boot works', async () => {
    expect(createGlk()).not.toBe(createGlk());
    expect(await firstScreen()).toContain('West of House');
  });
});
```

- [ ] **Step 7: Run it**

Run: `npx vitest run tests/zmachine/vendor.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 8: Full checks and commit**

Run: `npm run lint && npm run type-check && npm test`
Expected: all pass.

```bash
git add package.json package-lock.json scripts/vendor-glkapi.mjs src/zmachine/vendor public/stories tests/fixtures/zork1.z3 tests/fixtures/LICENSE-zork1.txt tests/zmachine/vendor.test.ts eslint.config.js vitest.config.ts
git commit -m "Add the Z-machine interpreter (ifvms) and a vendored, per-session glkapi

Boots the real Zork I (Release 119, MIT) in tests."
```

---

### Task 2: Protocol types and text formatting

**Files:**
- Create: `src/zmachine/types.ts`, `src/zmachine/format.ts`
- Test: `tests/zmachine/format.test.ts`

**Interfaces:**
- Produces (types): `GlkRuns`, `GlkParagraph`, `GlkGridLine`, `GlkWindow`, `GlkContent`, `GlkInputRequest`, `FilePrompt`, `GlkUpdate`, `StatusLine { location: string; detail: string }`.
- Produces (functions): `runsText(runs, skip?): string`, `paragraphsToLines(paragraphs): string[]`, `statusFromGrid(lines): StatusLine | null`.

- [ ] **Step 1: Write the types**

`src/zmachine/types.ts`:

```ts
// The parts of the GlkOte display protocol Brass Lantern uses.
// Reference: https://eblong.com/zarf/glk/glkote/docs.html

/** A run list: flat [style, text, style, text…] or {style, text} objects. */
export type GlkRuns = Array<string | { style?: string; text: string }>;

/** One paragraph of a buffer window. `{}` is a blank line. */
export interface GlkParagraph {
  append?: boolean;
  flowbreak?: boolean;
  content?: GlkRuns;
}

/** One changed line of a grid window (the status line is grid line 0). */
export interface GlkGridLine {
  line: number;
  content?: GlkRuns;
}

export interface GlkWindow {
  id: number;
  type: 'buffer' | 'grid' | 'graphics' | 'pair';
  rock: number;
  gridwidth?: number;
  gridheight?: number;
}

export interface GlkContent {
  id: number;
  clear?: boolean;
  text?: GlkParagraph[];
  lines?: GlkGridLine[];
}

export interface GlkInputRequest {
  id: number;
  type: 'line' | 'char';
  gen: number;
  maxlen?: number;
  initial?: string;
}

/** The game wants a file: SAVE (write) or RESTORE (read). */
export interface FilePrompt {
  type: 'fileref_prompt';
  filemode: 'read' | 'write' | 'readwrite' | 'writeappend';
  filetype: string;
  gameid?: string;
}

export interface GlkUpdate {
  type: 'update' | 'exit' | 'error' | 'pass';
  gen?: number;
  windows?: GlkWindow[] | null;
  content?: GlkContent[];
  input?: GlkInputRequest[];
  specialinput?: FilePrompt;
  disable?: boolean;
  message?: string;
}

/** The status line, split: location on the left, score or time on the right. */
export interface StatusLine {
  location: string;
  detail: string;
}
```

- [ ] **Step 2: Write the failing tests**

`tests/zmachine/format.test.ts` (fixtures are real updates captured from Zork I):

```ts
import { describe, expect, it } from 'vitest';
import { paragraphsToLines, runsText, statusFromGrid } from '@/zmachine/format';
import type { GlkParagraph } from '@/zmachine/types';

const OPENING: GlkParagraph[] = [
  { content: ['normal', 'ZORK I: The Great Underground Empire'], append: true },
  { content: ['normal', 'Release 119 / Serial number 880429'] },
  {},
  { content: ['normal', 'West of House'] },
  { content: ['normal', 'You are standing in an open field west of a white house, with a boarded front door.'] },
  { content: ['normal', 'There is a small mailbox here.'] },
  {},
  { content: ['normal', '>'] },
];

const OPEN_MAILBOX: GlkParagraph[] = [
  { content: ['input', 'open mailbox'], append: true },
  { content: ['normal', 'Opening the small mailbox reveals a leaflet.'] },
  {},
  { content: ['normal', '>'] },
];

describe('runsText', () => {
  it('reads the flat style/text form', () => {
    expect(runsText(['normal', 'Hello, ', 'emphasized', 'world'])).toBe('Hello, world');
  });

  it('reads the object form', () => {
    expect(runsText([{ style: 'normal', text: 'Hi' }, { text: ' there' }])).toBe('Hi there');
  });

  it('skips runs in the given styles', () => {
    expect(runsText(['input', 'look', 'normal', 'West of House'], ['input'])).toBe('West of House');
    expect(runsText([{ style: 'input', text: 'look' }, { text: 'ok' }], ['input'])).toBe('ok');
  });

  it('handles missing content', () => {
    expect(runsText(undefined)).toBe('');
  });
});

describe('paragraphsToLines', () => {
  it('keeps text, drops blank lines and the trailing prompt', () => {
    expect(paragraphsToLines(OPENING)).toEqual([
      'ZORK I: The Great Underground Empire',
      'Release 119 / Serial number 880429',
      'West of House',
      'You are standing in an open field west of a white house, with a boarded front door.',
      'There is a small mailbox here.',
    ]);
  });

  it('drops the game’s echo of the player’s command', () => {
    expect(paragraphsToLines(OPEN_MAILBOX)).toEqual(['Opening the small mailbox reveals a leaflet.']);
  });

  it('strips a prompt at the end of the last line', () => {
    expect(
      paragraphsToLines([
        { content: ['normal', 'This gives you the rank of Beginner.'] },
        { content: ['normal', 'Do you wish to leave the game? (Y is affirmative): >'] },
      ]),
    ).toEqual(['This gives you the rank of Beginner.', 'Do you wish to leave the game? (Y is affirmative):']);
  });

  it('returns nothing for an update that is only echo and prompt', () => {
    expect(paragraphsToLines([{ content: ['input', 'z'], append: true }, {}, { content: ['normal', '>'] }])).toEqual([]);
  });
});

describe('statusFromGrid', () => {
  it('splits location from score and turns', () => {
    const status = statusFromGrid([
      { line: 0, content: ['normal', ' West of House                                               Score: 0  Turns: 0 '] },
    ]);
    expect(status).toEqual({ location: 'West of House', detail: 'Score: 0  Turns: 0' });
  });

  it('copes with a location and no detail', () => {
    expect(statusFromGrid([{ line: 0, content: ['normal', ' Forest '] }])).toEqual({ location: 'Forest', detail: '' });
  });

  it('ignores updates without line 0, or with a blank line', () => {
    expect(statusFromGrid([{ line: 1, content: ['normal', 'x'] }])).toBeNull();
    expect(statusFromGrid([{ line: 0, content: ['normal', '     '] }])).toBeNull();
    expect(statusFromGrid(undefined)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run tests/zmachine/format.test.ts`
Expected: FAIL, `Failed to resolve import "@/zmachine/format"`.

- [ ] **Step 4: Implement**

`src/zmachine/format.ts`:

```ts
import type { GlkGridLine, GlkParagraph, GlkRuns, StatusLine } from './types';

/** The text of a run list, leaving out runs in any of the given styles. */
export function runsText(runs: GlkRuns | undefined, skip: readonly string[] = []): string {
  if (!runs) return '';
  let out = '';
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (typeof run === 'string') {
      // The flat form alternates style and text: ['normal', 'Hello', 'input', 'look'].
      const text = runs[i + 1];
      i++;
      if (typeof text === 'string' && !skip.includes(run)) out += text;
    } else if (!skip.includes(run.style ?? 'normal')) {
      out += run.text;
    }
  }
  return out;
}

const PROMPT_AT_END = /\s*>\s*$/;

/**
 * Buffer-window paragraphs as terminal lines. The game's echo of the
 * player's command (style "input") is dropped, because the terminal echoes
 * input itself; so are blank lines, and the ">" prompt the game prints
 * before waiting, on its own line or at the end of the last one.
 */
export function paragraphsToLines(paragraphs: readonly GlkParagraph[]): string[] {
  const lines = paragraphs.map((p) => runsText(p.content, ['input'])).filter((t) => t.trim() !== '');
  const last = lines.length - 1;
  if (last >= 0 && PROMPT_AT_END.test(lines[last])) {
    const trimmed = lines[last].replace(PROMPT_AT_END, '');
    if (trimmed.trim() === '') lines.pop();
    else lines[last] = trimmed;
  }
  return lines;
}

/** The status line from the top grid window: location on the left, score or time on the right. */
export function statusFromGrid(lines: readonly GlkGridLine[] | undefined): StatusLine | null {
  const top = lines?.find((l) => l.line === 0);
  if (!top) return null;
  const text = runsText(top.content).trim();
  if (text === '') return null;
  const m = text.match(/^(.*?)\s{2,}(\S.*)$/);
  if (!m) return { location: text, detail: '' };
  return { location: m[1], detail: m[2].replace(/\s{2,}/g, '  ') };
}
```

- [ ] **Step 5: Run to see it pass**

Run: `npx vitest run tests/zmachine/format.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add src/zmachine/types.ts src/zmachine/format.ts tests/zmachine/format.test.ts
git commit -m "Z-machine: protocol types, and turning game output into terminal lines"
```

---

### Task 3: BrowserGlkOte

**Files:**
- Create: `src/zmachine/glkote.ts`
- Test: `tests/zmachine/glkote.test.ts`

**Interfaces:**
- Consumes: `paragraphsToLines`, `statusFromGrid`, types from Task 2.
- Produces: `class BrowserGlkOte(handlers: GlkOteHandlers)` with `init(iface)`, `update(data: GlkUpdate, restored?: { windows: GlkWindow[] })`, `sendLine(text: string)`, `sendFile(ref: unknown)`, `save_allstate(): { windows: GlkWindow[] }`, `getinterface()`, `log()`, `warning(m)`, `error(m)`. `interface GlkOteHandlers { onLines(lines: string[]); onStatus(s: StatusLine); onInput(kind: 'line' | 'char'); onFilePrompt(p: FilePrompt); onExit(); onError(message: string) }`. `export const METRICS`.

- [ ] **Step 1: Write the failing tests**

`tests/zmachine/glkote.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserGlkOte, METRICS, type GlkOteHandlers } from '@/zmachine/glkote';
import type { GlkUpdate } from '@/zmachine/types';

const WINDOWS = [
  { id: 104, rock: 202, type: 'grid' as const, gridwidth: 80, gridheight: 1 },
  { id: 102, rock: 201, type: 'buffer' as const },
];

function setup() {
  const handlers: GlkOteHandlers = {
    onLines: vi.fn(),
    onStatus: vi.fn(),
    onInput: vi.fn(),
    onFilePrompt: vi.fn(),
    onExit: vi.fn(),
    onError: vi.fn(),
  };
  const accept = vi.fn();
  const glkote = new BrowserGlkOte(handlers);
  glkote.init({ accept });
  return { glkote, handlers, accept };
}

function turn(gen: number, extra: Partial<GlkUpdate> = {}): GlkUpdate {
  return {
    type: 'update',
    gen,
    windows: gen === 1 ? WINDOWS : null,
    content: [
      { id: 104, lines: [{ line: 0, content: ['normal', ' West of House     Score: 0  Turns: 1 '] }] },
      { id: 102, text: [{ content: ['input', 'look'], append: true }, { content: ['normal', 'West of House'] }, { content: ['normal', '>'] }] },
    ],
    input: [{ id: 102, type: 'line', gen, maxlen: 119 }],
    ...extra,
  };
}

describe('BrowserGlkOte', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends init with console metrics after init()', () => {
    const { accept } = setup();
    expect(accept).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(accept).toHaveBeenCalledWith({ type: 'init', gen: 0, metrics: METRICS, support: [] });
  });

  it('turns buffer text into lines and the grid into the status line', () => {
    const { glkote, handlers } = setup();
    glkote.update(turn(1));
    expect(handlers.onLines).toHaveBeenCalledWith(['West of House']);
    expect(handlers.onStatus).toHaveBeenCalledWith({ location: 'West of House', detail: 'Score: 0  Turns: 1' });
    expect(handlers.onInput).toHaveBeenCalledWith('line');
  });

  it('sends a line event for the pending input, once', () => {
    const { glkote, accept } = setup();
    vi.runAllTimers();
    glkote.update(turn(1));
    glkote.sendLine('open mailbox');
    glkote.sendLine('ignored: nothing is pending now');
    vi.runAllTimers();
    expect(accept).toHaveBeenLastCalledWith({ type: 'line', gen: 1, window: 102, value: 'open mailbox' });
    expect(accept).toHaveBeenCalledTimes(2);
  });

  it('answers char input with the first character, or Enter', () => {
    const { glkote, accept } = setup();
    glkote.update(turn(1, { input: [{ id: 102, type: 'char', gen: 1 }] }));
    glkote.sendLine('yes');
    glkote.update(turn(2, { input: [{ id: 102, type: 'char', gen: 2 }] }));
    glkote.sendLine('');
    vi.runAllTimers();
    expect(accept).toHaveBeenCalledWith({ type: 'char', gen: 1, window: 102, value: 'y' });
    expect(accept).toHaveBeenCalledWith({ type: 'char', gen: 2, window: 102, value: 'return' });
  });

  it('ignores stale or repeated generations', () => {
    const { glkote, handlers } = setup();
    glkote.update(turn(2));
    glkote.update(turn(2));
    glkote.update(turn(1));
    expect(handlers.onLines).toHaveBeenCalledTimes(1);
  });

  it('after an autorestore, skips the replayed transcript but keeps status and input', () => {
    const { glkote, handlers } = setup();
    // The restored update carries no window list: it comes from the saved display state.
    glkote.update({ ...turn(7), windows: null }, { windows: WINDOWS });
    expect(handlers.onLines).not.toHaveBeenCalled();
    expect(handlers.onStatus).toHaveBeenCalled();
    expect(handlers.onInput).toHaveBeenCalledWith('line');
    glkote.update(turn(8));
    expect(handlers.onLines).toHaveBeenCalledWith(['West of House']);
  });

  it('reports a save/restore prompt and sends the answer', () => {
    const { glkote, handlers, accept } = setup();
    const prompt = { type: 'fileref_prompt' as const, filemode: 'write' as const, filetype: 'save', gameid: 'abc' };
    glkote.update(turn(1, { input: [], specialinput: prompt }));
    expect(handlers.onFilePrompt).toHaveBeenCalledWith(prompt);
    expect(handlers.onInput).not.toHaveBeenCalled();
    glkote.sendFile({ filename: 'slot1' });
    vi.runAllTimers();
    expect(accept).toHaveBeenLastCalledWith({ type: 'specialresponse', gen: 1, response: 'fileref_prompt', value: { filename: 'slot1' } });
  });

  it('shows the last text, then reports the end of the game', () => {
    const { glkote, handlers } = setup();
    glkote.update(turn(1));
    glkote.update({ type: 'exit', gen: 2, disable: true, input: [], content: [{ id: 102, text: [{ content: ['normal', 'Goodbye.'] }] }] });
    expect(handlers.onLines).toHaveBeenLastCalledWith(['Goodbye.']);
    expect(handlers.onExit).toHaveBeenCalled();
    glkote.sendLine('anything');
    expect(handlers.onInput).toHaveBeenCalledTimes(1);
  });

  it('reports errors', () => {
    const { glkote, handlers } = setup();
    glkote.update({ type: 'error', message: 'boom' });
    glkote.error('bang');
    expect(handlers.onError).toHaveBeenCalledWith('boom');
    expect(handlers.onError).toHaveBeenCalledWith('bang');
  });

  it('saves its window list for autosaves', () => {
    const { glkote } = setup();
    glkote.update(turn(1));
    expect(glkote.save_allstate()).toEqual({ windows: WINDOWS });
    expect(glkote.getinterface()).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/zmachine/glkote.test.ts`
Expected: FAIL, `Failed to resolve import "@/zmachine/glkote"`.

- [ ] **Step 3: Implement**

`src/zmachine/glkote.ts`:

```ts
import { paragraphsToLines, statusFromGrid } from './format';
import type { FilePrompt, GlkUpdate, GlkWindow, StatusLine } from './types';

export interface GlkOteHandlers {
  onLines(lines: string[]): void;
  onStatus(status: StatusLine): void;
  /** The game is waiting for input of this kind. */
  onInput(kind: 'line' | 'char'): void;
  onFilePrompt(prompt: FilePrompt): void;
  onExit(): void;
  onError(message: string): void;
}

/** What glkapi hands to GlkOte.init. */
export interface GlkInterface {
  accept(event: Record<string, unknown>): void;
}

/** The terminal is a text console: one "pixel" is one character cell. */
export const METRICS = {
  buffercharheight: 1,
  buffercharwidth: 1,
  buffermarginx: 0,
  buffermarginy: 0,
  graphicsmarginx: 0,
  graphicsmarginy: 0,
  gridcharheight: 1,
  gridcharwidth: 1,
  gridmarginx: 0,
  gridmarginy: 0,
  height: 25,
  inspacingx: 0,
  inspacingy: 0,
  outspacingx: 0,
  outspacingy: 0,
  width: 80,
};

interface SavedDisplay {
  windows: GlkWindow[];
}

/**
 * A GlkOte for Brass Lantern's terminal. glkapi calls update() with display
 * changes; this turns buffer-window text into terminal lines and the top
 * grid window into the status line, and sends the player's input back.
 * Protocol: https://eblong.com/zarf/glk/glkote/docs.html
 */
export class BrowserGlkOte {
  private iface: GlkInterface | null = null;
  private gen = 0;
  private readonly windows = new Map<number, GlkWindow>();
  private input: { window: number; kind: 'line' | 'char' } | null = null;

  constructor(private readonly handlers: GlkOteHandlers) {}

  init(iface: GlkInterface): void {
    this.iface = iface;
    this.send({ type: 'init', gen: 0, metrics: METRICS, support: [] });
  }

  getinterface(): GlkInterface | null {
    return this.iface;
  }

  update(data: GlkUpdate, restored?: SavedDisplay): void {
    if (data.type === 'error') {
      this.handlers.onError(data.message ?? 'Unknown error');
      return;
    }
    if (data.type !== 'update' && data.type !== 'exit') return;
    if (data.gen === undefined || data.gen <= this.gen) return;
    this.gen = data.gen;

    for (const w of restored?.windows ?? []) this.windows.set(w.id, w);
    for (const w of data.windows ?? []) this.windows.set(w.id, w);

    for (const c of data.content ?? []) {
      if (this.windows.get(c.id)?.type === 'grid') {
        const status = statusFromGrid(c.lines);
        if (status) this.handlers.onStatus(status);
      } else if (c.text && !restored) {
        // After an autorestore the first update replays the old transcript,
        // which the terminal already has.
        const lines = paragraphsToLines(c.text);
        if (lines.length > 0) this.handlers.onLines(lines);
      }
    }

    if (data.type === 'exit') {
      this.input = null;
      this.handlers.onExit();
      return;
    }
    if (data.specialinput?.type === 'fileref_prompt') {
      this.input = null;
      this.handlers.onFilePrompt(data.specialinput);
      return;
    }
    const request = data.input?.find((i) => i.type === 'line' || i.type === 'char');
    this.input = request ? { window: request.id, kind: request.type } : null;
    if (request) this.handlers.onInput(request.type);
  }

  /** Send the player's command. Char input takes the first character, or Enter for an empty line. */
  sendLine(text: string): void {
    if (!this.input) return;
    const { window, kind } = this.input;
    this.input = null;
    if (kind === 'char') {
      this.send({ type: 'char', gen: this.gen, window, value: text.length > 0 ? text[0] : 'return' });
    } else {
      this.send({ type: 'line', gen: this.gen, window, value: text });
    }
  }

  /** Answer a save or restore prompt with a file reference, or null to cancel. */
  sendFile(ref: unknown): void {
    this.send({ type: 'specialresponse', gen: this.gen, response: 'fileref_prompt', value: ref });
  }

  /** Display state for autosaves; glkapi hands it back to update() after an autorestore. */
  save_allstate(): SavedDisplay {
    return { windows: [...this.windows.values()] };
  }

  log(): void {}

  warning(message: string): void {
    console.warn('[z-machine]', message);
  }

  error(message: string): void {
    this.handlers.onError(message);
  }

  /** glkapi expects replies after its current update has returned. */
  private send(event: Record<string, unknown>): void {
    setTimeout(() => this.iface?.accept(event), 0);
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run tests/zmachine/glkote.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/zmachine/glkote.ts tests/zmachine/glkote.test.ts
git commit -m "Z-machine: BrowserGlkOte, the display layer for the terminal"
```

---

### Task 4: LocalStorageDialog

**Files:**
- Create: `src/zmachine/dialog.ts`
- Test: `tests/zmachine/dialog.test.ts`

**Interfaces:**
- Produces: `interface FileRef { filename: string; usage: string; gameid: string; dirent: string }`; `class LocalStorageDialog(prefix: string, storage?: Storage | null)` with `streaming: false`, `isAvailable(): boolean`, `file_construct_ref(filename, usage?, gameid?): FileRef`, `file_construct_temp_ref(usage): FileRef`, `file_clean_fixed_name(name): string`, `file_ref_exists(ref): boolean`, `file_remove_ref(ref): void`, `file_read(ref): number[] | null`, `file_write(ref, content, israw?): boolean`, `listSaves(gameid): string[]`, `autosave_read(signature): unknown`, `autosave_write(signature, snapshot): void`.

- [ ] **Step 1: Write the failing tests**

`tests/zmachine/dialog.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageDialog } from '@/zmachine/dialog';

/** A Storage whose writes always fail, like a full or locked-down localStorage. */
function brokenStorage(): Storage {
  return {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
    clear: () => {},
  };
}

describe('LocalStorageDialog', () => {
  beforeEach(() => localStorage.clear());

  it('builds refs with a cleaned name under its prefix', () => {
    const d = new LocalStorageDialog('test');
    const ref = d.file_construct_ref('my/save!', 'save', 'game1');
    expect(ref).toEqual({ filename: 'mysave', usage: 'save', gameid: 'game1', dirent: 'test:z:file:save:game1:mysave' });
    expect(d.file_clean_fixed_name('   ')).toBe('save');
  });

  it('writes and reads files as byte arrays', () => {
    const d = new LocalStorageDialog('test');
    const ref = d.file_construct_ref('slot', 'save', 'g');
    expect(d.file_ref_exists(ref)).toBe(false);
    expect(d.file_write(ref, new Uint8Array([1, 2, 3]))).toBe(true);
    expect(d.file_ref_exists(ref)).toBe(true);
    expect(d.file_read(ref)).toEqual([1, 2, 3]);
    d.file_remove_ref(ref);
    expect(d.file_read(ref)).toBeNull();
  });

  it('creates an empty file for a raw write', () => {
    const d = new LocalStorageDialog('test');
    const ref = d.file_construct_ref('slot', 'save', 'g');
    d.file_write(ref, '', true);
    expect(d.file_read(ref)).toEqual([]);
  });

  it('treats unreadable contents as missing', () => {
    const d = new LocalStorageDialog('test');
    const ref = d.file_construct_ref('slot', 'save', 'g');
    localStorage.setItem(ref.dirent, 'not json');
    expect(d.file_read(ref)).toBeNull();
    localStorage.setItem(ref.dirent, '{"a":1}');
    expect(d.file_read(ref)).toBeNull();
  });

  it('makes distinct temp refs', () => {
    const d = new LocalStorageDialog('test');
    expect(d.file_construct_temp_ref('data').dirent).not.toBe(d.file_construct_temp_ref('data').dirent);
  });

  it('lists only this game’s saves, sorted', () => {
    const d = new LocalStorageDialog('test');
    d.file_write(d.file_construct_ref('zeta', 'save', 'g1'), [1]);
    d.file_write(d.file_construct_ref('alpha', 'save', 'g1'), [1]);
    d.file_write(d.file_construct_ref('other', 'save', 'g2'), [1]);
    d.file_write(d.file_construct_ref('notes', 'data', 'g1'), [1]);
    expect(d.listSaves('g1')).toEqual(['alpha', 'zeta']);
  });

  it('stores, reads and clears autosaves', () => {
    const d = new LocalStorageDialog('test');
    d.autosave_write('sig', { ram: [1, 2] });
    expect(d.autosave_read('sig')).toEqual({ ram: [1, 2] });
    d.autosave_write('sig', null);
    expect(d.autosave_read('sig')).toBeNull();
    localStorage.setItem('test:z:auto:sig', '{bad');
    expect(d.autosave_read('sig')).toBeNull();
  });

  it('never throws when storage fails, and says it isn’t available', () => {
    const d = new LocalStorageDialog('test', brokenStorage());
    const ref = d.file_construct_ref('slot', 'save', 'g');
    expect(d.isAvailable()).toBe(false);
    expect(d.file_write(ref, [1])).toBe(false);
    expect(() => d.file_remove_ref(ref)).not.toThrow();
    expect(() => d.autosave_write('sig', { a: 1 })).not.toThrow();
    expect(() => d.autosave_write('sig', null)).not.toThrow();
  });

  it('works without storage at all', () => {
    const d = new LocalStorageDialog('test', null);
    const ref = d.file_construct_ref('slot', 'save', 'g');
    expect(d.isAvailable()).toBe(false);
    expect(d.file_read(ref)).toBeNull();
    expect(d.file_write(ref, [1])).toBe(false);
    expect(d.listSaves('g')).toEqual([]);
    expect(d.autosave_read('sig')).toBeNull();
  });

  it('is available with working localStorage', () => {
    expect(new LocalStorageDialog('test').isAvailable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/zmachine/dialog.test.ts`
Expected: FAIL, `Failed to resolve import "@/zmachine/dialog"`.

- [ ] **Step 3: Implement**

`src/zmachine/dialog.ts`:

```ts
/** A file reference, as glkapi passes it back to us. */
export interface FileRef {
  filename: string;
  usage: string;
  gameid: string;
  dirent: string;
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Glk's file layer, kept in localStorage. Non-streaming: glkapi reads and
 * writes whole files, which we store as JSON byte arrays. Also holds
 * ifvms's per-turn autosave. Every method swallows storage errors: a full
 * or blocked localStorage costs persistence, never the game.
 */
export class LocalStorageDialog {
  readonly streaming = false;

  constructor(
    private readonly prefix: string,
    private readonly storage: Storage | null = defaultStorage(),
  ) {}

  /** Can we actually write? (False in some private modes, or when full.) */
  isAvailable(): boolean {
    const probe = this.key('probe');
    if (!this.write(probe, '1')) return false;
    try {
      this.storage?.removeItem(probe);
    } catch {
      return false;
    }
    return true;
  }

  file_construct_ref(filename: string, usage = '', gameid = ''): FileRef {
    const name = this.file_clean_fixed_name(filename);
    return { filename: name, usage, gameid, dirent: this.key('file', usage, gameid, name) };
  }

  file_construct_temp_ref(usage: string): FileRef {
    return this.file_construct_ref(`temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, usage);
  }

  file_clean_fixed_name(name: string): string {
    return String(name ?? '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 40) || 'save';
  }

  file_ref_exists(ref: FileRef): boolean {
    return this.read(ref.dirent) !== null;
  }

  file_remove_ref(ref: FileRef): void {
    try {
      this.storage?.removeItem(ref.dirent);
    } catch {
      // Nothing to do.
    }
  }

  file_read(ref: FileRef): number[] | null {
    const raw = this.read(ref.dirent);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? (value as number[]) : null;
    } catch {
      return null;
    }
  }

  /** `israw` with a string means "create an empty file". Returns whether it was stored. */
  file_write(ref: FileRef, content: ArrayLike<number> | string, israw?: boolean): boolean {
    const bytes = israw || typeof content === 'string' ? [] : Array.from(content);
    return this.write(ref.dirent, JSON.stringify(bytes));
  }

  /** Names of this game's saved games, sorted. */
  listSaves(gameid: string): string[] {
    const storage = this.storage;
    if (!storage) return [];
    const start = this.key('file', 'save', gameid, '');
    const names: string[] = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(start)) names.push(k.slice(start.length));
      }
    } catch {
      return [];
    }
    return names.sort();
  }

  autosave_read(signature: string): unknown {
    const raw = this.read(this.key('auto', signature));
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  autosave_write(signature: string, snapshot: unknown): void {
    const k = this.key('auto', signature);
    if (snapshot == null) {
      try {
        this.storage?.removeItem(k);
      } catch {
        // Nothing to do.
      }
      return;
    }
    this.write(k, JSON.stringify(snapshot));
  }

  private key(...parts: string[]): string {
    return [this.prefix, 'z', ...parts].join(':');
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run tests/zmachine/dialog.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/zmachine/dialog.ts tests/zmachine/dialog.test.ts
git commit -m "Z-machine: saved games and autosaves in localStorage"
```

---

### Task 5: ZMachineSession

**Files:**
- Create: `src/zmachine/session.ts`
- Test: `tests/zmachine/session.test.ts`

**Interfaces:**
- Consumes: `createGlk` (Task 1), `BrowserGlkOte` (Task 3), `LocalStorageDialog` (Task 4), `FilePrompt`, `StatusLine` (Task 2).
- Produces: `interface SessionEvents { onLines(lines: string[]); onStatus(s: StatusLine); onWaiting(); onExit(); onError(message: string) }`; `class ZMachineSession(story: Uint8Array, dialog: LocalStorageDialog, events: SessionEvents)` with `start(): void` and `submit(text: string): void`.

- [ ] **Step 1: Write the failing tests**

`tests/zmachine/session.test.ts` (real Zork I, real timers):

```ts
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { ZMachineSession } from '@/zmachine/session';
import type { StatusLine } from '@/zmachine/types';

const story = new Uint8Array(readFileSync(new URL('../fixtures/zork1.z3', import.meta.url)));

async function waitFor(check: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for the game');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A session plus a transcript, and type() to play a turn and get its output. */
function harness(dialog = new LocalStorageDialog('test')) {
  const lines: string[] = [];
  const state = { waiting: false, exited: false, status: null as StatusLine | null, errors: [] as string[] };
  const session = new ZMachineSession(story, dialog, {
    onLines: (l) => lines.push(...l),
    onStatus: (s) => {
      state.status = s;
    },
    onWaiting: () => {
      state.waiting = true;
    },
    onExit: () => {
      state.exited = true;
    },
    onError: (m) => state.errors.push(m),
  });
  async function type(command: string): Promise<string> {
    await waitFor(() => state.waiting);
    state.waiting = false;
    const from = lines.length;
    session.submit(command);
    await waitFor(() => state.waiting || state.exited);
    return lines.slice(from).join('\n');
  }
  return { session, lines, state, type, dialog };
}

describe('ZMachineSession with Zork I', () => {
  beforeEach(() => localStorage.clear());

  it('boots, shows the status line, and plays a turn without echo or prompt', async () => {
    const h = harness();
    h.session.start();
    await waitFor(() => h.state.waiting);
    expect(h.lines).toContain('West of House');
    expect(h.state.status).toEqual({ location: 'West of House', detail: 'Score: 0  Turns: 0' });
    const out = await h.type('open mailbox');
    expect(out).toBe('Opening the small mailbox reveals a leaflet.');
    expect(h.state.status?.detail).toBe('Score: 0  Turns: 1');
  });

  it('saves under a name and restores it', async () => {
    const h = harness();
    h.session.start();
    expect(await h.type('save')).toContain('[Save as? Type a name, or CANCEL.]');
    expect(await h.type('before leaflet')).toContain('Ok.');
    await h.type('open mailbox');
    expect(await h.type('take leaflet')).toContain('Taken.');
    expect(await h.type('restore')).toContain('[Restore which save? before leaflet. Or CANCEL.]');
    expect(await h.type('before leaflet')).toContain('Ok.');
    expect(await h.type('inventory')).toContain('You are empty-handed.');
  });

  it('says so when there is nothing to restore', async () => {
    const h = harness();
    h.session.start();
    const out = await h.type('restore');
    expect(out).toContain('[There are no saved games yet.]');
    expect(out).toContain('Failed.');
  });

  it('fails cleanly on a misspelled save name, and on CANCEL', async () => {
    const h = harness();
    h.session.start();
    await h.type('save');
    await h.type('real one');
    await h.type('restore');
    expect(await h.type('rael one')).toContain('Failed.');
    await h.type('save');
    expect(await h.type('cancel')).toContain('Failed.');
    expect(await h.type('look')).toContain('West of House');
  });

  it('refuses to save when storage is unavailable, and keeps playing', async () => {
    const h = harness(new LocalStorageDialog('test', null));
    h.session.start();
    const out = await h.type('save');
    expect(out).toContain('[Saving isn’t available in this browser.]');
    expect(out).toContain('Failed.');
    expect(await h.type('open mailbox')).toContain('reveals a leaflet');
  });

  it('autosaves every turn, and a new session resumes without replaying', async () => {
    const dialog = new LocalStorageDialog('test');
    const first = harness(dialog);
    first.session.start();
    await first.type('open mailbox');
    await first.type('take leaflet');

    const second = harness(dialog);
    second.session.start();
    await waitFor(() => second.state.waiting);
    expect(second.lines).toEqual([]);
    expect(second.state.status?.detail).toBe('Score: 0  Turns: 2');
    expect(await second.type('inventory')).toContain('leaflet');
  });

  it('ends on QUIT, and clears the autosave', async () => {
    const h = harness();
    h.session.start();
    await h.type('open mailbox');
    expect(await h.type('quit')).toContain('Do you wish to leave the game? (Y is affirmative):');
    await h.type('y');
    expect(h.state.exited).toBe(true);
    const autosaves = Object.keys(localStorage).filter((k) => k.includes(':z:auto:'));
    expect(autosaves).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/zmachine/session.test.ts`
Expected: FAIL, `Failed to resolve import "@/zmachine/session"`.

- [ ] **Step 3: Implement**

`src/zmachine/session.ts`:

```ts
import ifvms from 'ifvms';
import ZVMDispatch from 'ifvms/src/zvm/dispatch.js';
import { createGlk } from './vendor/glkapi.js';
import { BrowserGlkOte } from './glkote';
import type { LocalStorageDialog } from './dialog';
import type { FilePrompt, StatusLine } from './types';

export interface SessionEvents {
  onLines(lines: string[]): void;
  onStatus(status: StatusLine): void;
  /** Ready for the player's next input: a command, or a save name. */
  onWaiting(): void;
  onExit(): void;
  onError(message: string): void;
}

/**
 * One running story file: a fresh Glk instance, VM and dispatcher, wired to
 * the terminal through BrowserGlkOte. Autosaves every turn, and resumes from
 * the autosave when a session for the same story starts again.
 */
export class ZMachineSession {
  private readonly glkote: BrowserGlkOte;
  private filePrompt: FilePrompt | null = null;

  constructor(
    private readonly story: Uint8Array,
    private readonly dialog: LocalStorageDialog,
    private readonly events: SessionEvents,
  ) {
    this.glkote = new BrowserGlkOte({
      onLines: (lines) => events.onLines(lines),
      onStatus: (status) => events.onStatus(status),
      onInput: () => events.onWaiting(),
      onFilePrompt: (prompt) => this.askForFile(prompt),
      onExit: () => events.onExit(),
      onError: (message) => events.onError(message),
    });
  }

  start(): void {
    const Glk = createGlk();
    const vm = new ifvms.ZVM();
    const options = {
      vm,
      Glk,
      GlkOte: this.glkote,
      Dialog: this.dialog,
      GiDispa: new ZVMDispatch(),
      do_vm_autosave: true,
    };
    // ifvms uses the buffer it's given as game memory, which changes the
    // game's signature. A fresh copy per session keeps saves matching.
    vm.prepare(new Uint8Array(this.story), options);
    Glk.init(options);
  }

  /** The player's input: a command, or the answer to a save or restore prompt. */
  submit(text: string): void {
    if (this.filePrompt) this.answerFile(text);
    else this.glkote.sendLine(text);
  }

  private askForFile(prompt: FilePrompt): void {
    this.filePrompt = prompt;
    if (prompt.filemode === 'read') {
      const saves = this.dialog.listSaves(prompt.gameid ?? '');
      if (saves.length === 0) {
        this.events.onLines(['[There are no saved games yet.]']);
        this.answerFile(null);
        return;
      }
      this.events.onLines([`[Restore which save? ${saves.join(', ')}. Or CANCEL.]`]);
    } else {
      if (!this.dialog.isAvailable()) {
        this.events.onLines(['[Saving isn’t available in this browser.]']);
        this.answerFile(null);
        return;
      }
      this.events.onLines(['[Save as? Type a name, or CANCEL.]']);
    }
    this.events.onWaiting();
  }

  private answerFile(text: string | null): void {
    const prompt = this.filePrompt;
    this.filePrompt = null;
    const name = text?.trim() ?? '';
    if (!prompt || name === '' || name.toLowerCase() === 'cancel') {
      this.glkote.sendFile(null);
      return;
    }
    this.glkote.sendFile(this.dialog.file_construct_ref(name, prompt.filetype, prompt.gameid ?? ''));
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run tests/zmachine/session.test.ts`
Expected: PASS, 7 tests. If “ends on QUIT” leaves an autosave key, confirm glkapi’s `do_autosave(-1)` path ran (it requires `do_vm_autosave` and `GiDispa`), and fix by passing them, not by deleting keys in the test.

- [ ] **Step 5: Commit**

```bash
git add src/zmachine/session.ts tests/zmachine/session.test.ts
git commit -m "Z-machine: sessions with SAVE/RESTORE prompts and per-turn autosave"
```

---

### Task 6: Cartridges, and a per-cartridge native store

**Files:**
- Create: `src/types/cartridge.ts`, `src/cartridges.ts`, `src/services/cookies.ts`
- Modify: `src/app.config.ts`, `src/services/persistence.ts`, `src/stores/game.ts`, `src/App.vue`, `tests/fixtures/world.ts`
- Test: `tests/cartridges.test.ts`, additions to `tests/stores/game.test.ts`

**Interfaces:**
- Produces (types): `WorldCartridge { kind: 'world'; id; title; world: World; saveKey?: string }`, `ZCodeCartridge { kind: 'zcode'; id; title; story: string; format: string }`, `type Cartridge = WorldCartridge | ZCodeCartridge`.
- Produces (`src/cartridges.ts`): `saveKeyFor(c: WorldCartridge): string`, `transcriptKey(id: string): string`, `hasProgress(c: Cartridge): boolean`, `autoBootCartridge(): Cartridge | null`, `defaultWorldCartridge(): WorldCartridge | undefined`, `menuLines(): string[]`, `LAST_CARTRIDGE_KEY: string`.
- Produces: `cookiesCommand(): string` from `@/services/cookies`; `createPersistenceService(key?: string)`; `useGameStore().initialize(cartridge?: WorldCartridge)`.
- `src/app.config.ts` exports `cartridges: Cartridge[]`, `appName`, `storagePrefix` (no longer `world`).

- [ ] **Step 1: Cartridge types**

`src/types/cartridge.ts`:

```ts
import type { World } from './world';

/** A native Brass Lantern world. */
export interface WorldCartridge {
  kind: 'world';
  id: string;
  title: string;
  world: World;
  /** Where its save lives. Defaults to `<storagePrefix>:save:<id>`. */
  saveKey?: string;
}

/** A Z-machine story file. */
export interface ZCodeCartridge {
  kind: 'zcode';
  id: string;
  title: string;
  /** The story file's URL, relative to the site's base (e.g. "stories/zork1.z3"). */
  story: string;
  /** Shown in the menu, e.g. "Z-machine v3". */
  format: string;
}

export type Cartridge = WorldCartridge | ZCodeCartridge;
```

- [ ] **Step 2: The app config offers cartridges**

`src/app.config.ts` (replace the file):

```ts
// Everything that makes this build *this* game collection rather than the
// engine. The rest of src/ is world-agnostic.
import type { Cartridge } from '@/types/cartridge';
import { tutorial } from '@/worlds/tutorial';

/** What the cartridge menu offers. With one cartridge, the terminal boots straight into it. */
export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial },
  // Zork I, Release 119. Source and story file released under the MIT License by Microsoft (2025).
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
];

/** Shown in the terminal header. */
export const appName = 'BRASS LANTERN';

/** Namespaces saves, consent and analytics IDs in localStorage. */
export const storagePrefix = 'brass-lantern';
```

In `tests/fixtures/world.ts`, replace `fixtureConfig` with:

```ts
/** Drop-in replacement for src/app.config.ts in tests: vi.mock('@/app.config', () => fixtureConfig). */
export const fixtureConfig = {
  cartridges: [{ kind: 'world' as const, id: 'test', title: 'TEST HOUSE', world: fixtureWorld, saveKey: 'test:save' }],
  appName: 'TEST TERMINAL',
  storagePrefix: 'test',
};
```

- [ ] **Step 3: Write the failing tests for the cartridge helpers**

`tests/cartridges.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app.config', async () => {
  const { fixtureWorld } = await import('./fixtures/world');
  return {
    appName: 'TEST TERMINAL',
    storagePrefix: 'test',
    cartridges: [
      { kind: 'world', id: 'house', title: 'TEST HOUSE', world: fixtureWorld },
      { kind: 'zcode', id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' },
    ],
  };
});

const {
  autoBootCartridge,
  defaultWorldCartridge,
  hasProgress,
  LAST_CARTRIDGE_KEY,
  menuLines,
  saveKeyFor,
  transcriptKey,
} = await import('@/cartridges');
const { cartridges } = await import('@/app.config');

describe('cartridges', () => {
  beforeEach(() => localStorage.clear());

  it('derives storage keys', () => {
    expect(saveKeyFor(cartridges[0] as never)).toBe('test:save:house');
    expect(saveKeyFor({ ...(cartridges[0] as never), saveKey: 'custom' })).toBe('custom');
    expect(transcriptKey('story')).toBe('test:z:story:transcript');
  });

  it('knows which cartridges have a game in progress', () => {
    expect(hasProgress(cartridges[0])).toBe(false);
    localStorage.setItem('test:save:house', '{}');
    expect(hasProgress(cartridges[0])).toBe(true);
    localStorage.setItem('test:z:story:transcript', '[]');
    expect(hasProgress(cartridges[1])).toBe(true);
  });

  it('boots straight into the last cartridge only if it has progress', () => {
    expect(autoBootCartridge()).toBeNull();
    localStorage.setItem(LAST_CARTRIDGE_KEY, 'story');
    expect(autoBootCartridge()).toBeNull();
    localStorage.setItem('test:z:story:transcript', '[]');
    expect(autoBootCartridge()?.id).toBe('story');
    localStorage.setItem(LAST_CARTRIDGE_KEY, 'gone');
    expect(autoBootCartridge()).toBeNull();
  });

  it('finds the first native world', () => {
    expect(defaultWorldCartridge()?.id).toBe('house');
  });

  it('lists the cartridges as a numbered menu', () => {
    expect(menuLines()).toEqual([
      '═══════════════════════════════',
      'INSTALLED CARTRIDGES',
      '═══════════════════════════════',
      '  1  TEST HOUSE   native',
      '  2  A STORY      Z-machine v3',
      '[Type a number to insert a cartridge. EJECT brings you back here.]',
    ]);
  });
});
```

- [ ] **Step 4: Run to see it fail**

Run: `npx vitest run tests/cartridges.test.ts`
Expected: FAIL, `Failed to resolve import "@/cartridges"`.

- [ ] **Step 5: Implement the helpers**

`src/cartridges.ts`:

```ts
import { cartridges, storagePrefix } from '@/app.config';
import type { Cartridge, WorldCartridge } from '@/types/cartridge';

/** The cartridge last inserted, so a reload can go straight back to it. */
export const LAST_CARTRIDGE_KEY = `${storagePrefix}:cartridge`;

export function saveKeyFor(c: WorldCartridge): string {
  return c.saveKey ?? `${storagePrefix}:save:${c.id}`;
}

export function transcriptKey(id: string): string {
  return `${storagePrefix}:z:${id}:transcript`;
}

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Is there a game in progress to come back to? */
export function hasProgress(c: Cartridge): boolean {
  return stored(c.kind === 'world' ? saveKeyFor(c) : transcriptKey(c.id)) !== null;
}

/** The cartridge to boot without a menu: the only one, or the last one played if it has progress. */
export function autoBootCartridge(): Cartridge | null {
  if (cartridges.length === 1) return cartridges[0];
  const last = cartridges.find((c) => c.id === stored(LAST_CARTRIDGE_KEY));
  return last && hasProgress(last) ? last : null;
}

export function defaultWorldCartridge(): WorldCartridge | undefined {
  return cartridges.find((c): c is WorldCartridge => c.kind === 'world');
}

export function menuLines(): string[] {
  const width = Math.max(...cartridges.map((c) => c.title.length));
  return [
    '═══════════════════════════════',
    'INSTALLED CARTRIDGES',
    '═══════════════════════════════',
    ...cartridges.map((c, i) => `  ${i + 1}  ${c.title.padEnd(width)}   ${c.kind === 'world' ? 'native' : c.format}`),
    '[Type a number to insert a cartridge. EJECT brings you back here.]',
  ];
}
```

- [ ] **Step 6: Run to see it pass**

Run: `npx vitest run tests/cartridges.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: The COOKIES helper**

`src/services/cookies.ts`:

```ts
import { analyticsConfigured } from './analytics';
import { openConsent } from './consent';

/** The COOKIES command: open the consent banner, or say there's nothing to consent to. */
export function cookiesCommand(): string {
  if (!analyticsConfigured()) return '[This build has no analytics. Nothing is collected.]';
  openConsent();
  return '[Analytics settings opened]';
}
```

- [ ] **Step 8: Persistence takes a key**

In `src/services/persistence.ts`, change the factory signature and use the parameter instead of `SAVE_KEY` in `save`, `load` and `clear`:

```ts
export function createPersistenceService(key: string = SAVE_KEY): PersistenceService {
```

and replace the three uses `storage.setItem(SAVE_KEY, …)`, `storage.getItem(SAVE_KEY)`, `storage.removeItem(SAVE_KEY)` with `key`.

- [ ] **Step 9: The native store plays a given cartridge**

In `src/stores/game.ts`:

1. Replace `import { world } from '@/app.config';` with:

```ts
import type { World } from '@/types/world';
import type { WorldCartridge } from '@/types/cartridge';
import { defaultWorldCartridge, saveKeyFor } from '@/cartridges';
import { cookiesCommand } from '@/services/cookies';
```

2. Replace `const persistence = createPersistenceService();` with:

```ts
/** Used before any world cartridge is inserted, e.g. in a Z-machine-only build. */
const EMPTY_WORLD: World = {
  startRoom: 'nowhere',
  rooms: { nowhere: { name: '', description: '', exits: {}, items: [], npcs: [], onEnter: [] } },
  items: {},
  npcs: {},
  events: {},
  dialogue: {},
  flagLabels: {},
};

const initialCartridge = defaultWorldCartridge();
let world: World = initialCartridge?.world ?? EMPTY_WORLD;
let persistence = createPersistenceService(initialCartridge ? saveKeyFor(initialCartridge) : undefined);
```

3. Replace the start of `initialize` with:

```ts
    initialize(cartridge: WorldCartridge | undefined = defaultWorldCartridge()): void {
      if (!cartridge) throw new Error('There is no world cartridge to play.');
      world = cartridge.world;
      persistence = createPersistenceService(saveKeyFor(cartridge));
      this.$patch({ game: freshGame(), output: [], isParsing: false, restored: false, gameOverTracked: false, lastTarget: null });
      const saved = persistence.load();
```

(the rest of `initialize` is unchanged).

4. Replace the COOKIES branch in `submit` with:

```ts
      if (lower === 'cookies' || lower === 'privacy') {
        this.appendSystem(cookiesCommand());
        return;
      }
```

and remove the now-unused `openConsent` and `analyticsConfigured` imports if lint reports them.

- [ ] **Step 10: App's fast boot follows the cartridge**

In `src/App.vue`, replace the persistence import and `onMounted` body:

```ts
import { autoBootCartridge, hasProgress } from '@/cartridges';
```

```ts
onMounted(() => {
  const c = autoBootCartridge();
  fastBoot.value = c !== null && hasProgress(c);
});
```

- [ ] **Step 11: Store test for switching cartridges**

Append to the `describe('initialize', …)` block in `tests/stores/game.test.ts`:

```ts
    it('plays the cartridge it is given, with that cartridge’s save', async () => {
      const { fixtureWorld } = await import('../fixtures/world');
      const store = freshStore();
      const other = { kind: 'world' as const, id: 'other', title: 'OTHER', world: { ...fixtureWorld, startRoom: 'yard' } };
      store.initialize(other);
      expect(store.game.currentRoom).toBe('yard');
      await store.submit('look');
      expect(localStorage.getItem('test:save:other')).not.toBeNull();
      store.initialize();
      expect(store.game.currentRoom).toBe('bedroom');
    });
```

- [ ] **Step 12: Run everything**

Run: `npm run lint && npm run type-check && npm run test:coverage`
Expected: all pass, coverage thresholds met.

- [ ] **Step 13: Commit**

```bash
git add src/types/cartridge.ts src/cartridges.ts src/services/cookies.ts src/app.config.ts src/services/persistence.ts src/stores/game.ts src/App.vue tests/fixtures/world.ts tests/cartridges.test.ts tests/stores/game.test.ts
git commit -m "Cartridges: the app config lists native worlds and story files

The native store now plays whichever world cartridge it's given, each with
its own save key."
```

---

### Task 7: The zgame store

**Files:**
- Create: `src/stores/zgame.ts`
- Test: `tests/stores/zgame.test.ts`

**Interfaces:**
- Consumes: `ZMachineSession`, `SessionEvents` (Task 5), `LocalStorageDialog` (Task 4), `StatusLine` (Task 2), `ZCodeCartridge`, `transcriptKey` (Task 6), `makeLine`, `track`.
- Produces: `useZGameStore()` with state `{ cartridgeId, output: OutputLine[], status: StatusLine | null, waiting, exited, restored, failed }`, getter `headerStatus: string`, actions `initialize(cart: ZCodeCartridge, overrides?: Partial<ZGameDeps>): Promise<void>`, `submit(raw: string): void`. `interface ZGameDeps { fetchStory(url: string): Promise<Uint8Array>; createSession(story, dialog, events): { start(): void; submit(text: string): void } }`.

- [ ] **Step 1: Write the failing tests**

`tests/stores/zgame.test.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvents } from '@/zmachine/session';

vi.mock('@/app.config', async () => (await import('../fixtures/world')).fixtureConfig);

const { useZGameStore } = await import('@/stores/zgame');

const CART = { kind: 'zcode' as const, id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' };

function fakeDeps(fetchStory: () => Promise<Uint8Array> = async () => new Uint8Array([3])) {
  const sessions: Array<{ start: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn>; events: SessionEvents }> = [];
  return {
    sessions,
    deps: {
      fetchStory: vi.fn(fetchStory),
      createSession: vi.fn((_story: Uint8Array, _dialog: unknown, events: SessionEvents) => {
        const s = { start: vi.fn(), submit: vi.fn(), events };
        sessions.push(s);
        return s;
      }),
    },
  };
}

const texts = (store: ReturnType<typeof useZGameStore>) => store.output.map((l) => l.text);

describe('zgame store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('fetches the story, starts a session and shows its output and status', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    expect(deps.fetchStory).toHaveBeenCalledWith('stories/story.z3');
    expect(sessions[0].start).toHaveBeenCalled();
    sessions[0].events.onLines(['West of House']);
    sessions[0].events.onStatus({ location: 'West of House', detail: 'Score: 0  Turns: 0' });
    expect(texts(store)).toEqual(['West of House']);
    expect(store.headerStatus).toBe('West of House  Score: 0  Turns: 0');
  });

  it('echoes input and passes it on only when the game is waiting', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    store.submit('look');
    expect(sessions[0].submit).not.toHaveBeenCalled();
    sessions[0].events.onWaiting();
    store.submit('  look  ');
    store.submit('   ');
    expect(sessions[0].submit).toHaveBeenCalledTimes(1);
    expect(sessions[0].submit).toHaveBeenCalledWith('look');
    expect(texts(store)).toContain('> look');
  });

  it('keeps a transcript, and restores it instantly next time', async () => {
    const first = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, first.deps);
    first.sessions[0].events.onLines(['West of House']);
    first.sessions[0].events.onWaiting();
    expect(JSON.parse(localStorage.getItem('test:z:story:transcript') ?? '[]')).toHaveLength(1);

    setActivePinia(createPinia());
    const again = useZGameStore();
    const second = fakeDeps();
    await again.initialize(CART, second.deps);
    expect(again.restored).toBe(true);
    expect(texts(again)[0]).toBe('West of House');
    expect(texts(again)).toContain('[Session restored. LOOK to look around.]');
  });

  it('caps the transcript at 500 lines', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    sessions[0].events.onLines(Array.from({ length: 600 }, (_, i) => `line ${i}`));
    sessions[0].events.onWaiting();
    const saved = JSON.parse(localStorage.getItem('test:z:story:transcript') ?? '[]');
    expect(saved).toHaveLength(500);
    expect(saved.at(-1).text).toBe('line 599');
  });

  it('says so when the story won’t download, and starts nothing', async () => {
    const { deps, sessions } = fakeDeps(async () => {
      throw new Error('HTTP 404');
    });
    const store = useZGameStore();
    await store.initialize(CART, deps);
    expect(store.failed).toBe(true);
    expect(sessions).toHaveLength(0);
    expect(texts(store).at(-1)).toContain('wouldn’t load');
  });

  it('on game over: says so, clears the transcript, and PLAY starts again', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    sessions[0].events.onWaiting();
    sessions[0].events.onExit();
    expect(store.exited).toBe(true);
    expect(localStorage.getItem('test:z:story:transcript')).toBeNull();
    expect(texts(store).at(-1)).toBe('[The story has ended. Type PLAY to start again.]');
    store.submit('look');
    expect(sessions).toHaveLength(1);
    store.submit('play');
    expect(sessions).toHaveLength(2);
    expect(sessions[1].start).toHaveBeenCalled();
  });

  it('shows interpreter errors', async () => {
    const { deps, sessions } = fakeDeps();
    const store = useZGameStore();
    await store.initialize(CART, deps);
    sessions[0].events.onError('illegal opcode');
    expect(texts(store).at(-1)).toBe('[The interpreter stopped: illegal opcode]');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/stores/zgame.test.ts`
Expected: FAIL, `Failed to resolve import "@/stores/zgame"`.

- [ ] **Step 3: Implement**

`src/stores/zgame.ts`:

```ts
import { defineStore } from 'pinia';
import type { OutputLine } from '@/types/game';
import type { ZCodeCartridge } from '@/types/cartridge';
import type { StatusLine } from '@/zmachine/types';
import { storagePrefix } from '@/app.config';
import { transcriptKey } from '@/cartridges';
import { makeLine } from '@/engine/output';
import { track } from '@/services/analytics';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { ZMachineSession, type SessionEvents } from '@/zmachine/session';

const MAX_TRANSCRIPT = 500;

interface RunningSession {
  start(): void;
  submit(text: string): void;
}

export interface ZGameDeps {
  fetchStory(url: string): Promise<Uint8Array>;
  createSession(story: Uint8Array, dialog: LocalStorageDialog, events: SessionEvents): RunningSession;
}

const defaultDeps: ZGameDeps = {
  async fetchStory(url) {
    const res = await fetch(`${import.meta.env.BASE_URL}${url}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },
  createSession: (story, dialog, events) => new ZMachineSession(story, dialog, events),
};

// Live objects stay out of Pinia state: they aren't serializable, and the
// store only ever runs one game at a time.
let deps: ZGameDeps = defaultDeps;
let session: RunningSession | null = null;
let story: Uint8Array | null = null;

function loadTranscript(id: string): OutputLine[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(transcriptKey(id)) ?? '[]');
    return Array.isArray(value) ? (value as OutputLine[]) : [];
  } catch {
    return [];
  }
}

function saveTranscript(id: string, lines: OutputLine[]): void {
  try {
    window.localStorage.setItem(transcriptKey(id), JSON.stringify(lines.slice(-MAX_TRANSCRIPT)));
  } catch {
    // A full or blocked localStorage costs the transcript, not the game.
  }
}

function clearTranscript(id: string): void {
  try {
    window.localStorage.removeItem(transcriptKey(id));
  } catch {
    // Nothing to do.
  }
}

const ENDED = '[The story has ended. Type PLAY to start again.]';

export const useZGameStore = defineStore('zgame', {
  state: () => ({
    cartridgeId: '',
    output: [] as OutputLine[],
    status: null as StatusLine | null,
    waiting: false,
    exited: false,
    restored: false,
    failed: false,
  }),

  getters: {
    headerStatus: (s): string => (s.status ? [s.status.location, s.status.detail].filter(Boolean).join('  ') : ''),
  },

  actions: {
    async initialize(cart: ZCodeCartridge, overrides: Partial<ZGameDeps> = {}): Promise<void> {
      deps = { ...defaultDeps, ...overrides };
      session = null;
      story = null;
      this.$patch({ cartridgeId: cart.id, output: [], status: null, waiting: false, exited: false, restored: false, failed: false });

      const transcript = loadTranscript(cart.id);
      if (transcript.length > 0) {
        this.output = transcript;
        this.restored = true;
        this.appendLine('[Session restored. LOOK to look around.]');
      }

      try {
        story = await deps.fetchStory(cart.story);
      } catch {
        this.failed = true;
        this.appendLine('[This cartridge wouldn’t load. Check your connection and reload, or type EJECT.]');
        return;
      }
      this.boot();
      track(this.restored ? 'session_resumed' : 'game_start', { cartridge: cart.id });
    },

    /** Start (or restart) the story. Resumes from the autosave if there is one. */
    boot(): void {
      if (!story) return;
      const dialog = new LocalStorageDialog(storagePrefix);
      session = deps.createSession(story, dialog, {
        onLines: (lines) => {
          for (const line of lines) this.appendLine(line);
        },
        onStatus: (status) => {
          this.status = status;
        },
        onWaiting: () => {
          this.waiting = true;
          saveTranscript(this.cartridgeId, this.output);
        },
        onExit: () => {
          this.exited = true;
          this.waiting = false;
          this.appendLine(ENDED);
          clearTranscript(this.cartridgeId);
        },
        onError: (message) => this.appendLine(`[The interpreter stopped: ${message}]`),
      });
      session.start();
    },

    submit(raw: string): void {
      const input = raw.trim();
      if (!input) return;
      this.output.push(makeLine(`> ${input}`));
      if (this.exited) {
        if (input.toLowerCase() === 'play') {
          this.exited = false;
          this.boot();
        } else {
          this.appendLine(ENDED);
        }
        return;
      }
      if (!session || !this.waiting) return;
      this.waiting = false;
      session.submit(input);
    },

    appendLine(text: string): void {
      this.output.push(makeLine(text));
    },
  },
});
```

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run tests/stores/zgame.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stores/zgame.ts tests/stores/zgame.test.ts
git commit -m "Z-machine: a store that runs a story cartridge, with transcript and game-over handling"
```

---

### Task 8: Cartridge menu store and the session router

**Files:**
- Create: `src/stores/cartridges.ts`, `src/stores/session.ts`
- Test: `tests/stores/session.test.ts`

**Interfaces:**
- Consumes: `cartridges` (app config), `menuLines`, `autoBootCartridge`, `LAST_CARTRIDGE_KEY` (Task 6), `useGameStore` (Task 6), `useZGameStore` (Task 7), `cookiesCommand` (Task 6), `makeLine`.
- Produces: `useCartridgeStore()` (state `activeId`, `output`; getters `active`, `hasMenu`; actions `showMenu()`, `insert(c)`, `choose(input): Cartridge | null`, `eject()`); `useSession()` returning `{ mode, output, isParsing, restored, status, title, boot(), start(c), submit(raw) }`, where `mode` is `'menu' | 'world' | 'zcode'` and the rest are computed refs or async functions.

- [ ] **Step 1: Write the failing tests**

`tests/stores/session.test.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app.config', async () => {
  const { fixtureWorld } = await import('../fixtures/world');
  return {
    appName: 'TEST TERMINAL',
    storagePrefix: 'test',
    cartridges: [
      { kind: 'world', id: 'house', title: 'TEST HOUSE', world: fixtureWorld, saveKey: 'test:save' },
      { kind: 'zcode', id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' },
    ],
  };
});

const { useSession } = await import('@/stores/session');
const { useZGameStore } = await import('@/stores/zgame');
const { useGameStore } = await import('@/stores/game');

const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

describe('session router', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('shows the menu on boot when there is nothing to resume', async () => {
    const s = useSession();
    await s.boot();
    expect(s.mode.value).toBe('menu');
    expect(texts(s.output.value)).toContain('  1  TEST HOUSE   native');
    expect(s.status.value).toBe('');
    expect(s.title.value).toBe('');
  });

  it('a number inserts that cartridge', async () => {
    const s = useSession();
    await s.boot();
    await s.submit('1');
    expect(s.mode.value).toBe('world');
    expect(s.title.value).toBe('TEST HOUSE');
    expect(s.status.value).toBe('MOVES: 0');
    expect(texts(s.output.value)).toContain('📍 Bedroom');
    expect(localStorage.getItem('test:cartridge')).toBe('house');
  });

  it('a bad choice says how to choose', async () => {
    const s = useSession();
    await s.boot();
    await s.submit('9');
    await s.submit('zork');
    expect(s.mode.value).toBe('menu');
    expect(texts(s.output.value).filter((t) => t === '[Type a number from 1 to 2.]')).toHaveLength(2);
  });

  it('EJECT returns to the menu and forgets the last cartridge', async () => {
    const s = useSession();
    await s.boot();
    await s.submit('1');
    await s.submit('eject');
    expect(s.mode.value).toBe('menu');
    expect(localStorage.getItem('test:cartridge')).toBeNull();
  });

  it('resumes the last cartridge with progress, instead of the menu', async () => {
    localStorage.setItem('test:cartridge', 'house');
    localStorage.setItem('test:save', JSON.stringify({ version: '1.0', savedAt: '', gameState: { ...useGameStore().game, currentRoom: 'living' }, outputHistory: [] }));
    const s = useSession();
    await s.boot();
    expect(s.mode.value).toBe('world');
    expect(s.restored.value).toBe(true);
  });

  it('starts a story cartridge through the zgame store, and routes input to it', async () => {
    const zgame = useZGameStore();
    const init = vi.spyOn(zgame, 'initialize').mockResolvedValue();
    const submit = vi.spyOn(zgame, 'submit').mockImplementation(() => {});
    const s = useSession();
    await s.boot();
    await s.submit('2');
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ id: 'story' }));
    expect(s.mode.value).toBe('zcode');
    await s.submit('open mailbox');
    expect(submit).toHaveBeenCalledWith('open mailbox');
  });

  it('shows the Z-machine status line in the header', async () => {
    const zgame = useZGameStore();
    vi.spyOn(zgame, 'initialize').mockResolvedValue();
    const s = useSession();
    await s.boot();
    await s.submit('2');
    zgame.status = { location: 'Kitchen', detail: 'Score: 10  Turns: 7' };
    expect(s.status.value).toBe('Kitchen  Score: 10  Turns: 7');
  });

  it('answers COOKIES in the menu and in story cartridges', async () => {
    const zgame = useZGameStore();
    vi.spyOn(zgame, 'initialize').mockResolvedValue();
    const s = useSession();
    await s.boot();
    await s.submit('cookies');
    expect(texts(s.output.value)).toContain('[This build has no analytics. Nothing is collected.]');
    await s.submit('2');
    await s.submit('cookies');
    expect(texts(zgame.output)).toContain('[This build has no analytics. Nothing is collected.]');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/stores/session.test.ts`
Expected: FAIL, `Failed to resolve import "@/stores/session"`.

- [ ] **Step 3: Implement the cartridge store**

`src/stores/cartridges.ts`:

```ts
import { defineStore } from 'pinia';
import { cartridges } from '@/app.config';
import { LAST_CARTRIDGE_KEY, menuLines } from '@/cartridges';
import { makeLine } from '@/engine/output';
import type { Cartridge } from '@/types/cartridge';
import type { OutputLine } from '@/types/game';

/** Which cartridge is inserted, and the menu shown when none is. */
export const useCartridgeStore = defineStore('cartridges', {
  state: () => ({
    activeId: null as string | null,
    output: [] as OutputLine[],
  }),

  getters: {
    active: (s): Cartridge | null => cartridges.find((c) => c.id === s.activeId) ?? null,
    /** Single-cartridge builds have no menu: no EJECT, and no title in the header. */
    hasMenu: (): boolean => cartridges.length > 1,
  },

  actions: {
    showMenu(): void {
      this.activeId = null;
      this.output = menuLines().map((l) => makeLine(l));
    },

    insert(c: Cartridge): void {
      this.activeId = c.id;
      try {
        window.localStorage.setItem(LAST_CARTRIDGE_KEY, c.id);
      } catch {
        // Only costs the resume-on-reload.
      }
    },

    /** The player typed something at the menu. Returns the chosen cartridge, if any. */
    choose(input: string): Cartridge | null {
      this.output.push(makeLine(`> ${input}`));
      const c = /^\d+$/.test(input) ? cartridges[Number(input) - 1] : undefined;
      if (!c) {
        this.output.push(makeLine(`[Type a number from 1 to ${cartridges.length}.]`));
        return null;
      }
      this.insert(c);
      return c;
    },

    eject(): void {
      try {
        window.localStorage.removeItem(LAST_CARTRIDGE_KEY);
      } catch {
        // Nothing to do.
      }
      this.showMenu();
    },
  },
});
```

- [ ] **Step 4: Implement the router**

`src/stores/session.ts`:

```ts
import { computed } from 'vue';
import { autoBootCartridge } from '@/cartridges';
import { makeLine } from '@/engine/output';
import { cookiesCommand } from '@/services/cookies';
import type { Cartridge } from '@/types/cartridge';
import { useCartridgeStore } from './cartridges';
import { useGameStore } from './game';
import { useZGameStore } from './zgame';

export type SessionMode = 'menu' | 'world' | 'zcode';

/**
 * One interface for the terminal, whatever is running: the cartridge menu,
 * a native world, or a Z-machine story.
 */
export function useSession() {
  const carts = useCartridgeStore();
  const game = useGameStore();
  const zgame = useZGameStore();

  const mode = computed<SessionMode>(() => carts.active?.kind ?? 'menu');
  const output = computed(() =>
    mode.value === 'world' ? game.output : mode.value === 'zcode' ? zgame.output : carts.output,
  );
  const isParsing = computed(() => mode.value === 'world' && game.isParsing);
  const restored = computed(() =>
    mode.value === 'world' ? game.restored : mode.value === 'zcode' ? zgame.restored : false,
  );
  const status = computed(() =>
    mode.value === 'world' ? `MOVES: ${game.moveCount}` : mode.value === 'zcode' ? zgame.headerStatus : '',
  );
  const title = computed(() => (carts.hasMenu ? (carts.active?.title ?? '') : ''));

  async function start(c: Cartridge): Promise<void> {
    carts.insert(c);
    if (c.kind === 'world') game.initialize(c);
    else await zgame.initialize(c);
  }

  /** After the boot animation: resume or boot the obvious cartridge, or show the menu. */
  async function boot(): Promise<void> {
    const c = autoBootCartridge();
    if (c) await start(c);
    else carts.showMenu();
  }

  async function submit(raw: string): Promise<void> {
    const input = raw.trim();
    const lower = input.toLowerCase();
    if (lower === 'eject' && carts.hasMenu && mode.value !== 'menu') {
      carts.eject();
      return;
    }
    if (mode.value === 'world') {
      await game.submit(input);
      return;
    }
    const lines = mode.value === 'zcode' ? zgame.output : carts.output;
    if (lower === 'cookies' || lower === 'privacy') {
      lines.push(makeLine(`> ${input}`), makeLine(cookiesCommand()));
      return;
    }
    if (mode.value === 'zcode') {
      zgame.submit(input);
      return;
    }
    const chosen = carts.choose(input);
    if (chosen) await start(chosen);
  }

  return { mode, output, isParsing, restored, status, title, boot, start, submit };
}
```

- [ ] **Step 5: Run to see it pass**

Run: `npx vitest run tests/stores/session.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/stores/cartridges.ts src/stores/session.ts tests/stores/session.test.ts
git commit -m "Cartridge menu and a session router for the terminal"
```

---

### Task 9: Terminal and App wiring

**Files:**
- Modify: `src/components/Terminal.vue`
- Test: `tests/components/Terminal.test.ts` (one regression test), `tests/components/TerminalMenu.test.ts` (new)

**Interfaces:**
- Consumes: `useSession()` (Task 8).

- [ ] **Step 1: Write the failing tests**

Append to `tests/components/Terminal.test.ts`, inside the top-level `describe`:

```ts
  it('RESTART clears the screen and shows the opening again', async () => {
    const wrapper = mount(Terminal);
    await vi.advanceTimersByTimeAsync(60_000);
    const input = wrapper.find<HTMLInputElement>('.terminal-input-bar input');
    for (const cmd of ['west', 'east', 'west', 'restart']) {
      await input.setValue(cmd);
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      await vi.runAllTimersAsync();
    }
    const text = wrapper.find('.terminal-output').text();
    expect(text).toContain('TEST HOUSE');
    expect(text).not.toContain('> west');
  });
```

`tests/components/TerminalMenu.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Terminal from '@/components/Terminal.vue';

vi.mock('@/app.config', async () => {
  const { fixtureWorld } = await import('../fixtures/world');
  return {
    appName: 'TEST TERMINAL',
    storagePrefix: 'test',
    cartridges: [
      { kind: 'world', id: 'house', title: 'TEST HOUSE', world: fixtureWorld, saveKey: 'test:save' },
      { kind: 'zcode', id: 'story', title: 'A STORY', story: 'stories/story.z3', format: 'Z-machine v3' },
    ],
  };
});

async function type(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.find<HTMLInputElement>('.terminal-input-bar input').setValue(text);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
  await vi.runAllTimersAsync();
}

describe('Terminal with a cartridge menu', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('shows the menu, inserts a cartridge, and ejects back', async () => {
    const wrapper = mount(Terminal);
    await flushPromises();
    await vi.runAllTimersAsync();
    expect(wrapper.find('.terminal-output').text()).toContain('INSTALLED CARTRIDGES');

    await type(wrapper, '1');
    expect(wrapper.find('.terminal-header').text()).toContain('TEST HOUSE');
    expect(wrapper.find('.terminal-header').text()).toMatch(/MOVES:\s*0/);
    expect(wrapper.find('.terminal-output').text()).not.toContain('INSTALLED CARTRIDGES');
    expect(wrapper.find('.terminal-output').text()).toContain('Bedroom');

    await type(wrapper, 'eject');
    expect(wrapper.find('.terminal-output').text()).toContain('INSTALLED CARTRIDGES');
    expect(wrapper.find('.terminal-header').text()).not.toContain('TEST HOUSE');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/components/`
Expected: FAIL. The menu test can’t find “INSTALLED CARTRIDGES”, since Terminal still uses the game store directly, and the RESTART test fails because the shrunken output is never re-rendered.

- [ ] **Step 3: Rewire Terminal.vue**

In `src/components/Terminal.vue` `<script setup>`:

1. Replace

```ts
import { useGameStore } from '@/stores/game';
```

with

```ts
import { useSession } from '@/stores/session';
```

2. Replace

```ts
const store = useGameStore();
const { output, isParsing, restored } = storeToRefs(store);
const { moveCount } = storeToRefs(store);
```

with

```ts
const session = useSession();
const { output, isParsing, restored, status, title, mode } = session;
```

and remove the now-unused `storeToRefs` import.

3. Replace `enqueueNew` with a version that starts over when the output is replaced by a shorter one (RESTART, or switching cartridges):

```ts
function enqueueNew(instant: boolean): void {
  if (output.value.length < enqueuedCount) {
    // The output was replaced (RESTART): clear the screen and start over.
    typer.reset();
    enqueuedCount = 0;
  }
  const slice = output.value.slice(enqueuedCount);
  if (slice.length === 0) return;
  enqueuedCount = output.value.length;
  typer.enqueue(slice, { instant });
}
```

4. Replace the `onMounted` block with:

```ts
onMounted(async () => {
  await session.boot();
  // A restored session renders instantly; anything new after it types out.
  enqueueNew(restored.value);
  focusInput();
});

// Inserting or ejecting a cartridge clears the screen.
watch(mode, () => {
  typer.reset();
  enqueuedCount = 0;
  enqueueNew(restored.value);
});
```

5. In `onSubmit`, replace `await store.submit(v);` with `await session.submit(v);`.

6. In the template, replace the header spans:

```vue
    <header class="terminal-header">
      <span>{{ appName }} v{{ version }}<template v-if="title"> · {{ title }}</template></span>
      <span class="header-right">
        <button v-if="showCookies" type="button" class="consent-open" @click.stop="openConsent">[ COOKIES ]</button>
        <span class="moves">{{ status }}</span>
      </span>
    </header>
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS, including the existing Terminal tests: the fixture config has one cartridge, so it boots straight in and shows `MOVES: 0`.

- [ ] **Step 5: Checks and commit**

Run: `npm run lint && npm run type-check && npm run test:coverage && npm run build`
Expected: all pass.

```bash
git add src/components/Terminal.vue tests/components/Terminal.test.ts tests/components/TerminalMenu.test.ts
git commit -m "Terminal: cartridge menu, Z-machine status line, and a RESTART redraw fix

Fixes a bug where RESTART left the screen showing nothing new: the output
shrank below what had already been queued, so new lines were never typed."
```

---

### Task 10: Docs, release notes, and a real playthrough

**Files:**
- Create: `docs/guide/z-machine.md`, `THIRD_PARTY_NOTICES.md`
- Modify: `docs/.vitepress/config.mts` (sidebar), `docs/index.md`, `docs/guide/getting-started.md`, `docs/guide/how-it-works.md`, `docs/reference/commands.md`, `README.md`, `CHANGELOG.md`, `package.json`, `server/package.json`, `CLAUDE.md`

- [ ] **Step 1: Third-party notices**

`THIRD_PARTY_NOTICES.md`:

```markdown
# Third-party notices

Brass Lantern is MIT licensed (see LICENSE). It includes or depends on:

| Component | License | Notes |
|---|---|---|
| [ifvms](https://github.com/curiousdannii/ifvms.js) 1.1.6 | MIT | The Z-machine interpreter (Dannii Willis). |
| glkapi.js, from [glkote-term](https://github.com/curiousdannii/glkote-term) 0.4.4 | MIT | Vendored in `src/zmachine/vendor/` with its original notice (Andrew Plotkin), modified by `scripts/vendor-glkapi.mjs`. |
| `public/stories/zork1.z3` | MIT | Zork I, Release 119, from [historicalsource/zork1](https://github.com/historicalsource/zork1). Copyright (c) 2025 Microsoft; full text in `public/stories/LICENSE-zork1.txt`. “ZORK” is a trademark of its owner; Brass Lantern isn’t affiliated with or endorsed by it. |
```

- [ ] **Step 2: The Z-machine guide**

`docs/guide/z-machine.md`:

```markdown
# Playing story files

Brass Lantern also runs **Z-machine story files**, the format Infocom’s games shipped in. The demo includes **Zork I** (Release 119), which Microsoft released under the MIT License in 2025. It plays exactly as Infocom wrote it, in the same CRT terminal as native worlds.

## Cartridges

`src/app.config.ts` lists what the terminal offers:

```ts
export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial },
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
];
```

- **With more than one cartridge**, the terminal shows a menu after it boots. Type a number to insert one; EJECT brings you back.
- **With one cartridge**, it boots straight in, with no menu.
- **After a reload**, the last cartridge you played comes straight back if it has a game in progress.

To add a story, put the file in `public/stories/` and add an entry. `story` is relative to the site’s base, so it works under a subpath too.

## Saving

- **SAVE** asks for a name, and **RESTORE** lists the saves you have; type CANCEL to back out. Saves live in your browser’s localStorage, per story.
- **Autosave:** the game also saves itself every turn, so a reload picks up exactly where you were.
- **When the story ends** (QUIT, or a final death), its autosave is cleared. Type PLAY to start again.

## How it works

- **ifvms** ([MIT](https://github.com/curiousdannii/ifvms.js)), the Z-machine inside Parchment, runs the story.
- It talks to the screen through **Glk**, a standard interface for interactive fiction. Brass Lantern includes a modified copy of glkapi.js (`src/zmachine/vendor/`), wrapped so each game gets its own instance.
- **`BrowserGlkOte`** (`src/zmachine/glkote.ts`) turns the game’s screen updates into terminal lines, and its status line into the header.
- **`LocalStorageDialog`** (`src/zmachine/dialog.ts`) stores saves and autosaves.

The game’s own echo of your command, and its `>` prompt, are dropped, since the terminal draws its own.

## Limits

- **Formats:** Z-machine versions 3, 4, 5 and 8 (what ifvms supports). No Glulx.
- **Windows:** only the status line from the upper window is shown, so games that draw menus or quote boxes there lose them.
- **No graphics, sound or timed input.**
- **Loose phrasing:** the intent server doesn’t help with story files yet. Story files have their own parsers, and that’s planned as a separate feature.
```

- [ ] **Step 3: Sidebar, home, and the other pages**

In `docs/.vitepress/config.mts`, add to the Guide sidebar after “Your first world”:

```ts
          { text: 'Playing story files', link: '/guide/z-machine' },
```

In `docs/index.md`, add a feature card at the end of `features`:

```yaml
  - title: Plays Zork, too
    details: Z-machine story files run in the same terminal, starting with Zork I, which Microsoft released under the MIT License. Pick from a cartridge menu; saves and autosave included.
```

In `docs/guide/getting-started.md`, replace the “Make it yours” code block and its paragraph with:

````markdown
Everything that makes a build *a particular game collection* is in `src/app.config.ts`:

```ts
export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial },
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
];
export const appName = 'BRASS LANTERN';
export const storagePrefix = 'brass-lantern';
```

Add your own world as a cartridge (and remove the others if you like: with one cartridge there’s no menu). [Your first world](./your-first-world) walks through writing one; [Playing story files](./z-machine) covers Z-machine cartridges.
````

In `docs/guide/how-it-works.md`, add after the “From keystroke to reply” section:

```markdown
## Cartridges and sessions

The terminal talks to whatever is running through one interface (`useSession()` in `src/stores/session.ts`):

- **The cartridge menu**, when nothing is inserted.
- **A native world**, run by the engine above.
- **A Z-machine story**, run by ifvms. See [Playing story files](./z-machine).

Inserting or ejecting a cartridge clears the screen.
```

In `docs/reference/commands.md`, add rows before HELP:

```markdown
| EJECT | | Back to the cartridge menu (builds with more than one cartridge). |
| PLAY | | Start a story file again after it ends. |
| CANCEL | | At a story file’s save or restore prompt. |
```

- [ ] **Step 4: README, CHANGELOG, versions, CLAUDE.md**

In `README.md`, add after the “What you get” list:

```markdown
- **Plays Zork, too.** Z-machine story files run in the same terminal, starting with **Zork I**, which Microsoft released under the MIT License in 2025. Pick it from the cartridge menu in the [demo](https://mrballistic.github.io/brass-lantern/demo/).
```

and add to the end of the License section:

```markdown
Zork I’s story file is included under its own MIT license; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
```

In `CHANGELOG.md`, add above 1.0.0:

```markdown
## 1.1.0 (2026-10-05)

- **Z-machine story files.** Brass Lantern now runs Infocom-format games in its terminal, through ifvms (MIT) and a per-session Glk layer. **Zork I** (Release 119, MIT, Microsoft 2025) is included.
- **Cartridge menu** after the boot sequence, listing native worlds and story files. Single-cartridge builds boot straight in. EJECT returns to the menu, and a reload resumes the last game in progress.
- **Saving in story files:** SAVE and RESTORE prompt for names stored in localStorage, plus an autosave every turn. The game’s status line shows in the header.
- `src/app.config.ts` now exports `cartridges` instead of `world`. Native saves are per cartridge (`<prefix>:save:<id>`, overridable with `saveKey`).
- Fixed: RESTART left the screen without the new opening.
```

Run:

```bash
npm pkg set version=1.1.0 && (cd server && npm pkg set version=1.1.0)
npm install --package-lock-only && (cd server && npm install --package-lock-only)
```

In `CLAUDE.md`, add to “Invariants”:

```markdown
- **Story files run in their own session** (`src/zmachine/session.ts`): fresh `createGlk()`, ZVM and `ZVMDispatch` each time, and a fresh copy of the story bytes (ifvms writes into them). `src/zmachine/vendor/glkapi.js` is generated by `scripts/vendor-glkapi.mjs`; regenerate it rather than editing it.
```

- [ ] **Step 5: Full checks**

Run: `npm run lint && npm run type-check && npm run test:coverage && npm run build && npm run docs:build`
Expected: all pass.

- [ ] **Step 6: Play it in a real browser**

Run: `npm run dev` and open http://localhost:5173 in a browser (Playwright, or by hand). Verify, in order:

1. After boot, the menu lists `1  SNACK ATTACK   native` and `2  ZORK I   Z-machine v3`.
2. `2` shows Zork’s opening; the header reads `BRASS LANTERN v1.1.0 · ZORK I` and `West of House  Score: 0  Turns: 0`.
3. `open mailbox`, `take leaflet`, `read leaflet`: each shows the right reply once, with no doubled echo and no stray `>`.
4. Reload the page: the transcript reappears instantly, and `inventory` lists the leaflet.
5. `save`, then a name: “Ok.” Then `drop leaflet`, `restore`, the name, `inventory`: the leaflet is back.
6. `eject` shows the menu; `1` starts Snack Attack; `eject`, then `2` resumes Zork where you left it.

Then build the Pages demo locally the way CI does, and confirm the story loads under the subpath:

```bash
npm run docs:build
VITE_BASE=/brass-lantern/demo/ npx vite build --outDir docs/.vitepress/dist/demo --emptyOutDir
ls docs/.vitepress/dist/demo/stories/zork1.z3
```

- [ ] **Step 7: Commit, PR, merge**

```bash
git add -A
git commit -m "Docs and release notes for Z-machine support; 1.1.0"
git push -u origin z-machine
gh pr create --title "1.1.0: play Z-machine story files, starting with Zork I" --body "See CHANGELOG 1.1.0 and docs/superpowers/plans/2026-10-05-z-machine-runtime.md."
```

Wait for CI to pass, merge the PR, then confirm the Pages deploy and that https://mrballistic.github.io/brass-lantern/demo/ offers ZORK I.

---

### Task 11: Port to INITECH TERMINAL (private repo)

**Files (in `~/current_work/infocom-office-space`):**
- Modify: `scripts/public-paths.txt`, `src/app.config.ts`, `package.json`, `CHANGELOG.md`
- Create: `scripts/sync-from-public.sh`

**Interfaces:**
- Consumes: everything shared from brass-lantern, including `src/types/cartridge.ts`, `src/cartridges.ts`, `src/zmachine/`, the new stores, and `cartridges` in the app config.

- [ ] **Step 1: Share the new paths**

Add to `scripts/public-paths.txt`, after `src/worlds/tutorial.ts`:

```
src/zmachine/
src/cartridges.ts
scripts/vendor-glkapi.mjs
tests/zmachine/
tests/cartridges.test.ts
```

(`src/types/`, `src/stores/`, `src/services/`, `src/components/` and `tests/fixtures/` are already shared, and `src/App.vue` too.)

- [ ] **Step 2: A reverse sync script**

`scripts/sync-from-public.sh`:

```bash
#!/usr/bin/env bash
#
# Bring engine changes made in the public repo (brass-lantern) into this one.
# Copies exactly the paths in scripts/public-paths.txt, then runs this repo's
# checks. Doesn't commit: review the diff, then commit and PR as usual.
#
# Usage: scripts/sync-from-public.sh [path-to-brass-lantern-checkout]   # default ../brass-lantern

set -euo pipefail

PRIVATE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC="$(cd "${1:-$PRIVATE/../brass-lantern}" && pwd)"

if [[ -n "$(git -C "$PRIVATE" status --porcelain)" ]]; then
  echo "$PRIVATE has uncommitted changes; commit or stash them first." >&2
  exit 1
fi

cd "$PUBLIC"
echo ">>> Copying shared paths from $PUBLIC"
while IFS= read -r entry; do
  [[ -z "${entry// }" || "$entry" == \#* ]] && continue
  if [[ "$entry" == */ ]]; then
    mkdir -p "$PRIVATE/$entry"
    rsync -a --delete "$entry" "$PRIVATE/$entry"
  else
    mkdir -p "$PRIVATE/$(dirname "$entry")"
    cp "$entry" "$PRIVATE/$entry"
  fi
done < "$PRIVATE/scripts/public-paths.txt"

echo ">>> Dependency differences (public vs private)"
for pkg in package.json server/package.json; do
  # shellcheck disable=SC2016  # the single quotes are JavaScript, not shell
  node -e '
    const [a, b, name] = process.argv.slice(1);
    const read = (f) => { const p = require(f); return { ...p.dependencies, ...p.devDependencies }; };
    const pa = read(a), pb = read(b);
    const keys = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].sort();
    const diff = keys.filter((k) => pa[k] !== pb[k]);
    if (diff.length === 0) console.log(`  ${name}: none`);
    for (const k of diff) console.log(`  ${name}: ${k}  public=${pa[k] ?? "-"}  private=${pb[k] ?? "-"}`);
  ' "$PUBLIC/$pkg" "$PRIVATE/$pkg" "$pkg"
done

echo ">>> Running this repo's checks"
cd "$PRIVATE"
npm run lint
npm run type-check
npm run test:coverage
npm run build
(cd server && npm run lint && npm run type-check && npm test)

echo
echo ">>> Done. Changes:"
git status --short
```

`chmod +x scripts/sync-from-public.sh && shellcheck scripts/sync-from-public.sh`

- [ ] **Step 3: Private app config and dependencies**

Replace `src/app.config.ts`:

```ts
// Everything that makes this deployment *this* game rather than the engine.
// The rest of src/ is shared with the public brass-lantern engine and must
// stay world-agnostic.
import type { Cartridge } from '@/types/cartridge';
import { officeSpace } from '@/worlds/office-space';

/** One cartridge, so the terminal boots straight into it: no menu, no EJECT. */
export const cartridges: Cartridge[] = [
  // saveKey keeps players' existing saves from before cartridges existed.
  { kind: 'world', id: 'office-space', title: 'OFFICE SPACE', world: officeSpace, saveKey: 'initech-terminal:save' },
];

/** Shown in the terminal header. */
export const appName = 'INITECH TERMINAL';

/** Namespaces saves, consent and analytics IDs in localStorage. */
export const storagePrefix = 'initech-terminal';
```

```bash
npm i ifvms@1.1.6 --save-exact && npm i -D glkote-term@0.4.4 --save-exact
```

- [ ] **Step 4: Sync and check**

Run (with the brass-lantern merge pulled into `../brass-lantern`): `scripts/sync-from-public.sh`
Expected: dependency differences only for `vitepress` (public-only); all checks pass, including `tests/worlds/office-space/` and the shared Z-machine tests.

- [ ] **Step 5: Release**

Bump both `package.json` versions to `1.3.0`, add a CHANGELOG entry (“Engine from brass-lantern 1.1.0: cartridges and Z-machine support (unused here: one cartridge, so the game is unchanged)”), PR, merge, tag `v1.3.0`, watch the deploy.

Verify on https://initech.mrballistic.com: it boots straight into Office Space, the header reads `INITECH TERMINAL v1.3.0`, there’s no menu and no EJECT, and an existing save (written by 1.2.x) still resumes.
