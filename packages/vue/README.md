<p align="center"><img src="https://raw.githubusercontent.com/mrballistic/brass-lantern/main/docs/public/brand/lantern-mark-amber.svg" alt="" width="72" height="72"></p>

# Brass Lantern for Vue

`@brass-lantern/vue`: the CRT terminal, the game store, five themes and `mountGame`, on top of `@brass-lantern/engine`.

## Install

```bash
npm i @brass-lantern/engine @brass-lantern/vue vue pinia
```

Needs `vue` 3.5 or later and `pinia` 4. The Z-machine interpreter (ifvms) comes with it.

## Use

```ts
import { mountGame } from '@brass-lantern/vue';
import '@brass-lantern/vue/style.css';
import { tutorial } from '@brass-lantern/engine/worlds';

mountGame('#app', {
  cartridges: [{ kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial }],
  storagePrefix: 'my-game',   // saves, transcripts and the player's theme live under this
  theme: 'crt-green',         // optional: crt-amber (default), crt-green, simple, simple-light, simple-dark
});
```

Prefer a component? `<BrassLantern :options="options" />` takes the same options, and `createGameStore(options)` gives you the store without the terminal. Two games on one page need different `storagePrefix` values.

Players can type THEME, BLOOM ON|OFF and EFFECTS ON|OFF; the choice is remembered in the browser. Every option, custom themes and the intent server are in the guide.

## Docs

[Using the library](https://mrballistic.github.io/brass-lantern/guide/using-the-library) is the guide for all three packages; the [docs](https://mrballistic.github.io/brass-lantern/) cover worlds, story files and the intent server. Source and issues: [github.com/mrballistic/brass-lantern](https://github.com/mrballistic/brass-lantern). MIT licensed.
