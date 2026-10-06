# Engine parity, stage 5b: the river, the boat, the rainbow and the canyon

**Status:** approved in conversation 2026-10-06; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [stage 1](./2026-10-05-engine-parity-stage-1-design.md) (the roadmap and the decisions for the whole effort) through [stage 5a](./2026-10-05-engine-parity-stage-5a-design.md). Picks up items from [the backlog](../backlog.md).

## Decisions made while brainstorming

- **Vehicles are a generic engine feature**, not Zork-only scripts: the player can be aboard an item, rooms can be water, and Zork's movement rules and texts are the engine's. Any world can have a boat; Zork's boat is then data and scripts.
- **Zork's dark-move grue is fixed here, generically**: walking from one unlit dark room into another has Zork's 80% chance of death, for every world with a darkness block. It changes native Zork's early game too (walking dark-to-dark without a light); the sessions check it.
- **Every puzzle is checked by seeded scripted sessions against zork1.z3**, as in 5a.

## Invariants (unchanged)

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes. Worlds without vehicles behave exactly as before.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.

## 1. Generic engine pieces

### Vehicles

**Data and state**

```ts
// Item
vehicle?: { travels: 'water' }          // Zork's VEHBIT and VTYPE
// Room
water?: boolean | string                // NONLANDBIT; a condition string for rooms that change (the Reservoir: '!flag:low_tide')
// GameState
aboard?: string                         // the vehicle the player is in
```

- The vehicle's location always equals the player's room while aboard; it moves with the player.
- **Conditions:** `aboard:ITEM` (aboard that vehicle), `aboard` (any), `water:here`, `water:ROOM`.
- **Script helpers:** `ctx.aboard()` (the vehicle ID or undefined), `ctx.water(room?)`.
- **Effects:** `{ board: 'item' }`, `{ disembark: true }` (no lines; for scripts and rules).

**Verbs** (built in, in the usual four places)

