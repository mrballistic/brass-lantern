# Zork II and Zork III: what the engine would need

A survey (2026-10-06, after 1.12.5) of what brass-lantern lacks to run Zork II and Zork III natively, as it runs Zork I. Read-only: nothing in the engine changed. Detailed per-game reports: [Zork II](./2026-10-06-zork2-gaps.md), [Zork III](./2026-10-06-zork3-gaps.md).

**Sources.** `historicalsource/zork2` and `zork3` (MIT, Microsoft 2025). Each source snapshot's `.zip` is byte-identical to the shipped story file (Zork II Release 63, Zork III Release 25, both serial 860811), which are also in `public/stories/`. Zork III's release builds from nine files (`zork3.zil` inserts GSYNTAX, GMACROS, GCLOCK, GMAIN, GPARSER, 3DUNGEON, GGLOBALS, GVERBS, 3ACTIONS); the unprefixed files in that repo are older drafts.

**Both run in our Z-machine.** A seeded probe played each through movement, darkness, SCORE, SAVE/RESTORE and DIAGNOSE, and two runs on the same seed matched exactly, so differential testing works as it does for Zork I. Zork II's SCORE prints “Your score would be 0 (total of 400 points)”; Zork III's prints “Your potential is 0 of a possible 7”.

## Scale

| | Zork I | Zork II | Zork III |
|---|---|---|---|
| Rooms | 110 | 86 | 89 (8 era copies, 8 vista vignettes, 17 mirror hallway, one room for the 6×6 Royal Puzzle) |
| Acting characters | thief, troll, cyclops, bat, ghosts | wizard, demon, robot, dragon, princess, unicorn, Cerberus, serpent, gnomes, lizard | Dungeon Master, hooded figure, guardians, cliff man, Viking |
| Timed routines | ~20 | 23 | 24 |
| Score | 350 | 400 | 7 “potential” |
| Melee | yes | none (“You can't.”) | the hooded figure only, with its own strength rules |

Zork II has no thief and no combat tables, Zork I's two hardest parts. Zork III is the most procedural of the three: room text and exits are computed from global state almost everywhere.

## Engine gaps, both games together

Generic features, never game-specific branches. Ranked by how much play they block across both games.

| # | Gap | Needed by | Size |
|---|---|---|---|
| 1 | **Characters who obey orders.** `handleOrder` refuses everything today. An order runs the parsed command with the character as actor, through rules (ROBOT, PUSH BUTTON; DEMON, GIVE ME THE WAND; the Dungeon Master turning the dial). | II (ending), III (endgame) | M–L |
| 2 | **Number and quoted-text arguments**, and TURN/SET X TO *n*; world verbs that take a typed word rather than an item (SAY/INCANT *spell*, ANSWER *text*). `turn`/`set` are built-in words world verbs can't extend, and an unknown object is a miss. | III (dial: blocks time travel and the endgame), II (riddle, spells) | S–M |
| 3 | **Descriptions computed from state**: variables in text, or a script-supplied description (balloon, oak door, Royal Puzzle diagrams, mirror box, the year display). | II, III | S–M |
| 4 | **More prepositions**: PUT/SLIDE X UNDER/BEHIND Y, THROW X OFF/OVER Y, READ X THROUGH Y, PUSH X *direction*. | II, III (ring under the seat is on the winning path) | S |
| 5 | **Script helpers**: test a condition string through `conditions.ts`, list passable exits, resolve words through `fuzzy.ts`, and a held-at-any-depth condition (`has:` means carried directly). | II, III | S |
| 6 | **World-set SCORE and DIAGNOSE text.** | II, III | S |
| 7 | **Followers**: a character who follows you room to room (the dragon, the princess, the Dungeon Master). | II, III | S–M |
| 8 | **Vehicles beyond water**: `vehicle.travels` is `'water'` only; the balloon flies, Zork III's vehicles don't travel at all; landing text. | II, III | S |
| 9 | **Death options**: stop only some timers (the engine clears all), and send carried items to set places (treasures to the wizard's case). | II, III | S |
| 10 | **Timers in Zork's queue order** (newest-registered first, so history-dependent). Native uses a fixed order; same-turn messages can come out swapped. | II, III (Zork I's differentials pass without it) | M |
| 11 | **Room hook before every command** (random guard deaths), **rooms blocked during play** (explosions, vapours), **seeing into another room** (crystal spheres, barred window). | II, III | S each |
| 12 | **Smaller**: carry limit and fumble odds from variables (Feeble, Fumble spells), conditional darkness text, global scenery, an add-moves effect, a total-weight condition, any object glowing, a death that ends the game while keeping its cause line. | II, III | S each |

Everything else is world data or world scripts, as in Zork I: the wizard and his spells (a capture plus a self-rescheduling timer), the bank, carousel, diamond and magnet rooms, the cakes, the Royal Puzzle (36 generated rooms or one room with per-cell stashes), the mirror box, time travel, the earthquake, the hooded figure's fight, the cliff man, the lake, the endgame cells.

## Differential testing risks

- **Zork II's wizard** can appear every 4 turns from move 4 and casts state-changing spells; a stray spell derails a run. Chapters need pinned seeds on both sides, as Zork I's fights did.
- **Zork III's earthquake** fires 70+RANDOM(70) turns in and gates the museum: a sync point. The Viking ship is a 2-turn window at 20% a turn; deaths near the guards, fish and roc are random per command.
- **Timer message order** (gap 10) and **object listing order** after stashing and restoring.
- Dying in a past era in Zork III quits the interpreter outright.

## Recommendation

1. **Before the npm library: the shared foundations (gaps 1–9).** Each changes the `World` type or the parser, which become the library's public API; publishing first would mean a breaking release soon after. About ten small-to-medium features, one larger (orders). This is one stage, “6a”, run like 5a–5d with Zork-I-style tests on the fixture world plus targeted probes against zork2.z3 and zork3.z3.
2. **Then the npm library**, on a schema that has already met three games.
3. **Then Zork II native (6b) and Zork III native (6c)** as worlds on the published engine, with gaps 10–12 added as their differentials demand. Zork II first: no combat, no thief, and the wizard is the only big script.

Open questions (details in the per-game reports): how “me” resolves as an object (SPRAY REPELLENT ON ME, DEMON, ATTACK ME); whether every wand spell must work on every object; Zork III's cliff-man lift, era quits, the time machine leaving your belongings behind, and the Royal Puzzle's starting cells.
