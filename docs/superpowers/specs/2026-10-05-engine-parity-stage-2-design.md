# Engine parity, stage 2: darkness and time

**Status:** approved in conversation 2026-10-05; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [stage 1](./2026-10-05-engine-parity-stage-1-design.md), which has the roadmap and the decisions for the whole effort:
- full parity with Infocom-class games;
- data first, with a code hatch arriving in stage 4;
- vertical slices of a native Zork I, checked against the original story file.

## Decisions made while brainstorming

- **Structured effects.** Events become lists of printed lines and typed effect objects. The bracketed lines (`[Flag set: …]` and friends) keep working.
- **General building blocks, no lamp feature.** Time-based behavior is made from numeric variables, daemons and fuses. The lamp burning down is about five lines of world data, not an engine feature.
- **Randomness lives in effects only.** Conditions stay pure, so an engine miss still changes nothing.

## Invariants (unchanged)

- The engine never branches on a world's IDs.
- **An engine miss never mutates state.**
- The LLM only classifies.
- Conditions are parsed only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Existing worlds keep working: Office Space's playthrough tests pass unchanged.
- Player-facing text uses curly quotes and apostrophes.
- Coverage stays at 80% lines/functions/statements and 75% branches.

## 1. Effects, variables, randomness and time

### Events and effects

```ts
type EventStep = string | Effect;
type EventScripts = Record<string, EventStep[]>;   // was Record<string, string[]>

type Effect =
  | { say: string }                          // same as a plain string
  | { set: string } | { clear: string }      // flags
  | { move: string; to: Place }              // a room, 'player', an item, or null (offstage)
  | { open: string } | { close: string } | { lock: string } | { unlock: string }
  | { switch: string; on: boolean }
  | { add: string; by: number } | { setVar: string; to: number }
  | { score: number }                        // adds to the `score` variable
  | { go: string }                           // move the player there and describe the room
  | { schedule: string; in: number } | { cancel: string }   // fuses
  | { chance: number; then?: EventStep[]; else?: EventStep[] }
  | { run: string }                          // another event, inline
  | { die: string }                          // see Death
  | { end: string };                         // see Endings
```

