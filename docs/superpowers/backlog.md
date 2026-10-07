# Engine backlog

Known gaps the reviews found and deferred. Each stage's spec picks up the ones it touches; strike an item through (or delete it) when it ships. Newest first.

## From stage 6a

- **A `go: true` world verb skips `instead.go` rules.** `handleWorldVerb` calls `handleGo` directly, so a vehicle's or room's GO rules (Zork's M-BEG WALK) never see LAND or DRIVE. The balloon slice works around it with a plain `land` verb and an `instead.land` rule on the basket. Running `go: true` verbs through `withRules('go')` closes it, but touches Zork I's `land` (the boat) and Office Space's `drive`, so it needs both re-checked.
- **An actor's holdings aren't listed under it.** Zork lists what an open actor holds after its line (“The robot is holding:” then its things; PRINT-CONT for CONTBIT/OPENBIT actors, gverbs.zil:1877), even while the actor itself is NDESCBIT. Native never lists a character's `holds`. A character flag that lists its holdings in Infocom style would do; the robot slice avoids the state for now.
- **An ordered character can't refer to what the player carries.** Zork's parser searches the player's inventory for any WINNER (gparser.zil GET-OBJECT, `DO-SL ,PLAYER`), so “robot, drop lamp” finds the lamp and ROBOT-FCN answers “Click! I don't have that. Buzz! Whirr!”. `npcScope` excludes the player's things by design, so native misses. Decide whether Infocom style should widen the scope for orders.
- **The robot's 2% “Buzz! Buzz! Buzz! My circuits are getting rusty. Try again.”** (ROBOT-FCN) isn't modelled: it also stops the action, and nothing in a `continue` order rule's event can stop the built-in that follows it (and conditions draw no randomness).
- **An unquoted answer is typed words natively, an object in Zork.** Zork II's syntax is `ANSWER = V-ANSWER` and `ANSWER OBJECT = V-REPLY`; only a quote starts the typed words (P-CONT), so `answer well` (no quotes) is an object the parser can't find (“You can't see any well here!”) and never reaches RIDDLE-ROOM-FCN. Native text verbs take the whole rest of the line, quoted or not, so `answer well` solves the riddle. A text verb flag (`quoted: true`: unquoted words are an object) would close it; the riddle slice compares quoted answers only.

- **Zork I's EXAMINE TRAP DOOR and GRATE.** The original says “The trap door is closed.” (DOORBIT, no EXAMINE handler); native hard-codes “There’s nothing special about…” (`zork1.ts`). Emptying those descriptions would route them through the Infocom door branch. A mismatch from before 6a, found by the riddle slice.
- **A self-targeting move prints leave/arrive.** The old same-room guard went when vehicle lines became flexible, so a `moveVehicle` (or a script move) to the room the vehicle is already in can say its `leave` line, and `leave`/`arrive` are skipped when an `onEnter` redirects. No test pins `leave` staying silent on a `requires` denial or a missing target.
- **`verbClashes` hides `afterBuiltIns` verbs entirely.** A verb that is always shadowed (every word a built-in reads) can never fire and isn't reported.
- **Typed words are cruder than Zork's lexer.** ~~A leading single quote truncates at an inner apostrophe~~ (6a final: single quotes are apostrophes now), words after a closing quote are dropped, `said:` normalisation drops non-ASCII letters (café reads as caf), and typed words split on punctuation where Zork makes commas and periods words of their own. A non-text world verb whose phrase starts with a text verb's word is swallowed by `splitCommands`. Unclosed and curly-quote answers are untested.
- **PUSH with a direction word.** “push button up” and “move X e” now parse as PUSH-direction (“You can’t push things to that.”) instead of USE or a world verb; untested. ~~An item named exactly “self” or “yourself” is shadowed in object slots, and typing `player` counts as ME.~~ (6a final: SELF/YOURSELF are ME only when nothing is called that; typed `player` is a word.) `parseNumber(':')` is 720 and `'4:'` is 960; check against Zork's NUMBER? or comment it.
- **Orders, small edges.** `npcExit` repeats `followExit`'s denial, `if` and door checks (a shared `exitBlocked` would keep them in step); `pickItem`'s scenery demotion reads the player's room, not the character's; an obeyed TAKE of something that can't be taken uses the player's take line rather than Zork's random YUKS pick; there is no TELL X TO test and no `obeys` with an NPC object test.
- **Intent server and orders.** An order's words from the LLM relax “identifiers only” (bounded to six alphanumeric words, and the engine only parses them); the `PREPS` list lives in both `llm.ts` and `intent-client.ts`; ~~there is no underscore test~~ (6a final: tested).
- **Script context.** `ctx.exits` ignores an exit's `denials` (the engine checks them) and `ctx.resolve` uses reachability, not the parser's visibility. An item's `descriptionScript` skips `item.text` and the Infocom “closed” branches (untested), and `scoreLine` doesn't expand `{var:}`. The audit runs a description script once on a new game, so a non-`say` step that appears only in a later state slips past it (runtime still ignores it). New function-level import cycles (conditions to scripts to effects, scripts to describe and text) are safe today but fragile.
- **Followers.** Two followers print dog-then-cat but list cat-then-dog (the later-stamped first); no test for an arrival script that kills or teleports, or that rng is unchanged on a refused move. Zork's I-FOLIN moves the master to HERE every turn; native models it as follow-from-the-room-left.
- **Clockless turns.** `clockless` (SCORE, VERBOSE, BRIEF) skips the post-clock light-change check, so a room end routine that changes the light isn't re-described; TELL's clockless handling is hand-coded as `{ free: true }` in the Zork III slice (which also skips M-END); WAIT stops on a fuse that fires but prints nothing, where Zork's carries on (invisible in output).
- **Vehicles.** Untested: contents travelling with a vehicle, `moveVehicle` to a missing room, arrive skipped on death. The slice tests lean on a fallback room.
- **Slice tests.** `expect` with an empty prefix isn't supported (document it, or capture the opening reply); there's no passing-`expect` test; `oneRoom()` is undocumented; `BURNOUT_SEED`'s comment points at an untracked `tests/zz` probe; the balloon landing without you is uncompared.
- **Small duplicates.** ~~The typed-number check is in `rules.ts` and `burn.ts`~~ (6a final: `readsNumber`); the treasure check in `death.ts` is redundant; `clockless`'s return repeats the before/stateKey pattern.

From the 6a final review:

- **A number as the first object with a thing as the second is understood in brass style.** “turn 4 with wrench” answers “This has no effect.” and takes a move, where a number no rule wants should miss with the digits (PLUG 5 WITH X too).
- **Infocom READ X THROUGH Y ignores PRE-READ.** Zork runs PRE-READ's checks before V-READ for READ X THROUGH Y; native's READ THROUGH just reads X. Check the ZIL and match it in Infocom style.
- **Infocom TURN X TO N ignores TURNBIT.** Zork answers “You can't turn that!” for anything without TURNBIT before V-TURN; native says “This has no effect.” for any thing with no rule.
- **Templates don't expand in item listing sentences.** `{var:NAME}` and `{number}` fill in descriptions and event lines, but not the sentences that list items in a room.
- **`diagnose.wounded` has no placeholders.** The world's line replaces the style's wounded report as fixed text, so a world can't print the numbers Zork's V-DIAGNOSE computes.
- **Legacy `travels: 'none'` is in the public API.** The string forms of `travels` (`'water'`, `'air'`, `'none'`) predate terrains; decide before the npm library whether to keep them or deprecate them in favour of lists.
- **`moveVehicle` aboard into a room whose `requires` fails** prints the room's denial from a timer (a fuse or daemon), where no command was refused.
- **The parser's word tables use `in`.** `input in SINGLE_WORD` (and `BARE_VERBS`, `DIRECTIONS`) finds Object's prototype keys, so a bare “constructor” or “tostring” parses to a function rather than null. Harmless today (the engine misses), but `Object.hasOwn` would be right.
- **Brass why-lines assume a common noun.** An obeyed order that can't be done says “The ${name} can’t go that way.”, which reads wrong for a proper name (“The Milton can’t go that way.”). Consider an article or proper-name field on NPCs (Zork's NARTICLEBIT) or a world template for the why-lines.
- **ME/MYSELF can't reach topics or dialogue choices keyed that way.** The guard that keeps ME from fuzzy-matching sits in the generic `fuzzyCandidates`, so ASK X ABOUT ME or a dialogue choice keyed “me” never matches. The guard belongs in thing and NPC resolution, not in every fuzzy lookup.

## From the 1.12.5 clear-out review

- ~~**ROB-MAZE never fires in Release 119.**~~ (1.12.5) Solved: DESCRIBE-ROOM clears a maze room's TOUCHBIT on every look, and I-THIEF only robs rooms with TOUCHBIT, so he never robs the maze and the distant voice is dead code. Native now skips maze rooms too.
- **The Loud Room's “lost in the noise”** prints after the daemons' lines in a turn; check Zork's order (the room's M-ENTER runs before CLOCKER).
- **The walls regex in the CLIMB rules** is redundant with the generic match, and a bare CLIMB WALL (no direction) isn't checked against the story file.
- **V-LEAP:** it matches object names exactly (no fuzzy pass), lacks JUMP IN / JUMP FROM / JUMP OFF and WALK OVER, and objects with their own jump lines (the rainbow, the chasm) fall through to the generic reply.
- **The once-only `onTake` guard** is now in two places (withRules and READ's automatic take); one helper would do.
- **The thief-maze differential** is one-directional: it checks native's lines are a subset of the original's, not that native prints the original's rarer lines too.

## From the 1.12.5 fast follow

- ~~**A refused move**~~ (1.12.5) should drop the rest of a compound line (Zork's M-FATAL clears P-CONT); the room's end routine is skipped, but “north. take lamp” after a refused north still takes the lamp.
- ~~**KICK**~~ (1.12.5) isn't a native Zork verb, so the far basket (and everything else) can't answer it.
- ~~**The dark-room walk**~~ (1.12.5) on death advances before testing; Zork re-tests the room the last treasure landed in, so two can share it.
- ~~**READ's automatic take**~~ (1.12.5) runs after-take rules without the once-only guard `onTake` gets through withRules.
- ~~**V-CLIMB-UP's other replies:**~~ (1.12.5) “The stairs don't lead downward.” (plural), “There are no climbable trees here.”, “Climbing the walls is to no avail.”
- ~~**WAIT's fired-timer mark**~~ (1.12.5) survives a throw inside afterTurn (the next WAIT would stop after one tick).
- ~~**The changed check**~~ (1.12.5) (stateKey) leaves out firedEvents, placed and verbosity: a capture that only fires a once-event isn't saved.
- Notes on items closed above: ENTER of an ambiguous non-vehicle keeps its question (Zork's parser asks too); the 350 whisper already lands where Zork's does for every reachable win; a failed conditional exit does cost a turn in Zork (only M-END and the rest of the line are skipped); the switch accepts a screwdriver on the floor in Zork too.

## From stage 5d (1.12.0)

- ~~**A character who arrived**~~ (1.12.5) is listed before the room's things only on the turn he arrives; Zork keeps him first until something else moves in.
- ~~**ENTER of an ambiguous non-vehicle**~~ (1.12.5) asks “which do you mean” and then misses; the vehicle check should look only at vehicles.
- ~~**The 350 whisper**~~ (1.12.5) is a daemon, so it would follow a room description if the last points came from entering a room (SCORE-UPD prints it inside the action).
- ~~**The floor-like surface listing**~~ (1.12.5) (the kitchen table) doesn't count as listed for later indentation, nor add “(outside the boat)”.
- ~~**Older Zork replies**~~ (1.12.5) found in review: “enter trap door” goes down (Zork: “You hit your head against the trap door…”); “enter sack/house” use the generic miss; a failed conditional exit costs a turn.

## From stage 5c (1.11.0)

- ~~**CLIMB UP/DOWN**~~ (1.12.5) *a thing* walks for any visible thing (“climb down lamp” goes down; Zork: “The brass lantern doesn't lead downward.”), and with no exit says “You can't climb that way.” where Zork says “You can't go that way.”
- ~~**TURN SWITCH WITH SCREWDRIVER**~~ (1.12.5) works with the screwdriver on the floor, or shut in the machine (“It's not clear how…”); Zork's parser wants it held, or says it can't see one.
- ~~**The far basket**~~ (1.12.5) gives the chain line only for TAKE, OPEN, CLOSE, PUT, RAISE, LOWER and EXAMINE; LOOK IN, SEARCH, SMELL and KICK get defaults. TAKE X FROM BASKET with X already held gets the chain line, not “You already have that!”
- ~~**Items dropped on death**~~ (1.12.5) land in different places from the story file's (seen in a 5c review probe).

## From stage 5b (1.10.0)

- ~~**BOARD of a second vehicle while aboard**~~ (1.12.5) switches vehicles; PRE-BOARD says “You are already in the <current>!”.
- ~~**The “(magic boat)” guess**~~ (1.12.5) prints for STAND, GET OUT and GET OFF too; in Zork only bare DISEMBARK guesses. STAND when not aboard should say “You are already standing, I think.”
- ~~**`execute`'s `changed` snapshot**~~ (1.12.5) omits `state.aboard`, so a fuse or `onEnd` that disembarks silently isn't saved that turn.
- ~~**HELP's BOARD / DISEMBARK line**~~ (1.12.5) is 26 characters in the verb column, breaking the 25-character alignment.
- ~~**In the dark, aboard,**~~ (1.12.5) “get out of raft” is a miss in brass style (the raft isn't visible), which the LLM re-reads to the same miss. Bare “get out” works.
- ~~**Teleports while aboard**~~ (1.12.5) (script `goTo`/`enterRoom`) carry the vehicle without GOTO's checks; Zork's PRAY in the boat refuses.

## From stage 5a (1.9.0)

- ~~**READ's automatic take**~~ (1.12.5) (Infocom) skips the item's take rules, so a readable treasure taken that way wouldn't score its took_* points; and it takes an item out of a container you carry (Zork's HELD? counts that as held).
- ~~**Every captured line**~~ (1.12.5), even a pure echo, is its own UNDO step and a save.
- ~~**WAIT's extra turns:**~~ (1.12.5) a fuse rescheduled on the first turn doesn't count down on the others (the scheduled-this-turn set lasts the whole WAIT), and a fuse cancelled silently ends the wait.
- ~~**A capture that throws**~~ (1.12.5) leaves the seed advanced (no try/finally around the script).
- ~~**BURN's scopes:**~~ (1.12.5) the tool comes from things in reach (Zork's syntax requires holding it) while withRules resolves it from things in sight; BURN TROLL WITH TORCH misses instead of “You can’t burn a troll.”
- ~~**BURN's refusal**~~ (1.12.5) uses Zork's fixed “a” (“With a alarm clock??!?”); brass worlds would want the right article.
- ~~**Not ported in 5a:**~~ (1.12.5) “The rest of your commands have been lost in the noise.” (entering the Loud Room mid-line); a spirit passing the troll (TROLL-FLAG); EXORCISE; V-LEAP outside the Dome; Zork's random V-SKIP and HACK-HACK replies (native uses one fixed line each).

## From stage 4b (1.8.0)

- ~~**Differential coverage of the thief's and cyclops's rarer lines:**~~ (1.12.5) the lair (scream, vanish), his death and treasures reappearing, the maze “off in the distance” line, the junk lines, and the cyclops's food, sleep and eats-you lines are checked against ZIL-derived unit tests, not `zork1.z3`. Stage 5's full map should let a scripted original session reach them.
- ~~**The thief taking the last light**~~ (1.9.0) prints his line and then the engine's generic “It is now pitch black.”; Zork prints only his. No trigger until the torch (a treasure) arrives.
- ~~**A `continue` rule**~~ (1.12.5) applies (and may run `then`) before the verb's default; if the default then misses or asks a question, state changed under `understood: false`. No current rule hits it.
- ~~**The intent context**~~ (1.9.0) sends `room.npcs` as authored, so hidden or departed characters reach the LLM. Use `npcsSeen`.
- ~~**“tell bob to ask about x”**~~ (1.12.5) parses as ASK before ORDER (a miss; the LLM retries).
- ~~**effects.ts `hide`/`reveal`**~~ (1.12.5) use an obscure comma expression.
- ~~**commands.md**~~ (1.12.5) doesn't say a bare “TELL X” is an order.

## From stage 4a (1.7.0)

- ~~**DIAGNOSE in a world without combat**~~ (1.8.0) says “You can be killed by a serious wound.” after “You are in perfect health.” A world with no `combat` should get just the health line. (Seen live in Office Space.)
- ~~**A script that throws**~~ (1.12.5) leaves its turn half-applied in production (no guard or snapshot around the turn). Tests surface the error; players would see a half-finished turn.
- ~~**The `sword_glow` script**~~ (1.8.0) in `src/worlds/zork1.ts` finds characters its own way (the first room listing them) instead of `isNpcIn`. Scripts could get `ctx.npcIn(id, room)`.
- ~~**Fidelity gaps against zork1.z3:**~~ (all closed by 1.12.5)
  - ~~worn things don't count 1 toward weight~~ (1.12.5) (there's no worn state yet), and CCOUNT's worn exclusion for the fumble count isn't ported;
  - ~~the player's weapon (FIND-WEAPON) is the first in `world.items` order, not the most recently taken~~ (1.8.0);
  - ~~the troll's first strike (F-FIRST?) doesn't cancel the rest of a compound command (P-CONT)~~ (1.12.5);
  - ~~waking the troll while you're away resets his wake counter; Zork's AWAKEN doesn't~~ (1.8.0);
  - ~~the trap door doesn't re-bar after a death~~ (1.8.0: `death.then`).
- ~~**The world audit**~~ (1.8.0) doesn't check characters' combat hooks (`onDeath`, `onBusy`, `onWake`, `onUnconscious`), `combat.weapon`, `fears.item`, `holds`, `descriptions[].if`, or characters' `instead`/`after` rules. A typo there silently does nothing.
- ~~**In a world with combat, ATTACK at an item**~~ (1.8.0) skips `withRules`, so an item's `instead.attack` rule can never fire.
- ~~**Stale comment**~~ (1.8.0) at `tests/worlds/zork1-allowlist.ts` (“The walkthrough skips the sword”).

## From stage 3 (1.6.0)

- ~~**PUT ALL IN X**~~ (1.8.0) compares the typed indirect word to item IDs, so “put all in brown sack” may try to put the sack into itself.
- ~~**`conditionProblems`**~~ (1.8.0) accepts a character's ID for `has:` and `on:`, not only `here:`, so a typo naming a person slips past the audit.
