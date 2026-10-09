# Player commands

The built-in verbs are fixed; a world gives them things to act on, and can add verbs of its own. Anything the regex parser doesn’t recognize, or recognizes but can’t act on, can go to the [intent server](../guide/intent-server), which maps loose phrasing onto these.

| Command | Also | Notes |
|---|---|---|
| GO *place* | `n` `s` `e` `w` `ne` `nw` `se` `sw` `u` `d` `in` `out`, `walk/head/run/move to …`, a bare exit label | Matches the room’s exit labels. |
| ENTER [*place*] | `go into` | An exit by name, the way in, or the exit through a door you name. |
| CLIMB [*thing*] | `climb up`, `climb down` | Up, or the room’s `climb` exit. |
| LOOK | `l` | Describes the room again. |
| TAKE *item* | `get` `grab` `pick up` | |
| DROP *item* | `put down` `leave` | |
| TAKE ALL, DROP ALL, PUT ALL IN / ON *thing* | `everything`; `… but X and Y`, `… except X, Y` | One line per thing: “lamp: Taken.”. TAKE ALL takes what’s in reach and not inside something you carry (in Infocom style, what’s directly in the room, with a reason for anything that can’t be taken). |
| EXAMINE *thing* | `x` `inspect` `look at` | Items and people, and what’s inside or on an item. In the dark you can’t examine people either (“It’s too dark to see.”). |
| FOLLOW *person* | | Bare FOLLOW asks what to follow. With no rule of the world’s, a person (say, Floyd) gets “You’d rather Floyd came to you. Try FLOYD, FOLLOW ME.” and a thing “You can’t follow that.” To bring someone along, order them: *person*, FOLLOW ME. See [FOLLOW](./world-schema#follow). |
| READ *thing* | | The item’s text. |
| OPEN / CLOSE *thing* | `shut` | Containers and doors. |
| LOCK / UNLOCK *thing* WITH *key* | | |
| PUT *item* IN / ON *thing* | `insert`, `place`, `set` | Into an open container with room, or onto a surface. UNDER and BEHIND are asked of the world’s rules (in Infocom style, otherwise “You can’t do that.” / “That hiding place is too obvious.”). |
| TAKE *item* FROM *thing* | `get … out of`, `remove … from` | |
| LOOK IN *thing* | `search` | What’s inside. |
| TURN ON / OFF *thing* | `switch on`, `light`; `extinguish`, `douse`, `blow out`, `put out` | Switchable items. LIGHT on something already burning with no switch (a torch) says “It’s already lit.” |
| BURN *thing* WITH *item* | `light … with`, `burn down`, `ignite`, `incinerate` | Something burnable, with something burning. The thing’s rules answer first (lighting candles with a match). |
| TURN *thing* WITH *tool* | `to`, `for`; SET *thing* TO *x* | A rule on the thing decides; otherwise “This has no effect.” TURN ON … WITH … is TURN ON. The second object can be a number: TURN DIAL TO 4, SET YEAR TO 776 (digits up to 1000, or H:MM); with no rule for it, that answers “This has no effect.” in Infocom style, and elsewhere the intent server gets a turn. Digits that name something here (locker 12) are that thing, not the number. |
| PLUG *thing* WITH *item* | | The same: a rule, or “This has no effect.” |
| BOARD *vehicle* | `get in`, `climb in`, `sit in` | Into a vehicle on the ground here. See [vehicles](./world-schema#vehicles). |
| DISEMBARK [*vehicle*] | `get out`, `get off`, `stand` | Out again, if it’s safe. EXIT on its own does this while you’re aboard, and is a direction (out) otherwise. |
| USE *item* [ON *thing*] | `push` `pull` `press` `operate` `attach X to Y` | See [use rules](./world-schema#userule). OPEN and PUT fall back to an item’s use rules when it isn’t a container. |
| GIVE *item* TO *person* | `hand` `offer` `return` | With one person present, GIVE *item* is enough. |
| TALK TO *person* | `speak/chat with`, `question` | With one person present, TALK is enough. |
| ASK *person* ABOUT *topic* | `tell … about …` | The person’s answer on that topic, if the world gives it [topics](./world-schema#npc); otherwise what TALK TO says. ABOUT ME and ABOUT MYSELF reach a topic keyed or aliased `me` or `myself`. |
| *person*, *command* | `tell/order/ask … to …` | An order (a bare TELL *person* is one too). *person*, FOLLOW ME is one too, answered by the character’s `orders.follow` rules. A character the world lets obey carries out GO, TAKE, DROP and GIVE ME, or answers a rule (“robot, push the button”); others answer or ignore it. An order to such a character ends the rest of the line. |
| WEAR *item* | `put on` | |
| SMASH *thing* [WITH *item*] | `break` `destroy` `wreck` `whack` `beat` | |
| ATTACK *someone* WITH *weapon* | `kill` `hit` `fight` `stab` | At a character who fights, combat; at anything else, SMASH (in a world without combat). In Infocom style, `kill troll` picks the one weapon you hold, or asks. |
| THROW *item* [AT *target*] | `toss` `hurl`; OFF, OVER | A rule on the target decides; otherwise it lands on the floor. OFF and OVER, with no rule: Zork’s refusal in Infocom style; elsewhere the intent server gets a turn. |
| PUSH *thing* *direction* | PUSH *thing* TO *x*; READ *thing* THROUGH *x* | Only a world’s rules answer these (otherwise “You can’t push things to that.” in Infocom style; elsewhere the intent server gets a turn); READ THROUGH reads it. |
| DIAGNOSE | | Your wounds, and how much more you could take. |
| WAIT / SIT | `z`, `sit down` `relax` | Takes a `wait` / `sit` exit if the room has one. |
| INVENTORY | `i` `inv` | |
| HINT | `hints` `clue` | |
| VERBOSE / BRIEF / SUPERBRIEF | | Full descriptions always, on first visits only, or never (LOOK still shows them). Takes no game time. |
| SCORE | | |
| AGAIN | `g` | Repeats the last command, meaning the same things. |
| OOPS *word* | | Replaces the word nobody understood in your last line, and tries it again: `examine lanturn`, then `oops lantern`. |
| UNDO | | Takes back the last move, up to 50 moves. Not kept across a reload, a RESTART or a RESTORE. Takes no game time. |
| QUIT | | Prints the world’s `quit` reply; the game carries on. |
| SAVE [*name*] | | Saves the game under a name (`save before the troll`). Without a name, asks for one. Names are lowercase letters, digits, spaces, `-` and `_`, up to 32. |
| RESTORE [*name*] | | Goes back to a named save. Without a name, lists them and asks which. |
| LOAD | | Goes back to the automatic save, which is kept after every move. |
| RESTART | | Wipes the automatic save and starts over. Named saves are kept. |
| SCRIPT / UNSCRIPT | | Starts a transcript, then downloads it as a text file. |
| VERSION | | The app’s version, then the world’s title and credits. |
| THEME [*name*] | | Lists the color themes, or switches to one (`crt-amber`, `crt-green`, `simple`, `simple-light`, `simple-dark`, plus any the game adds). Remembered in the browser. Takes no game time. Works at the cartridge menu and in story files too, like BLOOM and EFFECTS. |
| BLOOM ON / OFF | | Turns the phosphor glow on or off. |
| EFFECTS ON / OFF | | Turns every screen effect on or off. |
| COOKIES | `privacy` | Analytics settings, when analytics are configured. |
| EJECT | | Back to the cartridge menu (builds with more than one cartridge). |
| LOAD (at the menu) | `open`, or drop a file on the terminal | Play a Z-machine story file from your computer. In a native world, LOAD restores your save instead. |
| REMOVE *number* (at the menu) | `forget` | Take a story you loaded off the shelf. |
| PLAY | | Start a story file again after it ends. |
| CANCEL | | At a SAVE or RESTORE prompt, or a story file’s. |
| HELP | `?` | |

**World verbs:** a world can add its own (SNOOZE, PRAY, MOVE, Zork’s ULYSSES …); they’re listed in its HELP. See [World verbs](./world-schema#world-verbs).

**Typed words:** a world’s SAY, ANSWER or INCANT (see [World verbs](./world-schema#world-verbs)) takes the rest of the line, quoted or not: `answer “a well”`. A quoted phrase is never split at its full stops, commas or `and`, and the text verb ends the line: `say "well". west` says “well” and drops WEST, as in Zork.

**ME:** `me` and `myself` mean you where a thing is expected, and so do `self` and `yourself` unless something here is called that. In an order, “robot, give me the key” hands it to you, and “robot, push yourself” means the robot. A world decides what, if anything, happens; with nothing to say, the reply is the usual one for a word that names nothing here (“You don’t see a “me” here.”).

**Chaining:** `take key and wallet`, `north then look`, `west. take lamp.` Each piece runs separately (and gets its own intent-server retry if it misses). A name that contains “and” stays whole: in a world where “lost and found” is a thing’s name or one of its aliases, `take flair from lost and found and go north` is two commands, not three. Words that only appear in a description don’t count.

**Pronouns:** `it`, `them` and `that` mean the last thing you acted on, as in `take the mug then give it to gary`; `him` and `her` mean the last person.

**Names:** every word of three or more letters you type has to be in the thing’s name or one of its other words: `take red ball` doesn’t find a thing the world calls only “ball”. Shorter words are ignored, and a word can be shortened (`lant` for lantern). See [How names are matched](../guide/building-worlds/#how-names-are-matched).

**Questions:** when a word matches more than one thing, the game asks which (“Which do you mean: the wooden door or the trap door?”, or in Infocom style “Which door do you mean, the wooden door or the trap door?”), and when a verb is missing its object, what (“What do you want to take?”). Answer with just the missing words (`trap`, `the sword`), or type a new command to move on. Questions take no game time, and answers are never sent to the intent server.

**Keys:** Up and Down step through your last 100 commands, keeping whatever you’d started typing. Enter on an empty line, or any letter, finishes the text that’s typing out.
