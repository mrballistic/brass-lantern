# Changelog

## 1.3.0 (2026-10-05)

- **Play your own story files.** LOAD at the cartridge menu (or a file dropped on the terminal) plays a Z-machine story from the player’s computer: versions 3, 4, 5 and 8, raw or in a Blorb. It’s kept in IndexedDB, joins the menu marked *yours*, saves and resumes like any cartridge, and is never uploaded. REMOVE takes one off the shelf. Glulx and version 6 files are turned away with a reason.

## 1.2.0 (2026-10-05)

- **Zork II and Zork III** join Zork I, from the same MIT release (Release 63 and 25). The demo menu now offers all three.
- The README and docs lead with both ways to play, with a Zork command guide and where to find more story files.

## 1.1.0 (2026-10-05)

- **Z-machine story files.** Brass Lantern now runs Infocom-format games in its terminal, through ifvms (MIT) and a per-session Glk layer. **Zork I** (Release 119, MIT, Microsoft 2025) is included.
- **Cartridge menu** after the boot sequence, listing native worlds and story files. Single-cartridge builds boot straight in. EJECT returns to the menu, and a reload resumes the last game in progress.
- **Saving in story files:** SAVE and RESTORE prompt for names stored in localStorage, plus an autosave every turn. The game’s status line shows in the header.
- `src/app.config.ts` now exports `cartridges` instead of `world`. Native saves are per cartridge (`<prefix>:save:<id>`, overridable with `saveKey`).
- The boot animation fills the screen, and the block cursor follows the caret instead of sitting at the far right.
- Fixed: RESTART left the screen without the new opening.

## 1.0.0 (2026-10-04)

First public release of the engine.

- Deterministic text-adventure engine: rooms, items, people, events, conditions, use rules, gifts, timed interruptions, hints, scoring and a finale, all as world data.
- Regex parser with compound commands (`take key and wallet`, `north then look`) and pronouns.
- Optional intent server: Gemini maps loose phrasing onto the engine's verbs; replies are reduced to verbs plus identifiers.
- CRT terminal: boot sequence, scanlines, phosphor bloom and decay, flicker, typewriter rendering.
- Saves in localStorage; analytics only with consent, and only when configured.
- Snack Attack, a three-room tutorial world, as the default.
