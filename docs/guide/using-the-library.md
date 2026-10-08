# Using the library

Brass Lantern is three npm packages. Use them to put a game in your own app, run one headless in Node, or add the intent server to a backend you already have.

| Package | What it is | Needs |
|---|---|---|
| `@brass-lantern/engine` | Worlds as data, the parser, the turn loop (`createGame`), `auditWorld`, and the Z-machine runtime for story files. No Vue, no DOM. | Node 24+ (browsers and bundlers too) |
| `@brass-lantern/vue` | The CRT terminal, the game store, themes and `mountGame`. | `vue` 3.5+, `pinia` 4 |
| `@brass-lantern/server` | The intent server as `parseIntent` and, for Express, `intentRoute`. | A Gemini key; `express` 5 for the route |

All three are ESM with TypeScript declarations. The core entry points also load with `require()` on Node 24 and later (the engine’s `.` and `./worlds`, and the server’s `.` and `./express`); the Z-machine entries use top-level `await` and are ESM only.

TypeScript 5.0 or later works with `moduleResolution` set to `bundler`, `node16` or `nodenext`. The engine’s public types mention `fetch` and `Storage`, so your project needs the DOM lib or `@types/node`.

::: tip The first publish is separate
Version 2.0.0 is the first version with packages. Until it is on npm, the repo’s `npm run smoke` packs the three packages, installs the tarballs into a scratch project and uses them, so what ships is what is tested.
:::

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

The stylesheet is a separate import, so a bundler can see it. Already have a Vue app? Use the component, with a Pinia installed:

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

`createGameStore(options)` is there too, for a UI that wants the game’s state and not the terminal.

### Every option

`GameOptions` is the only thing a game needs to be told:

| Option | Meaning |
|---|---|
| `cartridges` | One or more worlds or story files. With one the terminal boots straight in; with more it shows the menu. Required. |
| `storagePrefix` | Namespaces everything kept in the browser: saves, transcripts, the player’s theme and the story shelf (for example `my-game:save:snack-attack`). Required. |
| `terminalName` | Shown in the header. Default `BRASS LANTERN`. |
| `version` | Shown after the name in the header. |
| `intentEndpoint` | Where misses go for the LLM’s reading: a URL that accepts `POST`. `null`, `''` or unset means none, and a miss gets the engine’s reply. |
| `theme` | The author’s default: a preset name, or a custom theme object. The player’s `THEME` command wins. Default `crt-amber`. |
| `themes` | Extra named themes, offered by `THEME` beside the presets. |
| `analytics` | `{ onEvent(name, params?), openConsent?() }`. `onEvent` hears `game_start`, `game_completed` and `session_resumed`; a callback that throws is logged and never breaks the game. With `openConsent`, the header shows a COOKIES link and the command calls it; without it, COOKIES says nothing is collected. |
| `storyBaseUrl` | Where a story cartridge’s relative `story` path is fetched from. A Vite app under a subpath passes `import.meta.env.BASE_URL`. Default `/`. |
| `devChecks` | Turns on the engine’s script freeze, so a world script that assigns to game state throws instead of passing silently. Global to the page, and only ever turned on. A Vite app passes `import.meta.env.DEV`. Default `false`. |

`mountGame(el, options, { slot })` takes a third argument for a component rendered inside the game’s shell once it has booted. The demo site uses it for its consent banner. `ConsentBanner` is exported, and it is presentational: it takes an `open` prop and emits `choose`, and your app decides what to store and what to send.

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

A theme is a palette (twelve colour roles) plus seven effect switches (`bloom`, `scanlines`, `flicker`, `vignette`, `noise`, `glitch`, `decay`). Write your own and offer it by name:

```ts
import type { Theme } from '@brass-lantern/vue';

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

**Player commands.** `THEME` lists the themes; `THEME <name>` switches. `BLOOM ON|OFF` and `EFFECTS ON|OFF` turn the glow and all the effects on or off. The choice is remembered in the browser at `<storagePrefix>:theme`.

`theme`, `bloom` and `effects` are reserved words in the store, like SAVE: they are read as the command, and they shadow a world item with one of those names.

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

`send(line)` takes whatever a player would type, including chained commands, and answers `{ lines, gameOver, awaiting }`. `awaiting` is true while the game waits for an answer to a question, such as “Which door do you mean?”, and that question is the last of `lines`. `seed` makes the game’s randomness repeatable. A command whose script throws is rolled back, and the reply is “[Something went wrong with that command. Nothing changed.]”.

`createGame` has no LLM: input the parser can’t read gets the engine’s own reply. To add the model, call the intent server yourself when `send` misses.

## The intent server

Loose phrasing (“make that thing stop beeping”) can go to an LLM that maps it onto your verbs and IDs. It only classifies. See [The intent server](./intent-server) for the protocol; here is the wiring.

On the server, with Express 5:

```ts
import express from 'express';
import { intentRoute } from '@brass-lantern/server/express';

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use('/api', intentRoute({ apiKey: process.env.GEMINI_KEY! }));
app.listen(3001);
```

That serves `POST /api/parse-intent`, with a per-client rate limit. Pass `models`, `timeoutMs` or `rateLimitPerMinute` to change the defaults. An empty `models` list means the defaults, here and in `parseIntent`; `rateLimitPerMinute` must be a positive number, or `intentRoute` throws when it is built, as it does for an empty key. You own `express.json()` and `trust proxy`, and the route sets no CORS headers, on purpose: other sites should not be able to spend your quota from their visitors’ browsers.

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

Neither reads the environment: you pass the key in. Keep it on the server. Never give it a `VITE_` name, because Vite inlines those into the public bundle; the browser talks to your route and never to Google.

## Write a world and check it

A world is a typed object, `World`, from `@brass-lantern/engine`. [Building worlds](./building-worlds/) walks through writing one, and the [schema](../reference/world-schema) lists every field. Check it before you play it:

```ts
import { auditWorld, createGame, type World } from '@brass-lantern/engine';

const world: World = { /* rooms, items, events … */ } as World;

const problems = auditWorld(world);   // string[]: dead ends, broken exits, missing events
if (problems.length) throw new Error(problems.join('\n'));

const game = createGame(world, { seed: 1 });
game.send('look');
```

`auditWorld` finds the mistakes that only show up when someone walks into them: exits that go nowhere, events nothing defines, references to items that do not exist. Put it in your test suite beside a test that plays the winning route.

The format is the one 1.13.0 had. Worlds written then work unchanged.

## Story files (Z-machine)

A story file is a cartridge too:

```ts
{ kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' }
```

The file is fetched from `storyBaseUrl` plus `story`, so host it with your app. See [Playing story files](./z-machine). The player can also LOAD one from their own computer, which stays in their browser.

The interpreter is `ifvms`, an optional peer of the engine. `@brass-lantern/vue` depends on it, so a browser app needs nothing more. Using `@brass-lantern/engine/zmachine` directly in Node, install `ifvms` yourself; without it the import fails with an error that names the package. Saves go through a `SaveStore` (`list`, `read`, `write`, `remove`). In the browser that is `localStorageSaveStore(prefix)`; a Node host can pass a directory, a database or a `Map`.

## What stays in the repo

The demo site (`apps/site`) is the library’s first user: it lists the cartridges, mounts the game and wires analytics. It is not published. [Office Space: The Text Adventure](https://initech.mrballistic.com), a private game, still runs on the engine as of 1.13.0 and moves onto these packages on its own schedule.
