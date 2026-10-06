# Engine parity, stage 4a: characters, weight, combat and the code hatch

**Status:** approved in conversation 2026-10-05; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [stage 1](./2026-10-05-engine-parity-stage-1-design.md) (the roadmap and the decisions for the whole effort), [stage 2](./2026-10-05-engine-parity-stage-2-design.md) and [stage 3](./2026-10-05-engine-parity-stage-3-design.md).

## Decisions made while brainstorming

- **Stage 4 is cut in two.**
  - **4a (this spec):** weight and capacity; characters with locations, inventories and states; the code hatch; combat; health and DIAGNOSE; the troll and his rooms.
  - **4b:** the thief (wandering, stealing, the lair), the cyclops, characters who move and follow, ASK/TELL topics, and orders.
- **Fights are checked by their set of lines.** Combat ports Zork's tables and messages exactly. A test fights the real troll many times and collects every line it can print; every line our fights print must be one of them. Seeded unit tests pin exact outcomes. The walkthrough stays line for line before and after the fight.
- **The code hatch is named scripts that return steps.** A script sees the game read-only and returns ordinary lines and effects for the engine to apply.
- **Combat is an engine system driven by world data.** The engine owns the mechanics. The world supplies the numbers and every message. Brass worlds get short defaults.

## Invariants (unchanged)

- The engine never branches on a world's IDs. World scripts may; they're the world's own code.
- **An engine miss never mutates state.** Scripts run only where events run, which is only on acted-on turns.
- The LLM only classifies.
- Conditions are parsed only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness comes only from the seeded generator in the game state, so saves, UNDO and tests replay exactly.
- Existing worlds keep working. Office Space syncs with no world changes.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.

## 1. Characters

### State

`GameState` gains `npcs?: Record<npc id, NpcState>`:

```ts
interface NpcState {
  /** Where the character is. Defaults to the room that lists it in `room.npcs`. */
  room: string | null;
  /** Combat strength now. Negative while unconscious (Zork's convention); 0 is dead. */
  strength?: number;
  fighting?: boolean;
  staggered?: boolean;
}
```

- **Where characters are** is read from this state, not from `room.npcs` directly. `room.npcs` stays the authoring format and seeds the state on a new game and on migration of an older save.
- **Inventories** use the object tree. An item's place can be an NPC ID (the troll's axe). Things a character holds aren't listed in the room or reachable by the player.
- **Dead characters** (`room: null`) are gone: not listed, not matched, not talked to.

### Descriptions

`NPC` gains `descriptions?: Array<{ if: string; text: string }>`. The first whose condition holds is the character's line in the room listing and its EXAMINE reply, as for rooms. `description` remains the fallback. (A character's room line today is the “Present: …” list in brass style; in Infocom style it is the description, as Zork's LDESC.)

### Conditions

| Condition | True when |
|---|---|
| `alive:NPC` | the character isn't dead |
| `awake:NPC` | alive and conscious |
| `fighting:NPC` | in a fight with the player |
| `with:NPC` | in the player's room |

All negatable and joinable as usual. The audit checks that they name characters.

## 2. Weight and capacity

Opt-in per world. A world without `carry` behaves exactly as today.

```ts
world.carry = {
  limit: 100,                       // Zork's LOAD-MAX
  fumble?: { over: 7, chance: 8 },  // more than 7 things: 8% per thing to fumble a TAKE
  tooHeavy?: string,                // “Your load is too heavy.”
  tooHeavyHurt?: string,            // “Your load is too heavy, especially in light of your condition.”
  fumbled?: string,                 // “You're holding too many things already!”
};
item.size?: number;                  // Zork's SIZE. Default 5 when the world has `carry`.
container.weight?: number;           // what it holds, by weight (Zork's CAPACITY); `capacity` stays a count
```

- **Weight** is an item's size plus the weight of everything inside it (Zork's WEIGHT). Worn things count 1.
- **TAKE** refuses when the new total would exceed the current limit, unless the item is already inside something carried. Then, in a TAKE, more than `fumble.over` things carried gives a `count × chance` percent fumble from the seeded generator.
- **The current limit** starts at `limit`. Wounds lower it and healing raises it (section 4).
- **Brass defaults:** “[That’s too heavy to carry with everything else.]” and “[You’re carrying too many things.]”.

