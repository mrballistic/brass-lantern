# Engine parity, stage 4b: the thief, the cyclops, topics and orders

**Status:** approved in conversation 2026-10-05; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [stage 1](./2026-10-05-engine-parity-stage-1-design.md) (the roadmap and the decisions for the whole effort) through [stage 4a](./2026-10-05-engine-parity-stage-4a-design.md). Picks up items from [the backlog](../backlog.md).

## Decisions made while brainstorming

- **The thief now; his timing becomes exact later.** The thief walks Zork's real room order over the rooms that exist, so as stage 5 adds rooms his route, and with it when he turns up, converges on the original's by itself. Until then his texts are checked by line sets and the walkthrough steers around him.
- **Topics too.** ASK/TELL X ABOUT Y get a topic system, though Zork doesn't use it, for story-heavy worlds like Office Space.
- **The thief is a script, plus small generic pieces.** His brain is a zork1 script (the code hatch exists for this). The engine gains only reusable pieces: hidden characters, item treasure values, room tags, and what scripts need to read them.

## Invariants (unchanged)

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.

## 1. Generic engine pieces

### Hidden characters

`NpcState.hidden?: boolean`. A hidden character is in its room for scripts and `npcIn`, but the player can't see, match, reach, talk to or fight it, and room listings skip it. Scripts hide and reveal with `{ npcState: id, hidden }`. New condition `seen:NPC`: in the player's room and not hidden.

### Treasures and room tags

- `Item.treasure?: number` (Zork's TVALUE): what it's worth to a thief and in the trophy case. The engine doesn't read it; scripts and scoring conditions can.
- `Room.tags?: string[]`: free-form (`maze`, `sacred`). Scripts read them.

### Character turns are daemons

A character that acts on its own does it through a daemon that runs a script: `{ if: …, then: [{ script: 'thief_turn' }] }`. The daemon list's order is the order these run in, so a world puts its daemons in its interrupt order. (Zork: the lantern, the thief, the sword's glow; the fight runs after all daemons, as in stage 4a.) No separate turn slot.

### What scripts gain

`ctx.npcIn(id, room)`, `ctx.rooms()` (the room IDs in the world's order), `ctx.visited(room)`, `ctx.treasure(id)`, `ctx.tags(room)`, `ctx.lit(room?)` (is the room lit), and `ctx.children(place)` (an item's or room's contents, in listing order).

### Topics

```ts
npc.topics?: Record<string, string | Array<{ if?: string; text: string }>>;
npc.topicAliases?: Record<string, string[]>;   // "bolton": ["michael", "the band"]
npc.noTopic?: string;                           // anything else
```

- **ASK X ABOUT Y** and **TELL X ABOUT Y** find the topic by fuzzy match over the topic keys and their aliases (through `fuzzy.ts`), then the first entry whose condition holds. A string is one unconditional entry.
- **No match:** `noTopic`, else the character's TALK line.
- **ASK X** with no topic is TALK TO X, as today.
- Topics take a turn and change nothing unless an entry's text is an event key (`then`), which runs it.

### Orders

- **Parsing:** “X, *command*”, “tell X to *command*” and “order X to *command*” become `{ action: 'order', target: X, indirect: <the command text> }`. “TELL X” alone is an order with no command.
- **Who answers:** the character's `instead.order` rules, else its `refuseOrder` line, else “*Name* ignores you.” in every style. (Zork I gives each character its own line, so native Zork sets `refuseOrder`.)
- **Not carried out:** no character obeys in this stage.

### Backlog items picked up

- **The audit** checks characters' combat hooks, `combat.weapon`, `fears.item`, `holds`, `descriptions[].if`, `instead`/`after` rules, `topics` entries' conditions and events, and the new tags. It stops accepting a character for `has:` and `on:`.
- **`ctx.npcIn`** replaces the sword-glow script's own lookup.
- **DIAGNOSE** in a world without `combat` prints only the health line.
- **The death block** gains `then?: event`, run after a resurrection (Zork's JIGS-UP clears the trap door's TOUCHBIT: native Zork re-bars it).
- **The player's weapon** is the most recently taken one (Zork's FIRST? order), not the first in `world.items`.
- **Waking a character while you're away** keeps its wake counter (AWAKEN doesn't reset it).
- **In a combat world, ATTACK at an item** runs that item's `instead.attack` rules before Zork's refusal.
- **PUT ALL IN X** resolves X first, so X is never put in itself.
- **The stale walkthrough comment.**
- Deferred again: worn things in weight, a guard around scripts that throw, first strikes cancelling a compound line.

