# Cartridges and storage

## Cartridges

Cartridges are what you pass in `GameOptions.cartridges` (see [Using the library](../guide/using-the-library#every-option)). The types, `Cartridge`, `WorldCartridge` and `ZCodeCartridge`, are exported from both `@brass-lantern/engine` and `@brass-lantern/vue`.

**A native world:**

| Field | Type | Notes |
|---|---|---|
| `kind` | `'world'` | |
| `id` | string | Unique; part of the save key. |
| `title` | string | The menu and the header. |
| `world` | `World` | See the [world schema](./world-schema). |
| `saveKey?` | string | Overrides the save key, e.g. to keep loading saves written under an older key. |

**A Z-machine story file:**

| Field | Type | Notes |
|---|---|---|
| `kind` | `'zcode'` | |
| `id` | string | Unique; part of the transcript key. |
| `title` | string | The menu and the header. |
| `story` | string | The file’s URL, relative to `GameOptions.storyBaseUrl` (default `/`), e.g. `stories/zork1.z3`. |
| `format` | string | Shown in the menu, e.g. `Z-machine v3`. |

Stories a player loads with LOAD become cartridges too, with `local: true` and an id like `local-r119-880429-bf44` (release, serial number, checksum). You don’t write those.

With one cartridge, the terminal boots straight into it: no menu, no EJECT, no LOAD. With more, it opens on the menu, and a reload goes straight back to the last cartridge if it has a game in progress.

## Browser storage

Everything is in the player’s browser, under `storagePrefix`:

| Key | What |
|---|---|
| `<prefix>:save:<id>` | A native world’s save, with up to 500 lines of history. Or the cartridge’s `saveKey`. |
| `<save key>:named:<name>` | A native world’s named SAVE. |
| `<prefix>:theme` | The player’s THEME, BLOOM and EFFECTS choices. |
| `<prefix>:cartridge` | The last cartridge inserted. EJECT clears it, so a reload after EJECT shows the menu. |
| `<prefix>:z:<id>:transcript` | A story’s screen, up to 500 lines, so a reload can redraw it. |
| `<prefix>:z:auto:<signature>` | A story’s autosave, written every turn and cleared when it ends. |
| `<prefix>:z:file:save:<gameid>:<name>` | A named SAVE in a story. |

Stories loaded with LOAD are in IndexedDB, in a database named `<prefix>:stories`.

The library stores nothing else. Anything your app keeps (an analytics consent answer, say) is its own: the demo site, for example, keeps its consent answer at `<prefix>:analytics-consent` and, only after consent, an anonymous Google Analytics client ID at `<prefix>:ga-cid` (and the session ID, `<prefix>:ga-sid`, in sessionStorage).
