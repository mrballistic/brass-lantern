# Changelog

## 1.12.5 (2026-10-06)

A fast follow that works through the backlog.

- **Robustness:** a script or capture that throws leaves the turn exactly as it found it, seed included, and the game says “[Something went wrong with that command. Nothing changed.]”; a `continue` rule is undone when the verb's default then misses or asks; leaving a vehicle silently, and a capture that only echoes, are counted right for saves and UNDO; WAIT's extra turns count down timers set on the first, and a cancelled timer no longer ends the wait.
- **Misses the intent server can read:** a second object that names nothing here (UNLOCK DOOR WITH XYZZY) is a miss before any rule fires; in the dark, aboard, GET OUT OF RAFT finds the raft; “tell bob to ask about x” is an order; BURN's refusal uses the right article outside Infocom style.
- **Infocom style:** CLIMB DOWN *thing* walks only if the thing leads there (“The leaflet doesn’t lead downward.”); ENTER *thing* answers as Zork's V-THROUGH; READ's automatic take runs the thing's take rules; BURN wants the flame held and won't burn a character; TAKE X FROM Y with X held is “You already have that!”; a refused move skips the room's end routine; STAND and GET OUT don't guess the vehicle (STAND on foot: “You are already standing, I think.”); one vehicle at a time; a scripted move meets the vehicle checks; a character who arrives stays listed first until something else is put down; things on the kitchen table are “(outside the boat)” while aboard.
- **`death.treasures: 'dark'`:** treasures carried at a death go to an unlit room (Zork's RANDOMIZE-OBJECTS).
- **Zork I · Native:** ENTER HOUSE and ENTER TRAP DOOR; the far basket's other verbs; the coffin goes home to the Egyptian Room when you die.
- **Tidy-ups:** HELP's vehicle line, plainer effect steps, and the docs on a bare TELL.

## 1.12.0 (2026-10-06)

Engine parity, stage 5d: the barrow, the thief's timing, and the whole game. **Zork I · Native is complete**: every room, all 350 points, and a full game that matches the original chapter by chapter.

- **`score<op>N`:** the score as a condition (Zork wins at `score>=350`); the audit refuses a `scoring` entry that tests the score itself.
- **`darkness.arrive`:** a line on arriving in an unlit room (“You have moved into a dark place.”).
- **`{ touch }`:** marks an item handled, ending its first-seen sentence (Zork's TOUCHBIT).
- **Parser:** EXTINGUISH, DOUSE, BLOW OUT and PUT OUT turn things off. TAKE ALL FROM *container* takes what's in it. ENTER *vehicle* boards it.
- **Infocom style:** OPEN touches a container; things on a scenery surface without a heading of its own read as if on the floor (Release 119's kitchen table); a lit light on the floor says “(providing light)”; a scenery container's contents go a level deeper once floor items were listed; a character who arrived this turn is listed before the room's things; THROW X IN Y is PUT.
- **Zork I · Native** gains the Mountains, winning at 350 (the whisper, the ancient map, the secret path), the Stone Barrow and Zork's ending; WIND, the canary's songbird and the brass bauble; the Living Room's door after the cyclops flees; INFLATE and DIG guessing the one tool you hold; the canary's 6 points; the thief's own description until he's been knocked out.
- **Tests:** the whole game natively from the first move to the barrow; the same game against the original in nine chapters, reply for reply, with fights as sync points; the thief's arrival rate measured against the original (median 17 turns on both sides); the diff walkthrough lets him roam.

## 1.11.0 (2026-10-06)

Engine parity, stage 5c: the coal mine.

- **`heaviest<=N`:** a condition on the heaviest thing the player holds, counting what's inside it (Zork's narrow passage).
- **CLIMB UP / CLIMB DOWN** *a thing* (a ladder) keeps its direction and walks that way.
- **TALK runs through rules,** so a character's `instead.talk` can answer.
- **A world verb's `reply`** can name its object: `{target}`, `{a target}`.
- **Infocom style:** ATTACK with no weapon named guesses the one you hold (“(with the sword)”) before anything answers; PUT of something you can see but aren't holding is “You don't have the X.”
- **Zork I · Native** gains the coal mine: the Slide Room and the slide down to the Cellar, the bat that carries you off unless you have the garlic, the gas room that explodes around a flame, the mine's maze and ladder, the narrow passage only the empty-handed fit through, the basket on its chain, and the machine that turns coal into a diamond. Three treasures (the jade figurine, the sapphire bracelet, the huge diamond) and 13 points for lighting the shaft. SMELL, RAISE and LOWER.
- **Tests:** seeded sessions for every new puzzle, against the real story file; sessions can start from another opening (`@prefix:garlic`).

## 1.10.0 (2026-10-06)

Engine parity, stage 5b: the river, the boat, the rainbow and the canyon.

- **Vehicles:** items with `vehicle` that the player can BOARD and DISEMBARK; rooms that are `water` (or water by a condition); Zork's rules for where a vehicle can and can't go, coming ashore, and the vehicle going wherever you go. Aboard, things you drop land in the vehicle, its rules come before the room's (except those it has for itself as an object, `as`), EXIT on its own gets out, and its `onEnd` runs in place of the room's. New conditions `aboard` and `water:`, effects `{ board }` and `{ disembark }`.
- **Zork's grue in the dark:** walking from one unlit room into another can kill (`darkness.stumble`, Zork's 80%).
- **GO runs through rules**, so a room or a vehicle can answer a direction.
- **Infocom style** picks up more of Zork's listings: “(outside the boat)” while aboard, first-seen sentences first, “The box is closed.”, DISEMBARK guessing the one vehicle in sight, and “You don’t have the boat.” for dropping something you can see but aren’t holding.
- **Zork I · Native** gains the magic boat (inflating, the label, punctures and the repair), the Frigid River with its current and its falls, the Stream, the White Cliffs' narrow paths, Sandy Beach and the shovel, the scarab in the Sandy Cave, the buoy and its emerald, the Shore, Aragain Falls, the rainbow and the pot of gold, and the canyon up to Canyon View and the forest. Three treasures. The thief stays off the water, and the flood can carry a boat over the dam.
- **Tests:** seeded sessions for every new puzzle, against the real story file.
- **Docs:** a recipe for a raft on a pond; vehicles in the schema; porting notes for 5b.

## 1.9.0 (2026-10-06)

Engine parity, stage 5a: the dam, the Loud Room, the temple and Hades.

- **Capture:** a room or the world can take input before it's parsed (`capture`): the script sees the raw line and answers, or declines. Captured input never reaches the intent server, and the store's own commands come first.
- **BURN** *something* WITH *something* (and LIGHT … WITH, IGNITE), with `burnable` and `flaming` items; TURN … WITH and PLUG … WITH carry their second object to rules.
- **New steps:** `{ if, then, else }`, `{ go, quiet }`, `{ unvisit }`, `{ free }`, `{ look }`, `{ unlist }` / `{ relist }`, `{ noDarkLine }`. Scripts get the raw line (`ctx.line`) and the parser (`ctx.parse`).
- **Zork's clock:** `world.wait` (WAIT runs several turns, stopping when something happens) and room end routines (`onEnd`, Zork's M-END).
- **Rules** can be limited to an item's role (`as`) or a preposition (`prep`); world verbs can want something held (`held`).
- **Death:** conditional message lines, `variants` (another resurrection, room and event, decided as you die), `instead` (dying while dead), and `darkness.litIf`.
- **Infocom style** picks up more of Zork's habits: READ takes the thing first, EXAMINE reads a thing with no description, “The coffin opens.” with its first-seen sentence, contents listed right after each thing, Zork's PUT … ON refusal, local globals that give way to real objects, and the second object's rules before the first's.
- **Fixes:** the thief's darkness line is said once; a fixture moved out of its room no longer shows there; the intent server hears only about characters you can see.
- **Zork I · Native** gains the dam and the reservoir (the control panel, the leak, draining and refilling), the Loud Room (its echo, and the roar that throws you out), the mirrors, Atlantis, the dome and the torch, the temple, and Hades: the exorcism by Zork's own timers, the hot bell, candles and matches burning down, the coffin and the prayer, and ghost mode after dying past the Altar. Seven treasures. The thief leaves sacred and buried things alone, and the lamp now lasts as long as Zork's.
- **Tests:** scripted sessions play every new puzzle, its wrong orders and branches included, in both versions, with the real story file **seeded** so each session replays exactly.
- **Docs:** a recipe for a room that listens; the schema's capture, steps, death variants and Infocom habits; porting notes for 5a.

