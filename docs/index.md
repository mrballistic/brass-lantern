---
layout: home

hero:
  name: BRASS LANTERN
  text: A text adventure engine on npm
  image:
    src: /brand/lantern-mark-amber.svg
    alt: The Brass Lantern mark, an amber lantern
  tagline: Three packages for classic parser games in a CRT terminal. Write your own world as data, mount it on a page, or load a Z-machine story file. The demo plays the Zork trilogy.
  actions:
    - theme: brand
      text: Install
      link: /guide/using-the-library
    - theme: alt
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Play the demo
      link: https://mrballistic.github.io/brass-lantern/demo/
      target: _self
    - theme: alt
      text: Story files
      link: /guide/z-machine
    - theme: alt
      text: GitHub
      link: https://github.com/mrballistic/brass-lantern

features:
  - title: Worlds are data
    details: A game is one TypeScript object of rooms, items, people, events and the rules that join them. Write a story without touching engine code.
  - title: A parser that meets players halfway
    details: Classic verbs run instantly, and so do chained commands like “take key and wallet”. Anything else can go to an LLM through the optional server package, which only maps it onto your verbs and IDs; it never writes the story.
  - title: The terminal is the product
    details: Boot sequence, scanlines, phosphor bloom and decay, flicker, a typewriter that changes pace with the scene. All CSS, no canvas.
  - title: The genre’s good parts, built in
    details: Gated rooms, use rules, gifts, timed interruptions, hints, a score with ranks, and endings that remember what you did.
  - title: Plays Zork, too
    details: Z-machine story files run in the same terminal, starting with Zork I, II and III, which Microsoft released under the MIT License. Pick from a cartridge menu; saves and autosave included.
  - title: Bring your own story files
    details: Type LOAD at the menu to play a Z-machine game from your own computer. It stays in your browser; nothing is uploaded.
    link: /guide/z-machine#playing-your-own-story-files
---

<div class="npm-home">

## Install

```sh
npm install @brass-lantern/engine @brass-lantern/vue vue pinia
```

## Three packages

| Package | What it is |
|---|---|
| [`@brass-lantern/engine`](https://www.npmjs.com/package/@brass-lantern/engine) | The game itself: parser, rules, saves and the Z-machine bridge. Runs anywhere, no DOM. |
| [`@brass-lantern/vue`](https://www.npmjs.com/package/@brass-lantern/vue) | The CRT terminal, themes and `mountGame`, as a Vue 3 component. |
| [`@brass-lantern/server`](https://www.npmjs.com/package/@brass-lantern/server) | Optional. An Express route that lets players type like people, through Gemini. |

## A game on a page

```ts
import { mountGame } from '@brass-lantern/vue';
import '@brass-lantern/vue/style.css';
import type { World } from '@brass-lantern/engine';

const world: World = {
  startRoom: 'study',
  rooms: {
    study: {
      name: 'The Study', description: 'A desk, a chair, and the dark.',
      exits: {}, items: ['lantern'], npcs: [], onEnter: [],
    },
  },
  items: {
    lantern: { name: 'brass lantern', aliases: ['lamp'], description: 'Unlit, for now.', portable: true, tags: [] },
  },
  npcs: {}, events: {}, dialogue: {}, flagLabels: {},
};

mountGame('#app', {
  cartridges: [{ kind: 'world', id: 'study', title: 'THE STUDY', world }],
  storagePrefix: 'study',
});
```

Then [build a real one](/guide/building-worlds/two-rooms), or read [Using the library](/guide/using-the-library) for the component, themes and options.

</div>

<div class="built-with">

## Built with Brass Lantern

**[Office Space: The Text Adventure](https://initech.mrballistic.com)** is a full-length game on this engine: four chapters from a very bad Monday at Initech to a field, a baseball bat and a printer that has it coming. It runs with the intent server, so you can type like a person.

</div>
