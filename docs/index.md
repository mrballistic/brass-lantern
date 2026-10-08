---
layout: home

hero:
  name: BRASS LANTERN
  text: A text adventure engine
  tagline: Classic parser games in a CRT terminal. Write your own as data, or load a Z-machine story file. The demo plays the Zork trilogy.
  actions:
    - theme: brand
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
    details: Classic verbs run instantly, and so do chained commands like “take key and wallet”. Anything else can go to an LLM, which only maps it onto your verbs and IDs; it never writes the story.
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

<div class="built-with">

## Built with Brass Lantern

**[Office Space: The Text Adventure](https://initech.mrballistic.com)** is a full-length game on this engine: four chapters from a very bad Monday at Initech to a field, a baseball bat and a printer that has it coming. It runs with the intent server, so you can type like a person.

</div>