- **Order:** steps run in order. A string is printed (and, if it's a bracket line, also applies its effect, as today).
- **Where they run:** `src/engine/effects.ts` owns `runSteps(steps, world, state): string[]`. `runEvent` calls it, and so does every place that runs an event today (rules, onEnter, daemons, fuses, the finale).
- **Printing:** effect objects print nothing unless they say so (`say`, `go`, `die`, `end`). In `infocom` style, bracket lines still act without being shown.
- **Faults:** an unknown effect, or one naming a missing item, room, variable or event, is skipped silently in play. The world audit test (see Testing) fails on it.
- **Event-key lookups:** `firedEvents` keeps recording event keys. `run` and `schedule` take event keys.

### Variables

- **State:** `GameState.vars: Record<string, number>`, optional. Starting values come from `world.vars`; a missing variable reads as 0.
- **Effects:** `add`, `setVar`, `score`.
- **Conditions:** in `conditions.ts`, `var:NAME<op>N` with op `=`, `<`, `>`, `<=` or `>=` (for example `var:lamp_fuel<=15`). Also `carrying<=N` (and the other operators): how many items the player holds directly.
- **Score** = flag points + the `score` variable.
- **Score entries** also take a condition: `{ if: 'inside:painting:trophy_case', points: 6 }`, alongside `{ flag, points }`. A condition entry counts while it holds, so taking a treasure back out of the case loses its points, as in Zork. A `points` total under zero is shown as is.

### Randomness

- **The generator:** `GameState.rng?: number` is the seed of a small deterministic generator (mulberry32, `src/engine/rng.ts`). A new game seeds it from `world.seed ?? Date.now()`; tests set it.
- **Where it's used:** only by effects (`chance`, and the death scatter). Every draw advances the seed in state, so saves, retries and tests reproduce exactly.
- **Why only effects:** effects run only when the engine acts, so a miss can't consume randomness.

### Daemons and fuses

- **Daemons:** `world.daemons: Array<{ if: string; then: string | EventStep[] }>` run, in order, after every turn the engine acted on, at the point where ambient lines run today. Each runs its event or steps whenever its condition holds.
- **Ambient lines** keep their meaning and become sugar: the engine treats `{ if, every, lines }` as a daemon over the turn counter.
- **Fuses:** `GameState.fuses?: Record<eventKey, turnsLeft>`.
  - `schedule` sets one; scheduling an event that's already pending resets its count.
  - `cancel` removes one.
  - After each acted-on turn, every fuse counts down, and those reaching 0 run, in the order they were scheduled, before daemons.
- **Order after an acted-on turn:**
  1. the command's own result;
  2. `turns += 1`;
  3. fuses;
  4. daemons (ambient included);
  5. their lines are appended.

  None of this happens on a miss.

### The lamp, as data (Zork)

```ts
vars: { lamp_fuel: 185 },
daemons: [
  { if: 'on:lamp', then: [{ add: 'lamp_fuel', by: -1 }] },
  { if: 'on:lamp & var:lamp_fuel=85 & here:lamp', then: ['The lamp appears a bit dimmer.'] },
  { if: 'on:lamp & var:lamp_fuel=15 & here:lamp', then: ['The lamp is definitely dimmer now.'] },
  { if: 'on:lamp & var:lamp_fuel=0 & here:lamp', then: ['The lamp is nearly out.'] },
  { if: 'on:lamp & var:lamp_fuel<0', then: 'lamp_dies' },
],
// lamp_dies: [{ switch: 'lamp', on: false }, { set: 'lamp_dead' }, 'You’d better have more light than from the brass lantern.']
// lamp: instead.turn_on: [{ if: 'flag:lamp_dead', say: ['A burned-out lamp won’t light.'] }]
```

Zork's table (warnings after 100, 170 and 185 lit turns, out on the next) maps onto those thresholds: 185 fuel, warnings at 85, 15 and 0 left, out below 0. (Zork only prints them when the lamp is held or in the room, hence `here:lamp`.) A unit test pins the turn each line appears on; the differential walkthrough is too short to reach them.

## 2. Darkness, death and endings

### Light and darkness

- **Dark rooms.** `room.dark?: boolean`; rooms are lit by default.
- **When a room is lit** (`isLit(world, state, roomId)` in `src/engine/light.ts`): it isn't dark, or some item with `light: true` that's switched on is visible from there. "Visible" means in the room, carried, or inside an open or transparent container, per stage 1's sight rules.
- **In a dark, unlit room:**
  - **Describing the room** (on entry and LOOK) prints `world.darkness.look`, defaulting to “It is pitch black.” (Zork: “It is pitch black. You are likely to be eaten by a grue.”), instead of the description, sentences and contents.
  - **What you can touch:** visible and reachable items shrink to the inventory. Verbs that need to see something in the room (TAKE, EXAMINE, OPEN, READ, SEARCH, PUT's destination, USE on something here) answer `world.darkness.tooDark`, defaulting to “It’s too dark to see.”, as an **understood** refusal, so the intent server isn't asked to re-guess.
  - **Still working:** INVENTORY, moving through real exits, and verbs on carried things (TURN ON LAMP).
  - **Blundering:** a GO with no matching exit runs `world.darkness.blunder` (steps) instead of the usual miss, when the world defines it. Zork:

    ```ts
    blunder: [{ chance: 80, then: [{ die: 'Oh, no! You have walked into the slavering fangs of a lurking grue!' }], else: ['You can’t go that way.'] }]
    ```

    This is an understood, acting result (it can change state), because it's a real move attempt in the dark, not a misreading. Without `blunder` it's the usual miss.
- **When the light changes.** If TURN ON/OFF, an effect, a move or a death changes whether the current room is lit, the reply adds `world.darkness.fall` (“It is now pitch black.”) or, when light returns, the room's description.
- **Condition:** `lit:here` / `lit:ROOM`.
- **For the intent server:** in a dark room the context lists only the inventory and exits.

### Death and resurrection

```ts
death?: {
  message?: string[];       // after the cause; Zork: '****  You have died  ****'
  penalty?: number;         // score change; Zork: -10
  lives?: number;           // deaths allowed before the final one; Zork: 2
  respawn?: string;         // room; Zork: forest_1
  resurrection?: string[];  // Zork: 'Now, let’s take a look here… Well, you probably deserve another chance…'
  scatter?: string[];       // rooms carried things are spread over (randomly, seeded)
  final?: string[];         // the last death; Zork: 'You clearly are a suicidal maniac…'
}
// Item gains:
home?: string;              // a dead player's carried item goes here instead of scattering (Zork's lamp)
```

- **`{ die: 'cause' }`:**
  1. Print the cause, then `death.message`.
  2. Apply `penalty`.
  3. If the deaths count (the `deaths` variable) has reached `lives`, print `final`, set `gameOver`, and stop.
  4. Otherwise: add one to `deaths`; move carried items to their `home`, or to a random `scatter` room (or leave them where the player died, if there's no `scatter`); cancel every fuse; print `resurrection`; `go` to `respawn`.
- **A world with no `death` block:** `die` prints the cause and ends the game. Existing worlds never die.
- **Effects after `die`** in the same list are skipped.

### Endings

- **`world.endings?: Record<id, { lines: EventStep[]; score?: boolean; footer?: string[] }>`.** `{ end: 'id' }` runs the lines, then the score with rank if `score` is set, then the footer, and sets `gameOver`.
- **The finale becomes shorthand.** When the world loads, the engine rewrites `world.finale` into `instead.smash` rules on the finale item plus an ending named `finale`. The output is identical: event, matching epilogues, score, footer. `handleSmash`'s finale branch goes away. Office Space's ending tests prove it.
- **Analytics:** `game_completed` fires on any transition to `gameOver`, as now.

### Exits with several refusals

`Exit` gains `denials?: Array<{ if: string; text: string }>`, checked before `if`/`door`. The first whose condition holds refuses with its text. This is for exits whose refusal depends on why (Zork's chimney). It's understood and changes nothing, like every exit refusal.

### Brief and verbose

- **New built-in verbs:** VERBOSE, BRIEF and SUPERBRIEF (parser, dispatcher, HELP, `ACTION_VOCAB`).
- **State:** `GameState.verbosity?: 'verbose' | 'brief' | 'superbrief'`.
  - Verbose shows full descriptions always.
  - Brief shows them on the first visit only.
  - Superbrief shows names only, except on LOOK.
- **Defaults:** brass is verbose; infocom is brief (stage 1's behavior).
- **Replies** in infocom style: “Maximum verbosity.”, “Brief descriptions.”, “Superbrief descriptions.”. In brass: “[Full descriptions.]”, “[Brief descriptions.]”, “[Room names only.]”.

## 3. The Zork I slice, testing and compatibility

### The slice: the first underground rooms

- **Rooms:** Cellar, East of Chasm, Gallery, Studio. Text from the MIT source as before.
- **Darkness:**
  - the cellar, East of Chasm and the studio are dark, and the gallery is lit;
  - the **attic** becomes dark, as in the original. The stage-1 walkthrough already carries the lit lamp up there, so it keeps matching.
- **The trap door:**
  - The cellar's `onEnter` runs, once: “The trap door crashes shut, and you hear someone barring it.”, with `close` and `lock` effects on the trap door.
  - The living room's `down` exit then shows the closed door. From the cellar, the trap door can't be opened (“The door is locked from above.”, an `instead.open` rule there).
- **The chimney:** the studio's `up` exit is

  ```ts
  { to: 'kitchen', denials: [
      { if: 'carrying<=0', text: 'Going up empty-handed is a bad idea.' },
      { if: '!has:lamp', text: 'You can’t get up there with what you’re carrying.' },
      { if: 'carrying>2', text: 'You can’t get up there with what you’re carrying.' }] }
  ```
- **Points:**
  - the cellar's 25 points are an `onEnter` flag, like the kitchen's 10;
  - the painting is worth 4 for taking it (`after.take` flag) and 6 while it's in the trophy case (a condition score entry);
  - **death** costs 10.
- **The boundary:** north from the cellar, “The troll’s domain isn’t built yet.” (a message exit; stage 4). East of Chasm `down` is Zork's own line (“The chasm probably leads straight to the infernal regions.”).
- **The lamp:** fuel, warnings and burnout, as in section 1.
- **Death and darkness:** `darkness`, `death` (respawn forest_1, the lamp's `home` the living room, scatter over the above-ground rooms), Zork's texts.

### Testing

- **Differential walkthrough.** Extend it through the slice:
  - lamp on, down (the trap door crashes shut), the cellar's description and points;
  - south to the chasm, east to the gallery, take the painting;
  - north to the studio, up the chimney with the lamp and painting (the case for the two-item limit);
  - west to the living room, open the case, put the painting in, SCORE;
  - VERBOSE, LOOK, BRIEF;
  - turn off the lamp in the living room and back on (lit room: no darkness line).

  It must match line for line with an empty allowlist, randomness aside.
- **Unit tests, one file per module:**
  - `effects.test.ts`: every effect;
  - `time.test.ts`: daemons, fuses, ordering, nothing on a miss;
  - `light.test.ts`: dark rooms, light through glass, too-dark refusals as understood non-mutating replies, the light-change lines;
  - `death.test.ts`: seeded scatter, homes, lives, final death, no `death` block;
  - `endings.test.ts`: `end`, and the finale rewrite producing identical output;
  - `rng.test.ts`: the same seed gives the same sequence;
  - plus the lamp burning out in a short-fuel fixture.
- **Fixed death texts** (Zork's “You have died” and resurrection lines) are compared against the original in a scripted test that makes a death happen there.
- **Miss invariant:** the engine-hooks test adds the new verbs, plus a dark-room TAKE (understood, unchanged).
- **World audit:** a shared test checks every world (tutorial, fixture, Zork, and Office Space in its repo) for unknown effect kinds, effects naming missing things, `move` to unknown places, and the reserved `player` ID. That last check is a stage-1 deferred minor.
- **The fixture world** gains a dark room, a light with fuel, a daemon, a fuse, a death block and an ending.

### Compatibility

- **New state fields are optional:** `vars`, `rng`, `fuses`, `verbosity`. A save without them gets defaults on load; the format stays 2.0, with no migration.
- **Bracket lines, `ambient` and `finale`** keep working, as sugar.
- **Office Space** syncs with no world changes, and its tests, including the full playthroughs, pass unchanged.

### Code

| File | Owns |
|---|---|
| `src/engine/effects.ts` | `runSteps`; bracket-line parsing moves here from `rules.ts` |
| `src/engine/time.ts` | daemons, fuses, ambient-as-daemon, the after-turn sequence |
| `src/engine/light.ts` | `isLit`, the dark filter on visibility, light-change detection |
| `src/engine/death.ts` | `die`, scatter, homes |
| `src/engine/endings.ts` | `end`, the finale rewrite |
| `src/engine/rng.ts` | the seeded generator |
| `src/engine/rules.ts` | keeps rule lookup only |

### Docs

- **world-schema:** effects, `vars`, `daemons`, `darkness`, `death`, `endings`, `dark`, `home`, `seed`, conditional score entries.
- **conditions-and-events:** `var:`, `carrying`, `lit:`, and the structured-effects table, which becomes the primary form.
- **commands:** VERBOSE, BRIEF, SUPERBRIEF.
- **porting-zork:** the stage-2 rooms and how ZIL's interrupts, JIGS-UP and LIT? map to daemons, `die` and `dark`.
- **CHANGELOG** 1.5.0.

## Out of scope

- Disambiguation, orphaning, ALL beyond TAKE, AGAIN/OOPS/UNDO, save slots (stage 3).
- The troll, the thief, the cyclops, combat, weight, the code hatch (stage 4).
- Vehicles and the rest of the map (stage 5).
- **Next, outside the roadmap:** publishing the engine as an npm library. The owner raised it on 2026-10-05; plan it after stage 2 ships: what to export, how a game supplies its world, and where the Vue terminal lives.
