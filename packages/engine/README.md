<p align="center"><img src="https://raw.githubusercontent.com/mrballistic/brass-lantern/main/docs/public/brand/lantern-mark-amber.svg" alt="" width="72" height="72"></p>

# Brass Lantern engine

`@brass-lantern/engine`: worlds as data, a forgiving regex parser, a deterministic turn loop that runs in Node or the browser, and a Z-machine runtime for story files like Zork. No Vue, no DOM.

## Install

```bash
npm i @brass-lantern/engine
```

Node 24 or later. TypeScript 5 or later works with `bundler`, `node16` and `nodenext` resolution; the public types mention `fetch` and `Storage`, so include the DOM lib or `@types/node`.

## Use

```ts
import { auditWorld, createGame } from '@brass-lantern/engine';
import { tutorial } from '@brass-lantern/engine/worlds';

console.log(auditWorld(tutorial));            // [] when the world has no broken references

const game = createGame(tutorial, { seed: 1 });
console.log(game.opening.join('\n'));
const reply = game.send('open drawer then take stapler');
console.log(reply.lines.join('\n'));          // reply: { lines, gameOver, awaiting }
```

## Entry points

| Import | What |
|---|---|
| `@brass-lantern/engine` | `createGame`, `auditWorld`, the parser, `execute` and the types (`World`, `Cartridge`, `GameState`) |
| `@brass-lantern/engine/worlds` | The bundled worlds: Snack Attack (`tutorial`), Zork I (`zork1`) and the docs examples |
| `@brass-lantern/engine/zmachine` | Story-file runtime: `ZMachineSession`, `readStoryFile`, `SaveStore`, `localStorageSaveStore` |
| `@brass-lantern/engine/zmachine/session` | Just the session, so a UI can load the interpreter on demand |

The core and `./worlds` also load with `require()` on Node 24 and later; the Z-machine entries are ESM only.

## Story files

The Z-machine runtime uses [ifvms](https://github.com/curiousdannii/ifvms.js), an optional peer dependency: install it (`npm i ifvms`) to use `./zmachine` in Node. Without it the import fails with an error that names the package.

## Docs

[Using the library](https://mrballistic.github.io/brass-lantern/guide/using-the-library) is the guide for all three packages; the [docs](https://mrballistic.github.io/brass-lantern/) cover worlds, story files and the intent server. Source and issues: [github.com/mrballistic/brass-lantern](https://github.com/mrballistic/brass-lantern). MIT licensed.