## 3. The code hatch

```ts
world.scripts?: Record<string, (ctx: ScriptContext) => EventStep[]>;

interface ScriptContext {
  world: World;
  state: Readonly<GameState>;      // a frozen view; scripts can't change it directly
  random(): number;                // the seeded generator; advances the state's rng
  arg?: string;                    // from { script, arg }
  here(id: string): boolean;       // reachable by the player
  carried(id: string): boolean;
  holder(id: string): Place;       // an item's parent
  room(): string;                  // the player's room
  npc(id: string): NpcState | undefined;
}
```

- **Calling a script:** the effect `{ script: 'name', arg?: 'text' }`, usable anywhere steps are: events, rules' `then` (via an event), daemons, combat hooks.
- **What a script returns** is run by `runSteps` like any event: lines print, effects apply, `die` and `end` halt the turn.
- **Read-only:** in tests and development the state view is deep-frozen; a script that tries to assign throws. In production it's the same object, not copied.
- **A missing script** does nothing in play, and the audit fails on it.
- **New effects scripts and data both need:** `{ moveNpc: 'troll', to: room | null }` and `{ npcState: 'troll', fighting?, staggered?, strength? }`, and the place token `'here'` (the player's room) in `move`.

## 4. Combat and health

### Who fights

`NPC` gains `combat?`:

```ts
combat?: {
  strength: number;                       // the troll: 2
  weapon?: string;                        // item it fights with, which it holds
  fears?: { item: string; by: number };   // the player's weapon that weakens it (sword, 1)
  wake?: number;                          // percent added each turn to the chance of waking (Zork: 25)
  firstStrike?: number;                   // percent chance to start a fight when the player arrives (33)
  messages?: Partial<Record<BlowResult, string[][]>>; // its blows at the player
  onDeath?: string; onUnconscious?: string; onWake?: string; onBusy?: string; // events (or scripts via events)
}
type BlowResult = 'missed' | 'unconscious' | 'killed' | 'lightWound' | 'seriousWound'
                | 'stagger' | 'loseWeapon' | 'hesitate' | 'sittingDuck';
```

Items gain `weapon?: boolean`. `world.combat?` holds the hero's side: `messages` (the player's blows, keyed the same way), `strength: { min: 2, max: 7 }` (scaled by score over `maxScore`), `cureWait: 30`, and the death line. A message is a list of parts joined, with `{weapon}` and `{defender}` filled in.

### The player's blow

ATTACK, KILL, FIGHT and STAB, WITH a weapon, at an NPC with `combat`:
- **Refusals first, in Zork's order and words** (from the world, with brass defaults): not a character; bare hands (“…is suicidal.”); not holding the weapon; not a weapon.
- **A staggered player** loses the attack (“You are still recovering from that last blow…”).
- **An unarmed or unconscious defender** dies at once.
- **Otherwise** the blow-result tables decide (`HERO-BLOW`): the attacker's strength against the defender's (less `fears.by` when the player wields the feared weapon) selects one of Zork's six tables (DEF1, DEF2A/B, DEF3A/B/C), and a seeded roll of 1–9 picks the result. A stagger becomes a lost weapon 25% of the time. The tables are engine defaults.
- **Results:** wounds lower the defender's strength; 0 kills (the black-fog line, then `onDeath`); unconscious negates strength (`onUnconscious`); a lost weapon drops to the floor.

The existing SMASH verb keeps its behavior for everything that isn't a combatant, so `smash printer with bat` is unchanged. KILL, ATTACK and HIT at a combatant route to combat; STAB and FIGHT become words of the same verb.

### Their blows