## 2. The thief

A character (`thief`: strength 5, holds the stiletto and the large bag, hidden at the start in the Round Room) with a daemon running `thief_turn`, ported from `I-THIEF`, `THIEF-VS-ADVENTURER`, `ROB`, `STEAL-JUNK`, `DROP-JUNK`, `ROB-MAZE`, `DEPOSIT-BOOTY`, `HACK-TREASURES` and `RECOVER-STILETTO` (1actions.zil 1764–2060, 3890–3992).

- **Each turn**, in the order I-THIEF does:
  - **in his lair (not with you):** reveal and deposit his treasures, silently;
  - **in your room, if it's dark and the troll isn't there:** THIEF-VS-ADVENTURER's chances, each a line from the ZIL:
    - not yet announced: 30% to appear (holding his stiletto) with “Someone carrying a large bag is casually leaning against one of the walls here…”;
    - fighting and losing (Zork's WINNING?): he retreats, “Your opponent, determining discretion to be the better part of valor…”;
    - fighting: 90% he stays;
    - announced: 30% he leaves disgusted, or robs the room's treasures or yours (“The thief just left, still carrying his large bag. You may not have noticed that he robbed you blind first.” and its variants);
    - unannounced: 30% (after the 70% pass) he robs in passing (“A seedy-looking individual with a large bag just wandered through the room…”), or finds nothing (“A “lean and hungry” gentleman…”);
    - taking your last lit light: “The thief seems to have left you in the dark.”;
  - **elsewhere:** hide if he was with you; in a visited room, take each treasure (75%) and, in the maze while you're in the maze, maybe announce one (“You hear, off in the distance, someone saying…”, 40%, kept 60%), else steal junk (10%; the stiletto always);
  - **then move on** (if he didn't stay with you): to the next room in the world's order that isn't tagged `sacred` (a land room), hidden, not fighting, having picked up a dropped stiletto;
  - **drop junk** (30% each worthless thing) unless in his lair: “The robber, rummaging through his bag, dropped a few items he found valueless.” if you're there.
- **Fighting:** combat (strength 5, weapon the stiletto, fears the knife by 1, Zork's THIEF-MELEE messages). `onBusy`: “The robber, somewhat surprised at this turn of events, nimbly retrieves his stiletto.” **Engrossed** (after a treasure gift): his next defence is at most 2.
- **His death** (F-DEAD): the stiletto and his loot drop; in the Treasure Room, the hidden treasures reappear (“As the thief dies, the power of his magic decreases, and his treasures reappear:” and a line each), then “The chalice is now safe to take.”
- **His rules:** THROW KNIFE AT THIEF (10%: he flees and his bag spills; else “You missed. The thief makes no attempt to take the knife…” and he fights); GIVE or THROW anything else (wakes him if out cold; a treasure: “…accepts the *x* and stops to admire its beauty.” and engrossed; else “…places the *x* in his bag and thanks you politely.”); TAKE (“Once you got him, what would you do with him?”); EXAMINE; LISTEN; orders and TELL (“The thief is a strong, silent type.”).
- **His lair, the Treasure Room:** entering it while he lives brings him (“You hear a scream of anguish as you violate the robber's hideaway. Using passages unknown to you, he rushes to its defense.”), fighting, and hides the room's other treasures (“The thief gestures mysteriously, and the treasures in the room suddenly vanish.”). The chalice can't be taken while he's there (CHALICE-FCN).
- **The egg** deposited in his lair comes back open, the canary visible.

## 3. The cyclops

From `CYCLOPS-FCN`, `I-CYCLOPS`, `CYCLOPS-ROOM-FCN` and `V-ODYSSEUS`:

- **Wrath:** a variable. Entering his room (if wrath isn't 0) starts a daemon; each turn there it grows away from 0 and prints the next CYCLOMAD line (“The cyclops seems somewhat agitated.” … “You have two choices: 1. Leave  2. Become dinner.”); past 5 he eats you (“The cyclops, tired of all of your games and trickery, grabs you firmly…”). Leaving stops it.
- **Food and drink:** the lunch (“Mmm Mmm. I love hot peppers!…”, wrath turns negative); then the water, or the bottle with water in it: he drinks and sleeps (“…falls fast asleep (what did you put in that drink, anyway?).”), which opens the stairs up. Not yet thirsty: “The cyclops apparently is not thirsty and refuses your generous offer.” Garlic: “The cyclops may be hungry, but there is a limit.” Anything else: “The cyclops is not so stupid as to eat THAT!”.
- **Asleep:** EXAMINE says so; ATTACK, KICK, BURN or MUNG wakes him (“The cyclops yawns and stares at the thing that woke him up.”).
- **Awake:** THROW or ATTACK: “The cyclops shrugs but otherwise ignores your pitiful attempt.” (a thrown thing lands); MUNG: ““Do you think I’m as stupid as my father was?”, he says, dodging.”; TAKE, TIE, LISTEN, EXAMINE replies; orders: “The cyclops prefers eating to making conversation.” (asleep: “No use talking to him. He’s fast asleep.”).
- **ULYSSES / ODYSSEUS** (a world verb): in his room with him awake, “The cyclops, hearing the name of his father’s deadly nemesis, flees the room by knocking down the wall on the east of the room.”; elsewhere “Wasn’t he a sailor?”.
- **His room's description** follows his state (CYCLOPS-ROOM-FCN's five lines). Up is blocked until he sleeps or flees (“The cyclops doesn’t look like he’ll let you past.”); east is solid rock until he flees (“The east wall is solid rock.”).

## 4. The slice

- **Rooms:** the maze (MAZE-1 to MAZE-15, DEAD-END-1 to 4, tagged `maze`), the Grating Room (below the clearing's grate, which the skeleton key unlocks), the Cyclops Room, the Treasure Room (VALUE 25), and the Strange Passage (east to the living room). Rooms that the slice's exits reach but that aren't built refuse. Above-ground rooms are tagged `sacred`, as Zork's SACREDBIT rooms.
- **Room order:** native Zork's rooms are listed in ZIL's room order (the order the thief's NEXT? walks), confirmed against the story file.
- **Things:** the skeleton (bones), the burned-out lantern, the rusty knife (weapon), the skeleton key, the bag of coins, the chalice, the stiletto, the large bag; Zork's sizes and treasure values for these and for the items already ported (the egg, the canary, the painting).
- **Scoring:** the coins, the chalice, the egg and the canary score while in the trophy case, as the painting does; the Treasure Room's 25 on arrival.

## 5. Testing

1. **The walkthrough**, line for line: into the maze by a fixed path; the skeleton key, the coins, the rusty knife; the Cyclops Room (lunch, then water); up to the Treasure Room, where the thief rushes in: a sync point fights him with the knife until he's dead on each side (the original restarting when its player dies, the native side choosing a seed where the player wins), then the chalice; back down; ULYSSES is tried where it applies; the Strange Passage to the living room; the treasures in the case. The original restarts when the thief turns up uninvited; the native side picks seeds where he doesn't.
2. **Line sets for the thief:** the real game, many sessions, wandering the underground for many turns (and visiting his lair, fighting him), collecting every line; native wandering and fights over many seeds; every native line must match one of the original's, rare variants excused only when rare natively too (the stage 4a rule).
3. **The cyclops** reply for reply: his wrath is counted, not random, so a scripted visit (each food, sleep, ULYSSES, staying until he eats you) is compared line for line.
4. **Unit tests:** hidden characters (listings, matching, reach, `seen:`), topics (fuzzy, conditions, aliases, fallbacks), orders (each phrasing, rules, defaults), daemon order, every thief rule by seed, the cyclops' counter, food, sleep and magic word, and every backlog fix.

## 6. Docs and release

- **world-schema:** `hidden`, `treasure`, `tags`, `topics`, `topicAliases`, `noTopic`, `refuseOrder`, orders, `death.then`, the new `ctx` helpers; **conditions-and-events:** `seen:`; **commands:** ASK/TELL ABOUT, orders, ULYSSES (as a world verb example).
- **Building worlds:** recipes for topics and for a wandering character (a cat that roams and steals a sock), each a world file played by a test.
- **porting-zork:** INVISIBLE → hidden, TVALUE → treasure, SACREDBIT/MAZEBIT → tags, I-THIEF → a daemon script, TELL/orders.
- **CHANGELOG** 1.8.0. Office Space syncs with no world changes; its visible changes are orders (“Bill Lumbergh ignores you.”) and ASK *X* ABOUT *Y* behaving as TALK TO.
- **The backlog** marks the items this stage ships.

## Out of scope

- Characters who obey orders or follow the player.
- Vehicles, the rest of the map, and the remaining puzzles (stage 5).
- The backlog items deferred again (section 1).
