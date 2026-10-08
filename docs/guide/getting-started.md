# Getting started

Brass Lantern is a small engine for classic parser text adventures (*go north*, *take lamp*, *give the mug to Gary*) that runs in the browser inside a CRT terminal. You write a game as data; the engine runs it.

It also plays **Z-machine story files**, the format Infocom’s games shipped in, in the same terminal.

It comes with five cartridges: **Snack Attack**, a three-room world that exists to show the engine off, **Zork I, II and III**, and **Zork I rebuilt natively** on the engine. [Play them](https://mrballistic.github.io/brass-lantern/demo/), then come back. For a full-length game built on the engine, try [Office Space: The Text Adventure](https://initech.mrballistic.com).

## Use it in your app

Brass Lantern is on npm as three packages: the engine, a Vue terminal and an optional intent server. [Using the library](./using-the-library) covers installing them, mounting a game, themes, running headless in Node and wiring the intent server.

```bash
npm i @brass-lantern/engine @brass-lantern/vue vue pinia
```

## Run the demo from the repo

You need Node 24 or later.

```bash
git clone https://github.com/mrballistic/brass-lantern.git
cd brass-lantern
npm install
npm run dev        # http://localhost:5173
```

The terminal boots to the cartridge menu; type `1` for Snack Attack, `2`–`4` for Zork I–III, or `5` for the native Zork I. All are fully playable offline: the regex parser handles every command the engine knows, and Zork has its own parser. Loose phrasing ("make that thing stop beeping") needs the optional [intent server](./intent-server).

## What's in the box

```
packages/
  engine/          @brass-lantern/engine: the engine, the regex parser, fuzzy matching,
                   line styling, createGame, auditWorld, the story-file runtime
                   (zmachine/), and the bundled worlds (worlds/)
  vue/             @brass-lantern/vue: the terminal, the boot sequence, the game stores,
                   themes, mountGame, and the CRT stylesheet
  server/          @brass-lantern/server: the intent server (parseIntent, intentRoute),
                   plus the small Express app the repo runs (src/index.ts)
apps/
  site/            the demo: app.config.ts lists the cartridges, main.ts mounts the game,
                   apps/site/public/stories/ holds the Zork trilogy and its licenses
docs/              this site (npm run docs:dev)
scripts/           the consumer smoke test, the glkapi vendoring
```

Each package has its own tests; `packages/engine/src/types/world.ts` is the world schema, with a comment on every field.

## Make it yours

Everything that makes the demo *a particular game collection* is in `apps/site/src/app.config.ts`:

```ts
export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial },
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
  { kind: 'zcode', id: 'zork2', title: 'ZORK II', story: 'stories/zork2.z3', format: 'Z-machine v3' },
  { kind: 'zcode', id: 'zork3', title: 'ZORK III', story: 'stories/zork3.z3', format: 'Z-machine v3' },
  { kind: 'world', id: 'zork1-native', title: 'ZORK I · NATIVE', world: zork1 },
];
export const appName = 'BRASS LANTERN';
export const storagePrefix = 'brass-lantern';
```

Add your own world as a cartridge (and remove the others if you like: with one cartridge there’s no menu). [Building worlds](./building-worlds/) walks through writing one, from two rooms up; [Playing story files](./z-machine) covers Z-machine cartridges.

## Checks

```bash
npm run lint && npm run type-check && npm run test:coverage
npm run build:packages && npm run build && npm run smoke
```

`npm run smoke` packs the three packages, installs them into a scratch project and uses them from Node and `tsc`. CI runs the same on every push and PR, and also checks the built site for anything shaped like an API key.
