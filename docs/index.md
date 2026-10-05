---
layout: home

hero:
  name: BRASS LANTERN
  text: A text adventure engine
  tagline: Classic parser games in a CRT terminal. Worlds are data. Loose phrasing understood.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Play the demo
      link: https://mrballistic.github.io/brass-lantern/demo/
      target: _self
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
---
