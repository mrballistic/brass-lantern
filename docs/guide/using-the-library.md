# Using the library

Brass Lantern is three npm packages. Use them to put a game in your own app, run one headless in Node, or add the intent server to a backend you already have.

| Package | What it is | Needs |
|---|---|---|
| `@brass-lantern/engine` | Worlds as data, the parser, the turn loop (`createGame`), `auditWorld`, and the Z-machine runtime for story files. No Vue, no DOM. | Node 24+ (browsers and bundlers too) |
| `@brass-lantern/vue` | The CRT terminal, the game store, themes and `mountGame`. | `vue` 3.5+, `pinia` 4 |
| `@brass-lantern/server` | The intent server as `parseIntent` and, for Express, `intentRoute`. | A Gemini key; `express` 5 for the route |

All three are ESM with TypeScript declarations. On Node 24 and later every entry also loads with `require()` except one: `@brass-lantern/engine/zmachine/session` uses top-level `await` (to check for `ifvms` first), so `require()` throws `ERR_REQUIRE_ASYNC_MODULE`; load it with `import()`, which is how a browser app wants it anyway.

TypeScript 5.0 or later works with `moduleResolution` set to `bundler`, `node16` or `nodenext`. The engine’s public types mention `fetch` and `Storage`, so your project needs the DOM lib or `@types/node`. Vue 3.5’s own type declarations need TypeScript 5.4 or later unless you set `skipLibCheck`, so a project using `@brass-lantern/vue` wants 5.4 or later anyway.

## Install

```bash
npm i @brass-lantern/engine @brass-lantern/vue vue pinia
```

