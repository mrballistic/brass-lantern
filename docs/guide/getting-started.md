# Getting started

Brass Lantern is a small engine for classic parser text adventures (*go north*, *take lamp*, *give the mug to Gary*) that runs in the browser inside a CRT terminal. You write a game as data; the engine runs it.

It comes with **Snack Attack**, a three-room world that exists to show the engine off. [Play it](https://mrballistic.github.io/brass-lantern/demo/), then come back.

## Run it

You need Node 24 or later.

```bash
git clone https://github.com/mrballistic/brass-lantern.git
cd brass-lantern
npm install
npm run dev        # http://localhost:5173
```

That's the whole game, fully playable: the regex parser handles every command the engine knows, offline. Loose phrasing ("make that thing stop beeping") needs the optional [intent server](./intent-server).

## What's in the box

```
src/
  app.config.ts    which world to play, the name in the header, the storage prefix
  worlds/          tutorial.ts (Snack Attack); put your worlds here
  engine/          the engine, the regex parser, fuzzy matching, line styling
  stores/game.ts   the command flow: split, parse, run, ask the LLM on a miss, save
  components/      the terminal, the boot sequence, the consent banner
  styles/crt.css   the CRT
  types/world.ts   the world schema, with a comment on every field
server/            the optional intent server (Express + Gemini)
tests/             engine tests against a fixture world, plus Snack Attack played end to end
docs/              this site (npm run docs:dev)
```

## Make it yours

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

## Checks

```bash
npm run lint && npm run type-check && npm run test:coverage && npm run build
cd server && npm install && npm run lint && npm test
```

CI runs the same on every push and PR.