- **BOARD** *vehicle* (also GET IN, CLIMB IN/ON *vehicle*, SIT IN): it must be a vehicle (“You have a theory on how to board a *X*, perhaps?”, PRE-BOARD's text), on the ground in the room (“The *X* must be on the ground to be boarded.”), and you not already in it (“You are already in the *X*!”). Success: “You are now in the *X*.”
- **DISEMBARK** [*vehicle*] (also GET OUT, EXIT, STAND, GET OFF): “You’re not in that!” when not aboard; on water: “You realize that getting out here would be fatal.”; else “You are on your own feet again.”
- **While aboard:** DROP puts the item in the vehicle (IDROP); TAKE *vehicle* says “You’re inside of it!”; DROP *vehicle* disembarks; things in the room stay in reach.
- Rules answer first, as always (`instead.board`, `instead.disembark` on the vehicle or room).

**Movement** (Zork's GOTO)

- Into a water room, not aboard a water vehicle: refused, “You can’t go there without a vehicle.”
- Aboard, into a room the vehicle can't travel (land to land, or water it doesn't travel): “You can’t go there in a *X*.”
- Aboard, from water onto land: allowed with “The *X* comes to a rest on the shore.” and a blank line; the player stays aboard.
- The vehicle's place follows the player on every move, including `{ go }` and resurrection rules; dying clears `aboard` and leaves the vehicle where the player died.

**Rules while aboard** (Zork's M-BEG and M-END go to the vehicle)

- The vehicle's `instead` rules for a verb are asked before the room's, so a vehicle's `instead.go` can refuse directions (“Read the label for the boat’s instructions.”).
- The vehicle's `onEnd` runs in place of the room's.

**Description** (Infocom style)

- The header becomes “*Room*, in the *vehicle*” (DESCRIBE-ROOM's “, in the”); the status line shows the room only.
- The vehicle isn't listed among the room's things; its contents are (“The magic boat contains:” then its things), after the room's.
- Brass style: the header gains “(in the *vehicle*)”.

### Dark moves

```ts
darkness: { stumble?: { chance: number; then: EventStep[]; aboard?: EventStep[] } }
```

- Moving from an unlit dark room into another unlit dark room (not water) rolls `chance` percent (Zork: 80); on a hit, `then` runs instead of the move (Zork's GRUE line and death), or `aboard` when the player is in a vehicle (Zork's “slithered into the boat”).
- Seeded like every other roll; never applies to water rooms. The existing missing-exit `blunder` also skips water rooms (V-WALK's guard).

### Small additions

- Exit labels such as `land` work as today (an exit label is a direction); LAUNCH and LAND are world verbs in Zork (`land` with `go: true`).
- A fuse that must fire in the same turn uses `{ run }` (no `schedule in: 0`).

## 2. The Zork content

All text from the ZIL source, checked against the story file by sessions. Rooms join `zork1.ts` in story-file order.

### The boat

- **Three items that swap** (IBOAT-FUNCTION, RBOAT-FUNCTION, DBOAT-FUNCTION): the pile of plastic (already at Dam Base), the magic boat (the vehicle, `travels: 'water'`), the punctured boat.
- **INFLATE** *pile* WITH PUMP (the pump needn't be held; the boat must be on the ground): “The boat inflates and appears seaworthy.”, plus “A tan label is lying inside the boat.” the first time. With LUNGS or BLOW IN: “You don’t have enough lung power to inflate it.”; another tool: “With a *X*? Surely you jest!”; the magic boat: “Inflating it further would probably burst it.”; the punctured boat: “No chance. Some moron punctured it.” PUMP UP *X* needs the pump held.
- **DEFLATE:** refused while aboard or not on the ground; else “The boat deflates.”, its contents leaving with it and coming back on reinflation. The pile: “Come on, now!”
- **The label:** its text (READ), the boat's instructions.
- **Punctures:** boarding while holding a weapon (sword, knife, rusty knife, axe, stiletto, sceptre), or dropping, putting or swinging one aboard, punctures it with Zork's lines; the punctured boat replaces it, its treasures fall to the room. On water that's death: drowning in the Reservoir and the Stream, the falls on the river. **Repair:** PUT PUTTY ON (or IN) the punctured boat, or PLUG/PATCH/GLUE/REPAIR/FIX it WITH PUTTY: “Well done. The boat is repaired.” (the pile again; the putty stays).
- **Steering:** while aboard, every direction but LAND, east, west (and north/south at the Reservoir, south at the Stream) gets “Read the label for the boat’s instructions.” (the boat's `instead.go`); EXIT disembarks.

### The river

- **LAUNCH** (aboard) from Dam Base, the White Cliffs beaches, Sandy Beach, the Shore, the Reservoir's shores or Stream View, into River 1, 3, 4, 4, 5, the Reservoir or the Stream (RIVER-LAUNCH); on water: “You are on the river, or have you forgotten?” (or reservoir, stream); elsewhere: “You can’t launch it here.”; not aboard: “You can’t launch that by saying “launch”!”
- **The Frigid River** (RIVER-1 to RIVER-5) and **the Stream** (IN-STREAM): water rooms, with their texts and exits (LAND to the banks).
- **The current** (I-RIVER, RIVER-SPEEDS 4, 4, 3, 2, 1): a fuse that prints “The flow of the river carries you downstream.” and a blank line, moves the boat on, and re-queues with the new room's speed; from River 5 it's over the falls (Zork's death line). Launching schedules it `speed - 1` (same-turn tick); a re-queue from the fuse schedules `speed`; launching at the Shore (speed 1) runs it at once. Off the river it stops silently.
- **The Reservoir and the Stream:** water by the tide; 5a's hand-written “without a vehicle” denials become real exits governed by the vehicle rules.

### The banks

- **White Cliffs Beach** north and south: the narrow paths (“The path is too narrow.”) open only when you're not carrying the inflated boat (WHITE-CLIFFS-FUNCTION's DEFLATE, by `onEnd` on foot and inflation clearing it). The north beach joins the Damp Cave (5a's “isn’t built yet” goes).
- **Sandy Beach** (the shovel), **Sandy Cave** (the scarab, hidden), **the Shore**.
- **Digging** (SAND-FUNCTION, BDIGS): DIG IN SAND WITH SHOVEL, four lines, the scarab revealed on the fourth (nothing printed if already revealed), a collapse and death on the fifth; the count never resets on leaving. Other tools and places get V-DIG's replies (“Digging with the *X* is slow and tedious.”, “Digging with a *X* is silly.”, “There’s no reason to be digging here.”).
- **The buoy** (River 4): a closed container; opening it shows the emerald (TREASURE-INSIDE).
- **Grue moves:** River 2–4, the Stream, the White Cliffs beaches, Sandy Beach and Sandy Cave are dark.

### The rainbow and the canyon

- **Aragain Falls**, **On the Rainbow**, **End of Rainbow** (the pot of gold, hidden), **Canyon Bottom**, **Rocky Ledge**, **Canyon View**.
- **Waving the sceptre** (SCEPTRE-FUNCTION) at the Falls or End of Rainbow toggles the rainbow: on, Zork's line and the pot revealed (its line only at End of Rainbow while it's there); off, Zork's line and any treasures on the rainbow lost; on the rainbow, death; elsewhere, the dazzling display.
- **Exits:** to On the Rainbow only while it's solid (west/up from the Falls; up/northeast/east from End of Rainbow). **CROSS RAINBOW** between the Falls and End of Rainbow while solid; otherwise Zork's refusals. JUMP at the Falls uses JUMPLOSS (5a's `jump_loss`). The Falls' description follows the rainbow.
- **The canyon:** Canyon View joins the Clearing (northwest) and Forest 3 (west), replacing their off-the-map exits, and the above-ground death scatter. Jumping there: “Nice view, lousy place to jump.”
- **The river, the cliffs and the stream** answer as objects with Zork's lines (putting yourself in the river drowns you; things thrown off a cliff are lost).

### Follow-ups in 5a's content

- The maintenance flood carries an aboard player over the dam (I-MAINT-ROOM's boat branch).
- The thief keeps off water rooms.

### Treasures

Emerald 5 / 10, scarab 5 / 5, pot of gold 10 / 10 (VALUE on finding / TVALUE in the case). The emerald scores when the buoy is opened (TREASURE-INSIDE), not when taken.

## 3. Testing

- **Scripted sessions** (seeded, both sides) for: inflating and deflating with every refusal; boarding, the label, leaving on land and refused on water; the river by the current with landings at each bank and the falls; punctures on land and on water, and the repair; the White Cliffs' narrow path; digging and the collapse; the buoy; the rainbow on, crossing, and off with a treasure on it; the canyon to Canyon View and back to the forest; a dark-to-dark grue (seeded branch); the Stream into the Reservoir. A longer prefix fetches the pump from Reservoir North at low tide.
- **Unit tests** for vehicles, dark moves, the new conditions, helpers and effects on the fixture world; the rooms test keeps checking story order; a scoring test for the three treasures.

## 4. Docs and release

- **world-schema:** vehicles (`vehicle`, `water`, `aboard`), BOARD/DISEMBARK behaviour, `darkness.stumble`. **conditions-and-events:** `aboard`, `water:`, `{ board }`, `{ disembark }`. **commands:** BOARD, DISEMBARK.
- **Building worlds:** a recipe for a small world with a boat.
- **porting-zork:** VEHBIT/VTYPE, NONLANDBIT, I-RIVER, the rainbow, the dark-move grue.
- **CHANGELOG** 1.10.0. Office Space syncs with no world changes.
- **The backlog** marks the items this stage ships.

## Out of scope

- The coal mine, the bat, the gas room, the endgame and the barrow, the thief's exact timing, and 4b's deferred differential coverage (5c).
- Office Space's world upgrades (a separate track).