After each acted-on turn, before daemons (Zork's `I-FIGHT`):
- **Each combatant in the player's room:**
  - if unconscious, it may wake (chance grows by `wake` each turn; `onWake`);
  - if fighting, or it wins its `firstStrike` roll this turn, it swings (`VILLAIN-BLOW`), using its messages;
  - if its weapon is on the floor, it may run `onBusy` instead (the troll recovers his axe).
- **Combatants not in the room** stop fighting and lose any stagger.
- **The player's wounds** lower strength; a light wound costs 1, a serious one 2, and the carry limit drops 10 or 20 (not below 50).
- **Death:** strength 0 or less plays the world's death line through the stage 2 death system (resurrection, penalty).

### Health

- **Healing:** while wounded, one point heals every `cureWait` acted-on turns, and the carry limit rises 10 (to its maximum when fully healed). Kept in `GameState.player?: { wounds: number; load: number; cureIn?: number; staggered?: boolean }`.
- **DIAGNOSE** (a new built-in verb: parser, dispatcher, HELP, ACTION_VOCAB) reports, in Zork's words in Infocom style and short brackets in brass:
  - “You are in perfect health.” or “You have a light wound, which will be cured after N moves.”;
  - “You can be killed by one more light wound.” … “You can survive several wounds.”;
  - “You have been killed once.” when the world counts deaths.

## 5. The Zork slice

- **Rooms:** the Troll Room (dark), the East-West Passage (5 points on arrival) and the Round Room, from the ZIL text. Exits beyond (the maze, the chasm, the loud room and the other Round Room passages) refuse until stage 5.
- **The troll** (`TROLL-FCN`):
  - strength 2, axe, fears the sword by 1, first strike 33%;
  - blocks east and west with “The troll fends you off with a menacing gesture.” while `awake:troll`;
  - descriptions for armed, disarmed, unconscious;
  - `onBusy`: recovers the axe (75%, a script) or cowers when he can't;
  - `onDeath` / `onUnconscious`: drops the axe;
  - THROW and GIVE to him: catches or accepts, eats non-weapons, eats a weapon 20% of the time (and dies), else throws it back; TAKE, MOVE and MUNG replies; “The troll isn't much of a conversationalist.”
- **The axe** (size 25), **the sword** and **the knives** are weapons. Zork's item sizes for everything already ported.
- **The sword's glow** (`I-SWORD`) is a script run by a daemon while the sword is carried: “Your sword is glowing with a faint blue glow.” when a living character is next door, “…very brightly.” in the same room, “…no longer glowing.” when that ends.
- **Carry:** limit 100, fumble 7 × 8%.
- **THROW** becomes a built-in verb (THROW X AT Y), needed for the troll; elsewhere it drops the thing in the room with Zork's reply.

## 6. Testing

1. **The walkthrough** (line for line, empty allowlist except as listed):
   - picks up the sword earlier and carries it, so the glow lines and “Your load is too heavy.” are compared;
   - goes to the Troll Room; at the fight, the harness types `kill troll with sword` on each side until that side's troll is dead. A real-game session where the player dies is restarted; the native side uses a seed where the player wins;
   - resumes: take the axe, east, Round Room, back west.
   - **Allowlisted, with the reason:** commands whose replies depend on how long the fight ran (SCORE's move count, DIAGNOSE).
2. **The line set:** a test plays the real game to the Troll Room and fights to the end, many times (each a fresh session), collecting every line printed during fights. Native fights over many seeds must print only lines from that set. It covers hero blows, troll blows, waking, axe recovery, cowering, and both deaths.
3. **Unit tests:**
   - each blow table, strength scaling, fears, staggering, disarming, waking, first strike;
   - wounds, the carry limit's fall and recovery, healing, DIAGNOSE text;
   - weight (nested, worn), TAKE refusals, fumbles by seed;
   - scripts: the frozen view, `random()` advancing the seed, a missing script, steps applied;
   - the miss invariant for every new verb, and UNDO and saves replaying a fight identically.

## 7. Docs and release

- **world-schema:** `combat`, `carry`, `size`, `weapon`, `container.weight`, `scripts`, NPC `descriptions`, `NpcState`; **conditions-and-events:** the new conditions and effects; **commands:** ATTACK/KILL, THROW, DIAGNOSE.
- **Building worlds:** a recipe with a guard to fight and something heavy, and a scripts recipe. Each is a world file played by a test.
- **porting-zork:** VILLAINS / HERO-BLOW / VILLAIN-BLOW → `combat`; SIZE / LOAD-ALLOWED → `carry`; ACTION routines → scripts.
- **CHANGELOG** 1.7.0. Office Space syncs with no world changes; DIAGNOSE and THROW appear in its HELP.

## Out of scope (stage 4b and later)

- The thief, the cyclops, characters who move or follow, ASK/TELL topics, orders.
- Vehicles and the rest of the map (stage 5).
