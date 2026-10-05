# Playing story files

Brass Lantern also runs **Z-machine story files**, the format Infocom’s games shipped in. The demo includes **Zork I** (Release 119), which Microsoft released under the MIT License in 2025. It plays exactly as Infocom wrote it, in the same CRT terminal as native worlds.

## Cartridges

`src/app.config.ts` lists what the terminal offers:

```ts
export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial },
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
];
```

- **With more than one cartridge**, the terminal shows a menu after it boots. Type a number to insert one; EJECT brings you back.
- **With one cartridge**, it boots straight in, with no menu.
- **After a reload**, the last cartridge you played comes straight back if it has a game in progress.

To add a story, put the file in `public/stories/` and add an entry. `story` is relative to the site’s base, so it works under a subpath too.

## Saving

- **SAVE** asks for a name, and **RESTORE** lists the saves you have; type CANCEL to back out. Saves live in your browser’s localStorage, per story.
- **Autosave:** the game also saves itself every turn, so a reload picks up exactly where you were.
- **When the story ends** (QUIT, or a final death), its autosave is cleared. Type PLAY to start again.

## How it works

- **ifvms** ([MIT](https://github.com/curiousdannii/ifvms.js)), the Z-machine inside Parchment, runs the story.
- It talks to the screen through **Glk**, a standard interface for interactive fiction. Brass Lantern includes a modified copy of glkapi.js (`src/zmachine/vendor/`), wrapped so each game gets its own instance.
- **`BrowserGlkOte`** (`src/zmachine/glkote.ts`) turns the game’s screen updates into terminal lines, and its status line into the header.
- **`LocalStorageDialog`** (`src/zmachine/dialog.ts`) stores saves and autosaves.

The game’s own echo of your command, and its `>` prompt, are dropped, since the terminal draws its own.

## Limits

- **Formats:** Z-machine versions 3, 4, 5 and 8 (what ifvms supports). No Glulx.
- **Windows:** only the status line from the upper window is shown, so games that draw menus or quote boxes there lose them.
- **No graphics, sound or timed input.**
- **Loose phrasing:** the intent server doesn’t help with story files yet. Story files have their own parsers, and that’s planned as a separate feature.