Add `@brass-lantern/server` (and `express`) on the machine that will run the intent server. Playing Z-machine story files in a browser app needs nothing extra: `@brass-lantern/vue` brings the interpreter ([ifvms](https://github.com/curiousdannii/ifvms.js)) with it.

## Put a game on a page

`mountGame` makes a Vue app and a Pinia of its own and mounts one game on an element:

```ts
import { mountGame } from '@brass-lantern/vue';
import '@brass-lantern/vue/style.css';
import { tutorial } from '@brass-lantern/engine/worlds';

mountGame('#app', {
  cartridges: [{ kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial }],
  storagePrefix: 'my-game',
});
```

The stylesheet is a separate import, so a bundler can see it. TypeScript 6 checks side-effect imports (`noUncheckedSideEffectImports`), so it needs to know what a `.css` import is: a Vite app gets that from `vite/client` in its `types`, and anything else can declare it in a `.d.ts` file with `declare module '*.css';`. It styles the game and nothing else on your page: no `html`, `body` or `*` rules, nothing fixed to the viewport. The game fills its container, so give the container a size. For a full-screen game:

```css
html, body, #app { height: 100%; margin: 0; overflow: hidden; }
```

For a game inside a page, size its box (`#game { width: 640px; height: 400px; }`) and the terminal, its overlays and the boot sequence stay inside it. Pass `autofocus: false` to an embedded game so it doesn’t take the page’s focus, and scroll to itself, when it boots.

Already have a Vue app? Use the component, with a Pinia installed:

```vue
<script setup lang="ts">
import { BrassLantern, type GameOptions } from '@brass-lantern/vue';
import '@brass-lantern/vue/style.css';

const options: GameOptions = {
  cartridges: [/* … */],
  storagePrefix: 'my-game',
};
</script>

<template>
  <BrassLantern :options="options" />
</template>
```

That is most of the package: `BrassLantern`, `mountGame`, `ConsentBanner`, the themes (`PRESETS`, `PALETTES`, `resolveTheme`, the `UnknownTheme` error and their types), `useTypewriter`, and the `GameOptions` and `GameEvent` types, plus the cartridge types (`Cartridge`, `WorldCartridge`, `ZCodeCartridge`) re-exported from the engine so a Vue app can type its options from this package alone. The terminal’s parts (the terminal itself, the boot sequence, the stores) are internal, so they can change without a major version.

### Every option

`GameOptions` is the only thing a game needs to be told:

| Option | Meaning |
|---|---|
| `cartridges` | One or more worlds or story files. With one the terminal boots straight in; with more it shows the menu. Required. |
| `storagePrefix` | Namespaces everything kept in the browser: saves, transcripts, the player’s theme and the story shelf (for example `my-game:save:snack-attack`). Required. |
| `terminalName` | Shown in the header. Default `BRASS LANTERN`. |
| `version` | Shown after the name in the header. |
| `intentEndpoint` | Where misses go for the LLM’s reading: a URL that accepts `POST`. `null`, `''` or unset means none, and a miss gets the engine’s reply. |
| `theme` | The author’s default: a preset name, the name of one of `themes`, or a custom theme object. The player’s `THEME` command wins. A name that isn’t a theme falls back to `crt-amber`, with a warning in the console. Default `crt-amber`. |
| `themes` | Extra named themes, offered by `THEME` beside the presets. One named like a preset is ignored, with a warning. |
| `analytics` | `{ onEvent(name, params?), openConsent?() }`. `onEvent` hears `game_start`, `game_completed` and `session_resumed`; a callback that throws is logged and never breaks the game. With `openConsent`, the header shows a COOKIES link and the command calls it; without it, COOKIES says nothing is collected. |
| `storyBaseUrl` | Where a story cartridge’s relative `story` path is fetched from. A Vite app under a subpath passes `import.meta.env.BASE_URL`. Default `/`. |
| `devChecks` | Turns on the engine’s script freeze, so a world script that assigns to game state throws instead of passing silently. Global to the page, and only ever turned on. A Vite app passes `import.meta.env.DEV`. Default `false`. |
| `autofocus` | Focus the game’s input when it boots (which scrolls the page to it). An embedded game passes `false`; a click on the game still focuses it. Default `true`. |

`mountGame(el, options, { slot })` takes a third argument for a component rendered inside the game’s shell once it has booted. The demo site uses it for its consent banner. `ConsentBanner` is exported, and it is presentational: it takes an `open` prop and emits `choose` with `'granted'` or `'denied'`, and your app decides what to store and what to send. Its wording is yours too: `title`, `body`, `note` and `label` (the section’s accessible name) are props, and the defaults are neutral and name no analytics provider, so pass your own to say what you collect and where it goes.

### Two games on one page

Each game needs its own `storagePrefix`. The same prefix twice is the same game, with shared saves and shared stores. Remounting `<BrassLantern>` under the same Pinia keeps the options of the first mount, because Pinia caches the store by its id. To change the options of a running game, unmount it (the object `mountGame` returns has `unmount()`) and mount again.

## Themes

The terminal ships five presets:

| Name | Look |
|---|---|
| `crt-amber` | The default: amber phosphor, with every effect on. |
| `crt-green` | Green phosphor, every effect on. |
| `simple` | Plain text on a plain page, no effects. Follows the system’s light or dark setting. |
| `simple-light` | The plain look, light. |
| `simple-dark` | The plain look, dark. |

A theme is a palette (twelve color roles) plus seven effect switches (`bloom`, `scanlines`, `flicker`, `vignette`, `noise`, `glitch`, `decay`). Write your own and offer it by name:

```ts
import { mountGame, type Theme } from '@brass-lantern/vue';
// `cartridges` as in “Put a game on a page” above.

const paper: Theme = {
  palette: {
    fg: '#2b2118', fgBright: '#000000', fgDim: '#7a6a58',
    glow: 'transparent', glowStrong: 'transparent',
    bg: '#f4efe3', border: '#d6cbb5', input: '#1d5fa8',
    location: '#000000', event: '#b3410b', decorative: '#6a3d9a', system: '#7a6a58',
  },
  effects: { bloom: false, scanlines: false, flicker: false, vignette: false, noise: false, glitch: false, decay: true },
};

mountGame('#app', { cartridges, storagePrefix: 'my-game', theme: paper, themes: { paper } });
```

`palette` can also be a name (`amber`, `green`, `light` or `dark`) to borrow a built-in one. `PALETTES`, `PRESETS` and `resolveTheme` are exported for tools that want the data.

**Player commands.** `THEME` lists the themes; `THEME <name>` switches (a custom theme’s name can have spaces or underscores; the player types it as listed). `BLOOM ON|OFF` and `EFFECTS ON|OFF` turn the glow and all the effects on or off. They work everywhere: at the cartridge menu, in a native world and in a story file. The choice is remembered in the browser at `<storagePrefix>:theme`.

`theme`, `bloom` and `effects` are reserved player commands, like SAVE: they are read as the command, and they shadow a world item with one of those names.

**Reduced motion.** When the player’s system asks for reduced motion, flicker, glitch and noise are off whatever the theme says.

## Run a game with no browser

The engine has no UI of its own. `createGame` runs a world in plain Node, which is how the tests play games and how you can build a bot, a CLI or a server-side game:

```ts
import { createGame } from '@brass-lantern/engine';
import { tutorial } from '@brass-lantern/engine/worlds';
import { createInterface } from 'node:readline/promises';

const game = createGame(tutorial, { seed: 1 });
console.log(game.opening.join('\n'));

const rl = createInterface({ input: process.stdin, output: process.stdout });
while (!game.state.gameOver) {
  const reply = game.send(await rl.question('> '));
  console.log(reply.lines.join('\n'));
}
rl.close();
```

`send(line)` takes whatever a player would type, including chained commands, and answers `{ lines, gameOver, awaiting }`. `awaiting` is true while the game waits for an answer to a question, such as “Which door do you mean?”, and that question is the last of `lines`. `seed` makes the game’s randomness repeatable. A command whose script throws is rolled back, and the reply is “[Something went wrong with that command. Nothing changed.]”. A line over `MAX_INPUT_LENGTH` (1,000 characters once whitespace is collapsed) changes nothing and hears `TOO_LONG_REPLY`.

`createGame` handles RESTART (a fresh game, with the same `seed`) and UNDO (one turn at a time, up to 50) itself; `game.state` is always the game now, so read it after `send` rather than keeping the object. VERSION names the engine (`ENGINE_VERSION`) and the world. There is nowhere to keep a save or a transcript in plain Node, so SAVE, RESTORE, LOAD, SCRIPT and UNSCRIPT say they aren’t available and change nothing; a host that can store them handles those words before calling `send`. HELP lists only the commands that work here.

`createGame` has no LLM: input the parser can’t read gets the engine’s own reply.

### Your own loop

`createGame` and the Vue terminal do the splitting, parsing and running for you. If you drive the lower-level pieces yourself (`splitCommands`, `fallbackParse`, `execute`), pass `splitCommands` the world’s names that contain “and”, or it will cut “take flair from lost and found” in two. `andNames(world)` builds that list; work it out once per world, not once per line:

```ts
import { andNames, execute, fallbackParse, initialState, splitCommands } from '@brass-lantern/engine';

const names = andNames(world);   // e.g. ['lost and found box', 'lost and found']
const state = initialState(world);

function run(line: string): string[] {
  const out: string[] = [];
  for (const command of splitCommands(line, world.verbs, names)) {
    const action = fallbackParse(command, world.verbs);
    out.push(...(action ? execute(action, { world, state }).lines : ['I didn’t understand that.']));
  }
  return out;
}
```

```ts
splitCommands('take flair from lost and found and go north', world.verbs, names);
// ['take flair from lost and found', 'go north']
splitCommands('take flair from lost and found and go north', world.verbs);
// ['take flair from lost', 'take found', 'go north']
```

`names` is optional, and a world with no such names gives an empty list, so leaving it out changes nothing for those worlds. That loop leaves out what `createGame` adds on top (questions and their answers, AGAIN, OOPS, UNDO, captures), so prefer `createGame` unless you need the pieces.

## The intent server

Loose phrasing (“make that thing stop beeping”) can go to an LLM that maps it onto your verbs and IDs. It only classifies. See [The intent server](./intent-server) for the protocol; here is the wiring.

On the server, with Express 5:

```ts
import express from 'express';
import { intentRoute } from '@brass-lantern/server/express';

const app = express();
app.set('trust proxy', 'loopback'); // behind a reverse proxy on the same machine
app.use(express.json({ limit: '32kb' }));
app.use('/api', intentRoute({ apiKey: process.env.GEMINI_KEY! }));
app.listen(3001);
```

That serves `POST /api/parse-intent`, with a per-client rate limit. Pass `models`, `timeoutMs` or `rateLimitPerMinute` to change the defaults. An empty `models` list means the defaults, here and in `parseIntent`; `rateLimitPerMinute` must be a positive number, or `intentRoute` throws when it is built, as it does for an empty key. You own `express.json()` and `trust proxy`. Behind Apache or nginx, set `trust proxy` as above, or the rate limit sees every request coming from the proxy and all your players share one bucket; with nothing in front, leave it unset. The route sets no CORS headers, on purpose: other sites should not be able to spend your quota from their visitors’ browsers.

In the browser:

```ts
mountGame('#app', { cartridges, storagePrefix: 'my-game', intentEndpoint: '/api/parse-intent' });
```

Not on Express? `parseIntent` is the same thing as a function:

```ts
import { parseIntent } from '@brass-lantern/server';

const action = await parseIntent('hand gary his mug', context, { apiKey, timeoutMs: 5000 });
// { action: 'give', target: 'mug', indirect: 'gary' }, or { action: 'unknown' }
```

`context` is an `IntentContext`: what the player can see, by ID and name (the room’s name, its exits, the items and people in view, the inventory, and the world’s own verbs). The model answers only with IDs from it. [The intent server](./intent-server#the-api) shows its shape. The Vue terminal builds and sends it for you. A UI that runs its own loop on the lower-level engine (`execute`, which reports `understood: false` on a miss) can build it with `buildContext` from `@brass-lantern/engine` and post it with `parseIntentRemote`.

Neither reads the environment: you pass the key in. Keep it on the server. Never give it a `VITE_` name, because Vite inlines those into the public bundle; the browser talks to your route and never to Google.

## Write a world and check it

A world is a typed object, `World`, from `@brass-lantern/engine`. [Building worlds](./building-worlds/) walks through writing one, and the [schema](../reference/world-schema) lists every field. Check it before you play it:

```ts
import { auditWorld, createGame, type World } from '@brass-lantern/engine';

const world: World = { /* rooms, items, events … */ } as World;

const problems = auditWorld(world);   // string[]: broken references: exits to nowhere, missing events, unknown items
if (problems.length) throw new Error(problems.join('\n'));

const game = createGame(world, { seed: 1 });
game.send('look');
```

`auditWorld` finds the mistakes that only show up when someone walks into them: exits that go nowhere, events nothing defines, references to items that do not exist. Put it in your test suite beside a test that plays the winning route.

Worlds written for 1.13.0 or later run on 2.1.0. Two things behave differently: a typed word the world doesn’t know now stops a name from matching (“red ball” no longer finds a thing called only “ball”; add an alias, see [How names are matched](./building-worlds/#how-names-are-matched)), and EXAMINE of a character in the dark says it’s too dark. 2.1.0 adds an optional `article` on characters and the built-in FOLLOW; a world that declared its own `follow` verb should drop it (`auditWorld` reports the clash).

## Story files (Z-machine)

A story file is a cartridge too:

```ts
{ kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' }
```

The file is fetched from `storyBaseUrl` plus `story`, so host it with your app. See [Playing story files](./z-machine). The player can also LOAD one from their own computer, which stays in their browser.

The interpreter is `ifvms`, an optional peer of the engine. `@brass-lantern/vue` depends on it, so a browser app needs nothing more, and it loads the interpreter only when a story starts: a bundler puts it in a chunk of its own, and a game with only native worlds never downloads it.

Using the runtime yourself, the session is its own entry, so you can do the same:

```ts
import { SaveStoreDialog, localStorageSaveStore } from '@brass-lantern/engine/zmachine';

const { ZMachineSession } = await import('@brass-lantern/engine/zmachine/session');
const session = new ZMachineSession(storyBytes, new SaveStoreDialog(localStorageSaveStore('my-game:')), {
  onLines: (lines) => print(lines), onStatus() {}, onWaiting() {}, onExit() {}, onError: (m) => print([m]),
});
session.start();
```

`@brass-lantern/engine/zmachine` holds everything but the interpreter (the story shelf, `readStoryFile`, the save stores and the types) and never needs `ifvms`. In Node, install `ifvms` yourself to use `./zmachine/session`; without it the import fails with an error that names the package. Saves go through a `SaveStore` (`list`, `read`, `write`, `remove`), wrapped in a `SaveStoreDialog`. In the browser that is `localStorageSaveStore(prefix)`; a Node host can pass a directory, a database or a `Map`.

## Examples

The [demo](https://mrballistic.github.io/brass-lantern/demo/) is built from these packages: in the repo, `apps/site` lists the cartridges, mounts the game and wires its analytics to `ConsentBanner`. It isn’t published to npm. [Office Space: The Text Adventure](https://initech.mrballistic.com) is a full-length game built on the engine.
