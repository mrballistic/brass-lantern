# Player commands

The verbs are fixed; a world gives them things to act on. Anything the regex parser doesn't recognize, or recognizes but can't act on, can go to the [intent server](../guide/intent-server), which maps loose phrasing onto these.

| Command | Also | Notes |
|---|---|---|
| GO *place* | `n` `s` `e` `w` `ne` `nw` `se` `sw` `u` `d` `in` `out`, `walk/head/run/move to …`, a bare exit label | Matches the room's exit labels. |
| ENTER [*place*] | `go into` | An exit by name, the way in, or the exit through a door you name. |
| CLIMB [*thing*] | `climb up`, `climb down` | Up, or the room's `climb` exit. |
| LOOK | `l` | Describes the room again. |
| TAKE *item* | `get` `grab` `pick up`, `take all` | |
| DROP *item* | `put down` | |
| EXAMINE *thing* | `x` `inspect` `look at` | Items and people, and what's inside or on an item. |
| READ *thing* | | The item's text. |
| OPEN / CLOSE *thing* | `shut` | Containers and doors. |
| LOCK / UNLOCK *thing* WITH *key* | | |
| PUT *item* IN / ON *thing* | `insert`, `place`, `set` | Into an open container with room, or onto a surface. |
| TAKE *item* FROM *thing* | `get … out of`, `remove … from` | |
| LOOK IN *thing* | `search` | What's inside. |
| TURN ON / OFF *thing* | `switch on`, `light` | Switchable items. |
| USE *item* [ON *thing*] | `push` `pull` `press` `operate` `attach X to Y` | See [use rules](./world-schema#userule). OPEN and PUT fall back to an item's use rules when it isn't a container. |
| GIVE *item* TO *person* | `hand` `offer` `return` | With one person present, GIVE *item* is enough. |
| TALK TO *person* | `speak/chat with`, `ask … about …` | With one person present, TALK is enough. |
| WEAR *item* | `put on` | |
| SMASH *thing* [WITH *item*] | `hit` `break` `destroy` `attack` `wreck` `whack` | |
| WAIT / SIT | `z` | Takes a `wait` / `sit` exit if the room has one. |
| INVENTORY | `i` `inv` | |
| HINT | `hints` `clue` | |
| SCORE | | |
| QUIT | | Prints the world’s `quit` reply; the game carries on. |
| SAVE / LOAD / RESTART | | Saves are in the browser. |
| COOKIES | `privacy` | Analytics settings, when analytics are configured. |
| EJECT | | Back to the cartridge menu (builds with more than one cartridge). |
| LOAD (at the menu) | `open`, or drop a file on the terminal | Play a Z-machine story file from your computer. In a native world, LOAD restores your save instead. |
| REMOVE *number* (at the menu) | `forget` | Take a story you loaded off the shelf. |
| PLAY | | Start a story file again after it ends. |
| CANCEL | | At a story file’s save or restore prompt. |
| HELP | `?` | |

**World verbs:** a world can add its own (SNOOZE, PRAY, MOVE …); they're listed in its HELP. See [World verbs](./world-schema#world-verbs).

**Chaining:** `take key and wallet`, `north then look`, `west. take lamp.` Each piece runs separately (and gets its own intent-server retry if it misses).

**Pronouns:** `it`, `them` and `that` mean the last thing you acted on, as in `take the mug then give it to gary`.

**Keys:** Up and Down step through your last 100 commands, keeping whatever you’d started typing. Enter on an empty line, or any letter, finishes the text that’s typing out.
