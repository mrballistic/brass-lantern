# Changelog

## 1.6.1 (2026-10-05)

- **UNDO keeps the screen.** Taking back a move no longer clears the terminal and types everything out again; the lines that stay are shown at once and only “[Previous turn undone.]” types.

## 1.6.0 (2026-10-05)

Engine parity, stage 3: the parser.

- **Questions back to the player.** A noun that matches more than one thing asks which (“Which door do you mean, the wooden door or the trap door?”), and a verb missing its object asks what (“What do you want to take?”). Answer with just the missing words, or type a new command. Questions take no time and never go to the intent server.
- **Pronouns** for things (`it`, `them`, `that`) and people (`him`, `her`), in either object.
- **AGAIN** (`g`), **OOPS** *word*, and **UNDO**, up to 50 moves back.
- **ALL and EXCEPT:** TAKE ALL, DROP ALL, PUT ALL IN *X*, each with BUT or EXCEPT.
- **Named saves:** SAVE *name* and RESTORE *name*; without a name they ask, and RESTORE lists your saves. LOAD still restores the automatic save.
- **The status line:** Zork's room, score and moves in Infocom style; brass worlds can show the score with `statusLine: 'score'`. **MOVES now counts every move the engine acts on**, not just room changes.
- **SCRIPT / UNSCRIPT** download a transcript; **VERSION** shows the version and the world's new `title` and `credits`.
- **Housekeeping:** SUPERBRIEF shows only room names on arrival; rescheduling a fuse restarts it; effects naming things that don't exist do nothing; the world audit also checks rule and trigger events and condition strings; a dark room's intent context names no room or people; a score kept only with the `score` effect shows; EXAMINE of an item with an empty description works like Zork's.
- **Zork I · Native:** Zork's TAKE ALL (including what can't be taken, and why), EXAMINE of the trophy case and the lamp, and all 68 walkthrough replies matching the original but one allowlisted difference (the reply to a misspelled word).
- **Docs:** a new [Building worlds](https://mrballistic.github.io/brass-lantern/guide/building-worlds/) section: a two-room game from scratch, the Snack Attack walkthrough, and recipes for containers and keys, darkness and death, timers, and endings with world verbs, each a real world file played by a test. The docs site shows the version.

## 1.5.0 (2026-10-05)

Engine parity, stage 2: darkness and time.

- **Structured effects.** Events are lists of lines and typed effects: set and clear flags, move things anywhere, open/close/lock/switch, numeric variables and score, `go`, timers (`schedule`, `cancel`), `chance`, `run`, `die` and `end`. Bracket lines still work.
- **Variables and randomness.** `world.vars`, `var:` and `carrying` conditions. A seeded random generator lives in the game state, so saves and tests replay exactly. Score entries can be conditions (points while a treasure is in the case).
- **Daemons and fuses.** These run after every acted-on turn, never after a miss. Ambient lines are now a kind of daemon.
- **Darkness:**
  - dark rooms and light sources; “too dark to see” as an understood refusal;
  - a world-defined blunder in the dark (Zork's grue);
  - the reply says when the light changes;
  - the LLM context shows nothing of a dark room.
- **Death** (`world.death`): penalty, lives, respawn, items going home or scattering. **Endings** (`world.endings`), with the finale as one of them.
- **Exits** can give different refusals for different reasons (`denials`).
- **VERBOSE, BRIEF, SUPERBRIEF.** These take no game time.
- **Infocom style** runs arrival events before the room description.
- **A world audit test** checks every world for effects and references to things that don't exist.
- **Zork I · Native** goes underground: the cellar (the trap door slams behind you), East of Chasm, the gallery's painting, and the studio's chimney, plus the lamp burning down, the grue and resurrection. 60 walkthrough replies match the original, and so do its death texts.

## 1.4.0 (2026-10-05)

The engine gets Zork's world model: stage 1 of making native worlds as capable as Infocom's.

- **An object tree.** Every item has one parent (a room, the player, another item), so things go in things. Containers (open, close, lock, unlock, capacity, transparent), surfaces, scenery, and objects shared between rooms. The parser only matches what you can see; taking what you can see but can't reach says which container is closed.
- **New verbs:** OPEN, CLOSE, LOCK/UNLOCK … WITH, PUT … IN/ON, TAKE … FROM, LOOK IN/SEARCH, READ, TURN ON/OFF, ENTER, CLIMB, and the diagonals plus U and D.
- **Exits** can be conditional, message-only, or pass through a door.
- **Rules:** `instead` and `after` on items and rooms, for any verb. `onUse` and `onTake` keep working as shorthand.
- **World verbs:** a world declares its own verbs (`world.verbs`), and the parser and intent server learn them from it, with no engine or server change.
- **Descriptions:** first-seen and room sentences for items, first-visit and state-dependent text for rooms, READ text.
- **`style: 'infocom'`:** Zork's listings, BRIEF revisits, newest-first contents and SCORE line.
- **Zork I · Native:** the house and forest rebuilt as a native world, and a test that plays it against the original story file reply by reply (it matches).
- **Save format 2.0.** Older saves are migrated on load.
- **Breaking for worlds:**
  - SNOOZE, INSTALL and SLEEP are no longer built in, and neither are DRIVE, GUT, CLEAN, DRINK, UNPLUG, ANSWER, STAPLE or CLIP. Declare the ones you need as world verbs.
  - `onSnooze` is gone; use `instead.snooze`.
  - OPEN is its own verb, but falls back to an item's use rules when the item isn't a container.
  - Plain MOVE is no longer GO (MOVE TO still is).
  - The empty-inventory and SMASH refusal lines are neutral by default; set `emptyInventory` and `smashRefusal`.

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
