# Engine backlog

Known gaps the reviews found and deferred. Each stage's spec picks up the ones it touches; strike an item through (or delete it) when it ships. Newest first.

## From stage 6a

- **An actor's holdings aren't listed under it.** Zork lists what an open actor holds after its line (“The robot is holding:” then its things; PRINT-CONT for CONTBIT/OPENBIT actors, gverbs.zil:1877), even while the actor itself is NDESCBIT. Native never lists a character's `holds`. A character flag that lists its holdings in Infocom style would do; the robot slice avoids the state for now.
- **An ordered character can't refer to what the player carries.** Zork's parser searches the player's inventory for any WINNER (gparser.zil GET-OBJECT, `DO-SL ,PLAYER`), so “robot, drop lamp” finds the lamp and ROBOT-FCN answers “Click! I don't have that. Buzz! Whirr!”. `npcScope` excludes the player's things by design, so native misses. Decide whether Infocom style should widen the scope for orders.
- **The robot's 2% “Buzz! Buzz! Buzz! My circuits are getting rusty. Try again.”** (ROBOT-FCN) isn't modelled: it also stops the action, and nothing in a `continue` order rule's event can stop the built-in that follows it (and conditions draw no randomness).
- **An unquoted answer is typed words natively, an object in Zork.** Zork II's syntax is `ANSWER = V-ANSWER` and `ANSWER OBJECT = V-REPLY`; only a quote starts the typed words (P-CONT), so `answer well` (no quotes) is an object the parser can't find (“You can't see any well here!”) and never reaches RIDDLE-ROOM-FCN. Native text verbs take the whole rest of the line, quoted or not, so `answer well` solves the riddle. A text verb flag (`quoted: true`: unquoted words are an object) would close it; the riddle slice compares quoted answers only.

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
