# Playing story files

Brass Lantern also runs **Z-machine story files**, the format Infocom’s games shipped in. The demo includes the **Zork trilogy** (Zork I Release 119, Zork II Release 63, Zork III Release 25), which Microsoft released under the MIT License in 2025. It plays exactly as Infocom wrote it, in the same CRT terminal as native worlds.

## Playing Zork

Open the [demo](https://mrballistic.github.io/brass-lantern/demo/) and type `2` for Zork I. You start west of a white house, with a mailbox. The rest is up to you. Zork II (`3`) and Zork III (`4`) pick up where it leaves off, each opening with a brass lantern close by. Each game stands alone; nothing carries over between them.

If you’ve never played it, Zork’s parser is older and stricter than Brass Lantern’s:

| Command | Notes |
|---|---|
| `N` `S` `E` `W` `NE` `NW` `SE` `SW` `UP` `DOWN` | Directions. Diagonals matter: the house is circled by them. |
| `LOOK` (`L`), `EXAMINE` *thing* | `X` isn’t a word in the Zork games; spell out EXAMINE. |
| `TAKE` *thing*, `TAKE ALL`, `DROP` *thing* | Also `PUT` *thing* `IN` *thing*. |
| `INVENTORY` (`I`) | |
| `OPEN`, `READ`, `MOVE`, `TURN ON`, `ATTACK` *creature* `WITH` *weapon* | The verbs you’ll need most. |
| `AGAIN` (`G`) | Repeats your last command. |
| `SCORE`, `DIAGNOSE` | Your score, and how hurt you are. |
| `VERBOSE`, `BRIEF` | Full room descriptions every time, or only on your first visit. |
| `SAVE`, `RESTORE` | See [Saving](#saving). SAVE before anything risky. |
| `EJECT` | Back to the cartridge menu. The game autosaves, so it’s there when you come back. |

Brass Lantern’s own command splitting, the intent server and HINT don’t apply here. Zork’s parser chains commands itself (`take lamp and sword`, `north. open door`), but it has no hints, and it’s more fun that way. Map as you go.

## Cartridges

`src/app.config.ts` lists what the terminal offers:

```ts
export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial },
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
  { kind: 'zcode', id: 'zork2', title: 'ZORK II', story: 'stories/zork2.z3', format: 'Z-machine v3' },
  { kind: 'zcode', id: 'zork3', title: 'ZORK III', story: 'stories/zork3.z3', format: 'Z-machine v3' },
];
```

- **With more than one cartridge**, the terminal shows a menu after it boots. Type a number to insert one; EJECT brings you back.
- **With one cartridge**, it boots straight in, with no menu.
- **After a reload**, the last cartridge you played comes straight back if it has a game in progress.

To add a story, put the file in `public/stories/` and add an entry. `story` is relative to the site’s base, so it works under a subpath too. Story files are binary and fetched on demand, and the interpreter is a separate chunk that loads only when a story cartridge is inserted, so a build that offers only native worlds never downloads it.

## Playing your own story files

Got a story file? Type **LOAD** at the cartridge menu and pick it, or drag it onto the terminal. It plays straight away, and joins the menu, marked *yours*, for next time.

- **It never leaves your browser.** The file goes on a shelf in IndexedDB; nothing is uploaded, and the site never hosts it. That’s what makes this the way to play games you own but nobody may redistribute, like Infocom’s other titles from the *Lost Treasures* and *Masterpieces* collections.
- **Accepted:** Z-machine versions 3, 4, 5 and 8, raw (`.z3`, `.z4`, `.z5`, `.z8`) or in a Blorb (`.zblorb`, `.zlb`). Glulx games (`.ulx`, `.gblorb`) and version 6 (*Zork Zero*, *Arthur*, *Shogun*, *Journey*) aren’t supported, and LOAD says so.
- **Saving works like any cartridge:** SAVE, RESTORE, autosave, and resume on reload.
- **REMOVE and its number** takes a story off the shelf. Its saved games stay, so loading it again picks up where you were.
- **Loading the same file twice** keeps one copy; the cartridge is identified by the story’s release, serial number and checksum, not its file name. The title in the menu comes from the file name.
- **If the browser won’t store it** (private browsing, full storage), it still plays, until the next reload.
- **Only in builds with a menu.** A single-cartridge build boots straight into its game and has no LOAD.

## Finding more story files

- **The [IF Archive](https://www.ifarchive.org/indexes/if-archive/games/zcode/)** holds thousands of Z-machine games, from the 1980s to this year. Files end in `.z3`, `.z5` or `.z8`; LOAD plays them.
- **Infocom’s other games** are still under copyright, except Zork I, II and III, which Microsoft released under the MIT License in 2025 ([historicalsource](https://github.com/historicalsource)). Those three ship here; the rest can’t be redistributed.
- **Check the license before you publish one.** Playing a story file locally is one thing; putting it on a public site is redistribution. Many IF Archive games allow it; some don’t.
- **Writing your own:** [Inform 6](https://www.inform-fiction.org/) and [ZIL](https://foss.heptapod.net/zilf/zilf) (Infocom’s own language) both compile to the Z-machine.

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

- **SCRIPT** (a transcript file) isn’t supported; it says so and the game carries on.
- **A full browser storage** makes SAVE say the save didn’t fit, rather than claiming success.
- **A story that won’t download** within 20 seconds shows an error; reload to try again, or EJECT.

- **Formats:** Z-machine versions 3, 4, 5 and 8 (what ifvms supports). No Glulx.
- **Windows:** only the status line from the upper window is shown, so games that draw menus or quote boxes there lose them.
- **No graphics, sound or timed input.**
- **Loose phrasing:** the intent server doesn’t help with story files yet. Story files have their own parsers, and that’s planned as a separate feature.
