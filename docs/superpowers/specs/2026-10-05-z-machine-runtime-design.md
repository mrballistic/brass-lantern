# Z-machine runtime: design

**Status:** approved 2026-10-05. Phase 1 of 2.

## Goal

Brass Lantern plays Z-machine story files in its CRT terminal, alongside its native worlds, starting with **Zork I** exactly as Infocom shipped it.

## Decisions

| Question | Decision |
|---|---|
| Interpreter | **ifvms 1.1.6** (MIT), the ZVM inside Parchment. Not Frotz: it's GPL-2.0, which an MIT project can't bundle. |
| Glk layer | **glkapi.js** from glkote-term 0.4.4 (MIT), **vendored** and wrapped as a `createGlk()` factory, so each session gets a fresh instance and switching cartridges needs no page reload. |
| Display | Our own `BrowserGlkOte`, which turns GlkOte protocol updates into terminal lines and a header status line. |
| First story | `zork1.z3`, Release 119 / 880429, from `historicalsource/zork1` (MIT, Microsoft, 2025). |
| Choosing a game | A **cartridge menu** after the boot sequence, listing native worlds and story files. A build with one cartridge boots straight into it, so INITECH TERMINAL is unchanged. |
| Saves | Zork's own **SAVE/RESTORE** commands store named saves in localStorage, plus an **autosave every turn**, so a reload resumes where you were. |
| AI help | **Phase 2**, separate plan. Phase 1 is a faithful interpreter. |
| Repo | **brass-lantern** (public). Synced to the private repo afterwards. |

## Facts established by spikes

Two Node spikes ran the real `zork1.z3`:

- **The protocol works with our own display layer.**
  - Buffer-window updates are `{ id, text: [{ append?, content: [style, text, …] }] }`, and `{}` is a blank line.
  - The game echoes the player's command in style `input`, then ends each turn with a `>` paragraph. Some prompts end inline, as in `"(Y is affirmative): >"`.
  - The status line is a grid window: `" West of House   …   Score: 0  Turns: 0 "`.
- **Autosave needs three things:**
  - `do_vm_autosave: true`;
  - a dispatch object (ifvms's `ZVMDispatch`, which glkapi calls `GiDispa`);
  - `Dialog.autosave_read` / `autosave_write`, plus `GlkOte.save_allstate()`.
  
  glkapi autosaves on every input wait. On autorestore, it passes the saved GlkOte state back as `update(data, restored)`, and the first update replays the whole previous transcript.
- **ifvms writes into the story buffer it's given**, so the header changes and with it the game signature. Every session needs its own copy of the bytes; otherwise saves and autosaves stop matching.
- **SAVE and RESTORE** go through `specialinput: { type: 'fileref_prompt', filemode, filetype, gameid }`, answered with `{ type: 'specialresponse', response: 'fileref_prompt', value: ref | null }`. A non-streaming Dialog stores whole files as byte arrays.
- **glkapi.js isn't strict-mode safe** as shipped: it has seven implicit globals (`ch, content_box, fref, ix, lineobj, lx, split`). Declaring them inside the factory fixes it, and the vendored file runs Zork as an ES module.
- **Game over** (QUIT, Y) arrives as `{ type: 'exit', disable: true }`, and glkapi deletes the autosave.

## Behavior

- **Menu.** It lists cartridges as `1  SNACK ATTACK   native` and `2  ZORK I   Z-machine v3`; typing a number inserts one.
  - **EJECT** returns to the menu, in builds with more than one cartridge.
  - The last cartridge played, if it has a game in progress, boots directly on reload, its transcript rendered instantly.
- **Header.** On the left, `<appName> v<version> · <cartridge title>`; the title appears only in multi-cartridge builds. On the right, the Z-machine status line (`West of House  Score: 0  Turns: 0`), or `MOVES: n` for native worlds.
- **Output.** Game text becomes terminal lines, without the game's echo and without the trailing `>`. The terminal echoes input as `> command`, as it does for native worlds.
- **SAVE/RESTORE.** The terminal asks for a save name, and RESTORE lists the existing saves. CANCEL aborts, and restoring a missing name lets the game report "Failed."
- **Reload mid-game.** The transcript renders instantly, and the VM autorestores to the same turn, with no replayed text.
- **Game over.** The terminal says `[The story has ended. Type PLAY to start again.]` and clears the transcript, so a reload doesn't resume a finished game.
- **Failures.** A story that won't download shows a message, and EJECT still works. If storage is unavailable or full, play continues and only persistence is lost.

## Out of scope (phase 1)

- AI rewriting of unrecognized input (phase 2).
- Loading your own story files.
- Graphics, sound, and timed input.
- Grid windows other than the status line.
- Glulx.

## Licensing

- **ifvms** and **glkote-term/glkapi.js** are MIT. The vendored file keeps Andrew Plotkin's MIT header and notes our modification.
- **`zork1.z3`** is MIT (Microsoft, 2025). It ships with its license as `public/stories/LICENSE-zork1.txt`. "ZORK" is a trademark: Brass Lantern plays it but never brands itself with it.