## 1.8.0 (2026-10-05)

Engine parity, stage 4b: the thief, the cyclops, topics and orders.

- **Topics:** ASK (or TELL) *someone* ABOUT *something* answers from the character's `topics`, with `topicAliases`, condition-gated entries, entries that run events, and a `noTopic` fallback. Without topics, ASK behaves as TALK TO.
- **Orders:** “*someone*, *do this*” and “tell *someone* to *do this*”. Characters answer with `refuseOrder`, an `instead.order` rule, or “*Name* ignores you.” They don't obey yet.
- **Hidden characters and things:** a character can be `hidden` (in its room, but unseen, unlisted and unfought until revealed), with the `seen:` condition; items can be hidden and revealed with the `hide` and `reveal` effects. Characters also get `aliases` and `scenery`.
- **For scripts:** `npcIn`, `rooms`, `visited`, `treasure`, `tags`, `lit`, `children`, `playerStrength`, `hidden`, and the words typed for objects that didn't resolve. Items get a `treasure` value and rooms free-form `tags`.
- **Rules** can print and let the verb go on (`continue: true`), and **death** can run an event after a resurrection (`death.then`).
- **Fixes:** the player fights with the weapon taken most recently, as Zork does; a knocked-out fighter's wake counter survives your leaving; DIAGNOSE in a world without combat says only how healthy you are; ATTACK at an item in a combat world runs its rules; PUT ALL IN *X* never tries to put *X* in itself; the world audit checks characters' combat hooks, weapons, holdings, descriptions, rules and topics.
- **Zork I · Native** gains the maze, the grating, the Cyclops Room, the Strange Passage and the Treasure Room: the thief (wandering in the story file's room order, stealing treasures, fighting with his stiletto, and his lair) and the cyclops (his moods, his lunch, ULYSSES). The trap door re-bars after a death. The walkthrough runs through the maze and past the cyclops; a new test requires every line of 100 native thief encounters to be one 60 original sessions print.
- **Docs:** recipes for topics and orders and for a wandering character; the world schema's new fields and script helpers; porting notes for the thief and the cyclops.

## 1.7.0 (2026-10-05)

Engine parity, stage 4a: characters, weight, combat and the code hatch.

- **Characters** have places, things they hold, states (fighting, staggered, out cold, dead) and descriptions that follow them. New conditions `alive:`, `awake:`, `fighting:`, `with:`; effects `moveNpc`, `npcState`, and `move … to: 'here'`. Characters can carry `instead`/`after` rules, so THROW, GIVE and world verbs aimed at them get answers.
- **Weight** (opt-in with `carry`): item `size`, a carry limit, Zork's fumble rule, and containers that hold by weight.
- **Combat**, ported from Zork I: ATTACK/KILL/STAB/FIGHT *someone* WITH *a weapon*, Zork's six blow tables, strength that grows with score, staggering, disarming, knock-outs, first strikes, and fighters swinging back after each turn. Worlds supply the numbers and words; brass worlds get short defaults. In Infocom style, `kill troll` picks the one weapon you hold, as Zork's parser does.
- **Health:** wounds lower your strength and carry limit and heal with time; dying goes through the death system. **DIAGNOSE** reports it.
- **THROW** *item* [AT *target*].
- **The code hatch:** `scripts`, named functions that see the game read-only and return ordinary steps, with the seeded generator and the running command to hand.
- **Exits** can run an event as you go through (`then`), and arrival triggers can repeat (`repeat: true`).
- **Zork I · Native** reaches the Troll Room, the East-West Passage and the Round Room: the troll, his axe and his moods, the sword's glow, Zork's weights (with the canary in the egg), and the trap door that re-bars after the chimney. The walkthrough fights the troll on both sides and matches the original before and after; a second test fights the real troll 300 times and requires every line of 200 native fights to be one the original prints.
- **Docs:** recipes for a guard to fight and for scripts; the world schema's Weight, Combat and Scripts.

## 1.6.2 (2026-10-05)

- **RESTART works after the game ends.** In 1.6.1 a finished game ignored every command, RESTART included (a regression from 1.6.0’s compound-line changes). Now RESTART and the other store commands always work, and anything else says “The game has ended. Type RESTART to play again.”

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
