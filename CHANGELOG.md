# Changelog

## 1.0.0 (2026-10-04)

First public release of the engine.

- Deterministic text-adventure engine: rooms, items, people, events, conditions, use rules, gifts, timed interruptions, hints, scoring and a finale, all as world data.
- Regex parser with compound commands (`take key and wallet`, `north then look`) and pronouns.
- Optional intent server: Gemini maps loose phrasing onto the engine's verbs; replies are reduced to verbs plus identifiers.
- CRT terminal: boot sequence, scanlines, phosphor bloom and decay, flicker, typewriter rendering.
- Saves in localStorage; analytics only with consent, and only when configured.
- Snack Attack, a three-room tutorial world, as the default.
