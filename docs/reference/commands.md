# Player commands

The verbs are fixed; a world gives them things to act on. Anything the regex parser doesn't recognize, or recognizes but can't act on, can go to the [intent server](../guide/intent-server), which maps loose phrasing onto these.

| Command | Also | Notes |
|---|---|---|
| GO *place* | `n` `s` `e` `w` `up` `down` `in` `out`, `walk/head/run to …`, a bare exit label | Matches the room's exit labels. |
| LOOK | `l` | Describes the room again. |
| TAKE *item* | `get` `grab` `pick up`, `take all` | |
| DROP *item* | `put down` | |
| EXAMINE *thing* | `x` `inspect` `look at` `read` | Items and people. |
| USE *item* [ON *thing*] | `open` `push` `pull` `press` `unplug` `answer` `operate` `insert` `put X in Y` `attach X to Y` `gut` `clean` `drink` | See [use rules](./world-schema#userule). |
| GIVE *item* TO *person* | `hand` `offer` `return` | With one person present, GIVE *item* is enough. |
| TALK TO *person* | `speak/chat with`, `ask … about …` | With one person present, TALK is enough. |
| WEAR *item* | `put on` | |
| SMASH *thing* [WITH *item*] | `hit` `break` `destroy` `attack` `wreck` `whack` | |
| SNOOZE | `hit snooze` | |
| SLEEP | `nap` `go to bed` `lie down` | Uses the item aliased `bed`. |
| WAIT / SIT | `z` | Takes a `wait` / `sit` exit if the room has one. |
| INSTALL [*item*] | `load` | USE with something carried. |
| INVENTORY | `i` `inv` | |
| HINT | `hints` `clue` | |
| SCORE | | |
| SAVE / LOAD / RESTART | | Saves are in the browser. |
| COOKIES | `privacy` | Analytics settings, when analytics are configured. |
| HELP | `?` | |

**Chaining:** `take key and wallet`, `north then look`, `west. take lamp.` Each piece runs separately (and gets its own intent-server retry if it misses).

**Pronouns:** `it`, `them` and `that` mean the last thing you acted on, as in `take the mug then give it to gary`.
