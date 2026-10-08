# Cartridges and storage

## Cartridges

`apps/site/src/app.config.ts` exports `cartridges`, `appName` (the header) and `storagePrefix` (the namespace for everything stored in the browser).

**A native world:**

| Field | Type | Notes |
|---|---|---|
| `kind` | `'world'` | |
| `id` | string | Unique; part of the save key. |
| `title` | string | The menu and the header. |
| `world` | `World` | See the [world schema](./world-schema). |
| `saveKey?` | string | Overrides the save key. Snack Attack uses it to keep loading saves from 1.0.0, before cartridges had their own keys. |

**A Z-machine story file:**

| Field | Type | Notes |
|---|---|---|
| `kind` | `'zcode'` | |
| `id` | string | Unique; part of the transcript key. |
| `title` | string | The menu and the header. |
| `story` | string | The file’s URL, relative to the site’s base, e.g. `stories/zork1.z3`. |
| `format` | string | Shown in the menu, e.g. `Z-machine v3`. |

Stories a player loads with LOAD become cartridges too, with `local: true` and an id like `local-r119-880429-bf44` (release, serial number, checksum). You don’t write those.

With one cartridge, the terminal boots straight into it: no menu, no EJECT, no LOAD. With more, it opens on the menu, and a reload goes straight back to the last cartridge if it has a game in progress.

## Browser storage

Everything is in the player’s browser, under `storagePrefix`:

| Key | What |
|---|---|
| `<prefix>:save:<id>` | A native world’s save, with up to 500 lines of history. Or the cartridge’s `saveKey`. |
| `<save key>:named:<name>` | A native world’s named SAVE. |
| `<prefix>:cartridge` | The last cartridge inserted. EJECT clears it, so a reload after EJECT shows the menu. |
| `<prefix>:z:<id>:transcript` | A story’s screen, up to 500 lines, so a reload can redraw it. |
| `<prefix>:z:auto:<signature>` | A story’s autosave, written every turn and cleared when it ends. |
| `<prefix>:z:file:save:<gameid>:<name>` | A named SAVE in a story. |
| `<prefix>:analytics-consent` | The player’s answer to the consent banner. Only in builds with analytics. |
| `<prefix>:ga-cid` | An anonymous analytics client ID, only after consent. (`<prefix>:ga-sid`, the session ID, is in sessionStorage.) |

Stories loaded with LOAD are in IndexedDB, in a database named `<prefix>:stories`.
