# Engine parity, stage 4b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hidden characters, topics and orders in the engine; the native Zork I maze, cyclops, Treasure Room and thief, proved against `zork1.z3`; and the backlog items this stage touches.

**Architecture:** Generic pieces go in the engine (hidden state, `treasure`, room `tags`, script helpers, topics, orders). The thief and cyclops are world data plus scripts run by daemons, whose list order is Zork's interrupt order. The differential test gains sync points for the thief's lair fight, and line-set tests for his wandering.

**Tech Stack:** TypeScript 6, Vue 3, Pinia, Vitest 5, ifvms (the differential tests), VitePress.

**Spec:** `docs/superpowers/specs/2026-10-05-engine-parity-stage-4b-design.md`

## Global Constraints

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run.
- The LLM only classifies.
- Conditions are parsed only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator (`nextRandom`, `roll`, `prob` in `src/engine/rng.ts`).
- Built-in verbs go in four places: parser regex and `BUILT_IN_WORDS`, dispatcher, HELP (`src/engine/verbs/meta.ts`), `ACTION_VOCAB` (`server/src/llm.ts`).
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text.
- Coverage: 80% lines, functions and statements; 75% branches.
- Shared tests must not import `src/worlds/zork1.ts` or `src/worlds/examples/`.
- When zork1.z3 disagrees with the ZIL source, the story file wins.
- ZIL source: `/tmp/zork1-src` (`git clone --depth 1 https://github.com/historicalsource/zork1.git /tmp/zork1-src`).

## Review Focus

1. A hidden character named by the player (`kill thief` while he's hidden): a miss, as if he weren't there, with no state change.
2. An order to a character who isn't here (`lumbergh, sit` in an empty room): a miss the LLM can retry, not “ignores you”.
3. ASK *X* ABOUT *Y* where *X* is absent or *Y* matches no topic: a miss when X is absent; the `noTopic` or TALK line otherwise.
4. The thief taking the player's only lit lamp in a dark room: the light-change line, and darkness afterwards.
5. UNDO right after the thief robs you: the stolen things come back, and the seed replays the same theft.

Tests: Tasks 1, 2, 2, 6, 6.

---

### Task 1: Hidden characters, treasures, room tags and script helpers

**Files:**
- Modify: `src/types/game.ts` (`NpcState.hidden?`), `src/types/world.ts` (`Item.treasure?`, `Room.tags?`), `src/engine/model.ts` (`isNpcIn` gains `visibleOnly` callers via `npcsSeen`), `src/engine/describe.ts`, `src/engine/verbs/people.ts`, `src/engine/model.ts` `matchNpc`, `src/engine/conditions.ts` (`seen:`), `src/engine/scripts.ts` (helpers), `tests/helpers/audit.ts`
- Test: `tests/engine/hidden.test.ts` (new), `tests/engine/scripts.test.ts`

**Interfaces:**
- Produces: `npcsSeen(world, state, room): string[]` (in the room and not hidden) in `model.ts`, used by describe, talk, give, `matchNpc` and combat's “in the room” check for swinging; `isNpcIn` unchanged (hidden still counts, for scripts). Condition `seen:NPC`. ScriptContext gains `npcIn(id, room)`, `rooms(): string[]`, `visited(room)`, `treasure(id): number`, `tags(room): string[]`, `lit(room?): boolean`, `children(place): string[]`.

- [ ] **Step 1: Failing tests** (`tests/engine/hidden.test.ts`, fixture `guard` in the shed):

```ts
import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '@/engine/conditions';
import { execute } from '@/engine/engine';
import { runSteps } from '@/engine/effects';
import { isNpcIn, npcsSeen } from '@/engine/model';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('hidden characters', () => {
  it('are in the room for scripts, but not seen, listed, matched or fought', () => {
    const s = stateWith(world, { room: 'shed' });
    runSteps([{ npcState: 'guard', hidden: true }], world, s);
    expect(isNpcIn(world, s, 'guard', 'shed')).toBe(true);
    expect(npcsSeen(world, s, 'shed')).toEqual([]);
    expect(evaluateCondition('seen:guard', s, world)).toBe(false);
    expect(execute({ action: 'look' }, { world, state: s }).lines.join(' ')).not.toContain('guard');
    const before = structuredClone(s);
    expect(execute({ action: 'talk', target: 'guard' }, { world, state: s }).understood).toBe(false);
    expect(execute({ action: 'attack', target: 'guard' }, { world: { ...world, combat: {} }, state: s }).understood).toBe(false);
    expect({ ...s, turns: 0, moveCount: 0 }).toEqual({ ...before, turns: 0, moveCount: 0 });
    runSteps([{ npcState: 'guard', hidden: false }], world, s);
    expect(evaluateCondition('seen:guard', s, world)).toBe(true);
  });
});
```

and in `scripts.test.ts` a script printing `ctx.npcIn('guard','shed')`, `ctx.rooms()[0]`, `ctx.visited('bedroom')`, `ctx.treasure('coin')` (fixture `coin` gets `treasure: 2`), `ctx.tags('cellar')` (fixture `cellar` gets `tags: ['deep']`), `ctx.lit('bedroom')`, `ctx.children('chest').join()` — expected `true bedroom true 2 deep true coin`.

- [ ] **Step 2: Run** `npx vitest run tests/engine/hidden.test.ts tests/engine/scripts.test.ts`. Expected: FAIL (`npcsSeen` not exported).
- [ ] **Step 3: Implement.**

```ts
// model.ts
/** The characters in a room the player can see: present and not hidden. */
export function npcsSeen(world: World, state: GameState, roomId: string): string[] {
  return npcsIn(world, state, roomId).filter((id) => !state.npcs?.[id]?.hidden);
}
```

Replace `npcsIn(world, state, state.currentRoom)` with `npcsSeen` in `matchNpc`, `people.ts` (both), and the room listing in `describe.ts`; in `combat.ts` `fightTurn`, a hidden character doesn't wake, strike first or swing (`isNpcIn(…) && !hidden`). `conditions.ts`: `case 'seen': result = world ? npcsSeen(world, state, state.currentRoom).includes(value) : false;` plus `seen` in `conditionProblems`' character kinds. `npcState` effect already copies fields, so `hidden` works once typed. Script helpers in `scriptSteps`:

```ts
    npcIn: (id, room) => isNpcIn(world, state, id, room),
    rooms: () => Object.keys(world.rooms),
    visited: (room) => state.visited.includes(room),
    treasure: (id) => world.items[id]?.treasure ?? 0,
    tags: (room) => world.rooms[room]?.tags ?? [],
    lit: (room) => isLit(world, state, room ?? state.currentRoom),
    children: (place) => childrenOf(world, state, place),
```

- [ ] **Step 4: Run** `npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `"Hidden characters, treasures, room tags, and what scripts can read"`.

---

### Task 2: Topics and orders

**Files:**
- Create: `src/engine/verbs/talk.ts` (`handleAsk`, `handleOrder`)
- Modify: `src/types/world.ts` (`NPC.topics?`, `topicAliases?`, `noTopic?`, `refuseOrder?`), `src/engine/parser.ts` (ASK/TELL ABOUT; orders), `src/engine/fuzzy.ts` (nothing new: use `fuzzyCandidates`), `src/engine/engine.ts` (dispatch `ask`, `order`), `src/engine/verbs/meta.ts` (HELP), `server/src/llm.ts` (`ask`, `order`, prompt lines), `tests/helpers/audit.ts` (topic conditions and events)
- Test: `tests/engine/talk.test.ts` (new), `tests/engine/parser.test.ts`

**Interfaces:**
- Produces: actions `{ action: 'ask', target: npcWord, indirect: topicWords }` (ASK X ABOUT Y and TELL X ABOUT Y) and `{ action: 'order', target: npcWord, indirect?: commandText }` (“X, cmd”, “tell X to cmd”, “order X to cmd”, bare “tell X”). `handleAsk(action, world, state)`, `handleOrder(action, world, state)`.

- [ ] **Step 1: Failing tests.** Parser:

```ts
expect(fallbackParse('ask neighbor about the fence')).toEqual({ action: 'ask', target: 'neighbor', indirect: 'the fence' });
expect(fallbackParse('tell neighbor about my wallet')).toEqual({ action: 'ask', target: 'neighbor', indirect: 'my wallet' });
expect(fallbackParse('ask neighbor')).toEqual({ action: 'talk', target: 'neighbor' });
expect(fallbackParse('neighbor, give me the key')).toEqual({ action: 'order', target: 'neighbor', indirect: 'give me the key' });
expect(fallbackParse('tell the neighbor to leave')).toEqual({ action: 'order', target: 'neighbor', indirect: 'leave' });
expect(fallbackParse('tell neighbor')).toEqual({ action: 'order', target: 'neighbor' });
```

`splitCommands` must keep “neighbor, give me the key” whole (the comma is the order's). Engine (`talk.test.ts`), with the fixture neighbor given `topics: { fence: [{ if: 'flag:paid', text: '“Fixed it myself.”' }, { text: '“Needs paint.”' }], dog: '“Not my dog.”' }`, `topicAliases: { fence: ['picket'] }`, `noTopic: '“Couldn’t say.”'`:

```ts
it('answers by topic, with conditions and aliases', () => {
  const s = stateWith(w, { room: 'yard' });
  expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'the fence' })).toEqual(['“Needs paint.”']);
  s.flags.paid = true;
  expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'picket' })).toEqual(['“Fixed it myself.”']);
  expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'dog' })).toEqual(['“Not my dog.”']);
  expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'the moon' })).toEqual(['“Couldn’t say.”']);
});
it('without topics, ASK ABOUT is TALK', () => { /* world without topics → the dialogue default line */ });
it('asking someone who isn’t here is a miss', () => { /* in the bedroom: understood false */ });
it('orders get the character’s rule, its refusal, or “ignores you”', () => {
  // instead.order rule → its say; refuseOrder → that line; neither → 'Neighbor ignores you.'
});
it('an order to someone who isn’t here is a miss', () => {});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Parser regexes, placed before `RE.ask` and `RE.talk` in `VERB_PATTERNS` (order matters):

```ts
  askAbout: /^(?:ask|question|tell)\s+(?:the\s+)?(.+?)\s+about\s+(.+)$/i,
  orderTo: /^(?:tell|order|ask)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/i,
  orderComma: /^(?:the\s+)?([^,]+?)\s*,\s*(.+)$/i,
  tellAlone: /^tell\s+(?:the\s+)?(.+)$/i,
```

`orderComma` is tried in `fallbackParse` before splitting only when the part before the comma isn't a verb word (check against `BUILT_IN_WORDS` and world verb words), so “take key, wallet” still lists; `splitCommands` gets the same check so it doesn't split an order. `talk.ts`:

```ts
export function handleAsk(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const npc = matchNpc(action.target, world, state);
  if (!npc) return miss(`There is no “${action.target}” here to ask.`);
  const person = world.npcs[npc];
  if (!person.topics || !action.indirect) return handleTalk(action.target, world, state);
  const keys = Object.keys(person.topics);
  const candidates = keys.map((k) => ({ id: k, name: k, aliases: person.topicAliases?.[k] }));
  const [key] = fuzzyCandidates(action.indirect.replace(/^(?:the|my|your|a|an)\s+/i, ''), candidates);
  if (!key) return ok([person.noTopic ?? talkLine(world, state, npc)]);
  const entries = typeof person.topics[key] === 'string' ? [{ text: person.topics[key] as string }] : (person.topics[key] as Array<{ if?: string; text: string }>);
  const entry = entries.find((e) => !e.if || evaluateCondition(e.if, state, world));
  if (!entry) return ok([person.noTopic ?? talkLine(world, state, npc)]);
  return world.events[entry.text] ? ok(runEvent(entry.text, world, state), true) : ok([entry.text]);
}

export function handleOrder(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const npc = matchNpc(action.target, world, state);
  if (!npc) return miss(`There is no “${action.target}” here.`);
  return withRules('order', { ...action, target: action.target }, world, state, () =>
    ok([world.npcs[npc].refuseOrder ?? `${world.npcs[npc].name} ignores you.`]),
  );
}
```

(`talkLine` is `handleTalk`'s chosen-line logic extracted into `people.ts` and exported.) `withRules` for `order` finds the character's `instead.order` rules through its existing character lookup. HELP: `ASK <someone> ABOUT <thing>` and `<someone>, <command>`. `ACTION_VOCAB`: `ask`, `order`; prompt: “Asking or telling someone about something is ask: target is the person, indirect is the topic. Telling someone to do something is order: target is the person, indirect is what they were told.” Audit: topic entries' `if` conditions and event keys.

- [ ] **Step 4: Run** everything, including Office Space-style lists (`take key and wallet`, `take key, wallet`). Expected: pass.
- [ ] **Step 5: Commit** `"Topics and orders"`.

---

### Task 3: Backlog fixes

**Files:**
- Modify: `tests/helpers/audit.ts`, `src/engine/conditions.ts` (`conditionProblems`), `src/engine/combat.ts` (`diagnoseLines`, `weaponHeldBy`, `awaken`), `src/engine/death.ts` + `src/types/world.ts` (`Death.then?`), `src/engine/verbs/attack.ts` (item `instead.attack`), `src/engine/verbs/all.ts` (PUT ALL), `tests/worlds/zork1-allowlist.ts` (comment), `docs/superpowers/backlog.md`
- Test: `tests/worlds/audit.test.ts`, `tests/engine/combat.test.ts`, `tests/engine/fight.test.ts`, `tests/engine/all.test.ts`, `tests/engine/death.test.ts`

- [ ] **Step 1: Failing tests**, one per item:
  - audit: a broken world with `npcs.ghost = { combat: { strength: 1, weapon: 'nothing', onDeath: 'missing', fears: { item: 'nope', by: 1 } }, holds: ['void'], descriptions: [{ if: 'flagg:x', text: '' }], instead: { take: [{ then: 'gone' }] } }` reports each (`npc ghost combat: weapon names no item “nothing”`, `npc ghost combat onDeath: names no event “missing”`, `npc ghost combat fears: names no item “nope”`, `npc ghost holds: no item “void”`, `npc ghost descriptions: unknown condition “flagg:x”`, `npc ghost instead.take: names no event “gone”`); `conditionProblems('has:neighbor', world)` reports `names no item “neighbor”`;
  - DIAGNOSE in the fixture world (no `combat`) is `['[You are in perfect health.]']` only;
  - `death.then`: a death with `then: 'reborn'` runs `reborn` after the resurrection lines;
  - weapon recency: carrying the bat and then taking the cudgel, a guess picks the cudgel (`(with the cudgel)`);
  - wake counter: an unconscious guard with `wake: 50`, the player leaves: the guard wakes (AWAKEN) and its `wake` stays 50;
  - item `instead.attack`: in a combat world, `attack crate` with a crate `instead.attack` rule says its line;
  - PUT ALL: carrying the jar and the marble, `put all in glass jar` never answers “glass jar: …”.
- [ ] **Step 2: Run.** Expected: each FAILs.
- [ ] **Step 3: Implement:**
  - audit (in `tests/helpers/audit.ts`): for each NPC, `checkEvent` on `combat.onDeath/onUnconscious/onWake/onBusy`, `isItem` on `combat.weapon`, `fears.item`, each `holds`; `checkCondition` on `descriptions[].if`; `checkTable(npc.instead/after)`; topics' conditions and events (Task 2);
  - `conditionProblems`: `has` and `on` check `value in world.items` only; `here` keeps characters;
  - `diagnoseLines`: when `!world.combat`, return only the health line;
  - `Death.then?: string`, run with `runEventKey` at the end of a resurrection in `death.ts`;
  - `weaponHeldBy(world, state, 'player')`: the carried weapon with the highest `state.placed` stamp (most recently taken);
  - `awaken(world, state, npc)` no longer resets `wake`; the in-room wake path sets `wake = 0` before calling it (Zork's `<PUT .OO ,V-PROB 0>`);
  - `handleAttack` in a combat world: a non-person target runs `withRules('attack', …)` with the notPerson line as the default;
  - `covered()` for `put`: resolve `action.indirect` with `pickItem(action.indirect, visibleItems(world, state), world, 'indirect', state)` and filter that ID;
  - the allowlist comment: “The walkthrough carries the sword from stage 4a on.”;
  - `backlog.md`: strike the items above.
- [ ] **Step 4: Run** everything. Expected: pass.
- [ ] **Step 5: Commit** `"Backlog: the audit checks characters; DIAGNOSE, death.then, weapon recency, wake counters, attack rules, PUT ALL"`.

---

### Task 4: The Zork map slice, in Zork's room order

**Files:**
- Create: `tests/helpers/zobjects.ts` (reads the object tree and short names from a v3 story file)
- Modify: `src/worlds/zork1.ts`
- Test: `tests/worlds/zork1-rooms.test.ts` (new), `tests/worlds/zork1.test.ts`

**Interfaces:**
- Produces: `storyRooms(story: Uint8Array): string[]` — the short names of the children of the object named `ROOMS`… (v3 has no symbolic names, so: the children of the parent object of “West of House”, in sibling order), returned as display names.

- [ ] **Step 1: Failing test** `zork1-rooms.test.ts`:

```ts
it('native rooms are listed in the story file’s room order', () => {
  const order = storyRooms(story);                 // e.g. ['Forest', 'West of House', …]
  const native = Object.values(zork1.rooms).map((r) => r.name.replace(/^The /, ''));
  const positions = native.map((n) => order.findIndex((o) => o.replace(/^The /, '') === n));
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);   // a subsequence, in order
});
```

(Duplicate names like “Forest”, “Maze” and “Dead End” are matched in order of appearance; the helper pairs repeats left to right.)

Plus `zork1.test.ts` checks: the maze's exits from MAZE-1 (`east` → troll room, `north` → maze 1, `south` → maze 2, `west` → maze 4) and one dead end; the grating unlocks with the skeleton key from below and opens to the clearing; the Treasure Room gives 25 points once; the skeleton key, coins and rusty knife are where the ZIL puts them (MAZE-5, MAZE-5, MAZE-5 per 1dungeon.zil); treasure values (coins 5… from TVALUE).

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `zobjects.ts` (Z-machine v3: header 0x0A object table, 31 default property words, 9-byte entries `attr[4] parent sibling child propAddr[2]`; the property table begins with a text-length byte and a Z-string; decode with alphabets A0 `abcdefghijklmnopqrstuvwxyz`, A1 uppercase, A2 ` \n0123456789.,!?_#'"/\-:()`, shifts 4/5, abbreviations from the header 0x18 table, and 10-bit ZSCII for A2 code 6). Then in `zork1.ts`: reorder the existing rooms to the story order; add MAZE-1…15, DEAD-END-1…4, GRATING-ROOM, CYCLOPS-ROOM, STRANGE-PASSAGE, TREASURE-ROOM with their ZIL exits and LDESCs (1dungeon.zil 1538–1760); tag the maze rooms `maze` and the above-ground rooms `sacred` (the ZIL's SACREDBIT rooms: grep `SACREDBIT` in 1dungeon.zil); add the bones, burned-out lantern, rusty knife (`weapon`), skeleton key, bag of coins, chalice with ZIL sizes and `treasure` (TVALUE) and room-scoring entries for the coins, chalice, egg and canary in the trophy case; the grate: locked, the skeleton key unlocks it from below.
- [ ] **Step 4: Run** everything, including the existing differential test (which must still pass: the new rooms are off its path). Expected: pass.
- [ ] **Step 5: Commit** `"Zork I native: the maze, the Grating Room, the cyclops's rooms and the Treasure Room, in Zork's room order"`.

---

### Task 5: The cyclops

**Files:**
- Modify: `src/worlds/zork1.ts`
- Test: `tests/worlds/zork1.test.ts`

- [ ] **Step 1: Failing tests:** entering the Cyclops Room shows the wrath-0 description; staying, each turn prints the next CYCLOMAD line and the sixth turn kills (“The cyclops, tired of all of your games and trickery…”); GIVE LUNCH (“Mmm Mmm. I love hot peppers!…”) then GIVE WATER (the bottle) sleeps him and opens `up`; garlic and other gifts refused; ATTACK/THROW shrugs; MUNG dodges; asleep ATTACK wakes; ULYSSES here flees and opens `east` (the Strange Passage), elsewhere “Wasn’t he a sailor?”; orders: “The cyclops prefers eating to making conversation.” / asleep “No use talking to him. He’s fast asleep.”; the room's five descriptions.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** from 1actions.zil 1515–1660 and gverbs.zil 945–961: NPC `cyclops` (no `combat`: he isn't fought), var `cyclowrath`, flags `cyclops_asleep`, `magic_word`; room `descriptions` by those; exits `up: { to: 'treasure_room', denials: [{ if: '!flag:cyclops_asleep & !flag:magic_word', text: 'The cyclops doesn’t look like he’ll let you past.' }] }`, `east: { to: 'strange_passage', denials: [{ if: '!flag:magic_word', text: 'The east wall is solid rock.' }] }`; onEnter `{ if: '!var:cyclowrath=0', then: 'cyclops_stirs', repeat: true }`; a daemon `{ if: 'in:cyclops_room & with:cyclops & !flag:cyclops_asleep & !var:cyclowrath=0', then: [{ script: 'cyclops_turn' }] }` placed first in the daemon list (CLOCKER runs the newest interrupt first, and I-CYCLOPS is queued during play, after GO queued the lantern, the thief and the sword); scripts `cyclops_turn` (I-CYCLOPS), `cyclops_gift` (GIVE), `ulysses`; world verb `ulysses` (`ulysses`, `odysseus`); `instead` rules for give/throw/attack/smash/take/tie/listen/examine/order. Wrath's sign flip on the lunch: `setVar cyclowrath` to `min(-1, -count)`.
- [ ] **Step 4: Run** everything. Expected: pass.
- [ ] **Step 5: Commit** `"Zork I native: the cyclops"`.

---

### Task 6: The thief

**Files:**
- Modify: `src/worlds/zork1.ts`
- Test: `tests/worlds/zork1.test.ts`

- [ ] **Step 1: Failing tests** (seeded; for each, loop seeds until the named outcome happens, then pin the seed):
  - he starts hidden in the Round Room and moves one room per turn in room order, skipping `sacred` rooms;
  - in a visited room you're not in, he takes each treasure at 75%;
  - in your dark room (not the troll's): appears; robs you (“A seedy-looking individual…from your possession…”); robs the room; “The thief, finding nothing of value, left disgusted.”; “lean and hungry” line;
  - taking your only lit light leaves you in the dark (“The thief seems to have left you in the dark.”);
  - in the maze while you're in the maze: “You hear, off in the distance, someone saying…”;
  - drops junk at 30% (“The robber, rummaging through his bag…” when you're there);
  - his lair: deposits treasures silently; you entering it brings him (“You hear a scream of anguish…”) fighting and hides the other treasures (“The thief gestures mysteriously…”); the chalice can't be taken while he's there; the egg deposited there comes back open with the canary;
  - fights (THIEF-MELEE), retreats when losing, grabs a dropped stiletto (“The robber, somewhat surprised…”), engrossed after a treasure gift;
  - his death: stiletto and loot drop, the lair's treasures reappear (“As the thief dies…” and one line each), “The chalice is now safe to take.”;
  - throw the knife (10% flee and spill), gifts, TAKE, EXAMINE, LISTEN, orders (“The thief is a strong, silent type.”);
  - UNDO after a theft restores the things (store test on the native world, through `useGameStore` with a zork1 cartridge in `tests/worlds/zork1.test.ts`, not a shared test).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** from 1actions.zil 1764–2060 and 3890–3992, 2138–2161 (TREASURE-ROOM-FCN), the CHALICE-FCN take check, and THIEF-MELEE (3760–3800): NPC `thief` (`holds: ['stiletto', 'large_bag']`, `combat: { strength: 5, weapon: 'stiletto', fears: { item: 'knife', by: 1 }, messages: THIEF-MELEE, onBusy: 'thief_busy', onDeath: 'thief_dies' }`, descriptions for normal and unconscious (ROBBER-C-DESC, ROBBER-U-DESC)); initial state hidden (`npcs.thief` defaults set by an `intro` effect `{ npcState: 'thief', hidden: true }`); a daemon `{ if: 'alive:thief', then: [{ script: 'thief_turn' }] }` placed between the lamp's and the sword's daemons; scripts `thief_turn` (I-THIEF with THIEF-VS-ADVENTURER, ROB, STEAL-JUNK, ROB-MAZE, DROP-JUNK, DEPOSIT-BOOTY, HACK-TREASURES, RECOVER-STILETTO, STOLE-LIGHT?), `thief_busy`, `thief_dies`, `thief_gift`, `thief_knife`; the Treasure Room's repeating onEnter `thief_lair`; the chalice's `instead.take` while `seen:thief`; WINNING? as a script helper inside `thief_turn` using the combat numbers (`ctx.npc('thief').strength` against the player's strength, computed as `fightStrength`'s formula from `ctx.state`); `sword_glow` switched to `ctx.npcIn`, counting characters that are alive and not hidden (Zork's INFESTED? skips INVISIBLE actors).
- [ ] **Step 4: Run** everything, including the differential tests (the native thief now exists: the walkthrough's native side must choose seeds where he never shows; add that as a native-side condition on every command: a reply mentioning him triggers a reseed of the whole native run).
- [ ] **Step 5: Commit** `"Zork I native: the thief"`.

---

### Task 7: The differential tests

**Files:**
- Modify: `tests/worlds/zork1-diff.test.ts`, `tests/worlds/zork1-allowlist.ts`
- Create: `tests/worlds/zork1-thief.test.ts`, `tests/worlds/zork1-cyclops.test.ts`

- [ ] **Step 1:** Walkthrough extension after the stage 4a section (from the Round Room, back west to the Troll Room): `west` into the maze and Zork's standard path to the Cyclops Room (MAZE-1 → … → MAZE-15 → NW of it), picking up the skeleton key, coins and rusty knife on the way (MAZE-5); `give lunch to cyclops`, `give water to cyclops` (the bottle); `up` to the Treasure Room: a sync point `@lair-fight` (`kill thief with knife` until he's dead on each side; the original restarts when its player dies; the native side picks a seed where the player wins; the cap of restarts raised to 60); `take chalice`; `down`; `ulysses` (he's asleep: “Wasn’t he a sailor?” — or skip if it doesn't apply); the Strange Passage `east` to the living room; `put coins in case`, `put chalice in case`. Commands whose replies depend on the fight's length or the thief's loot go in the allowlist with reasons (SCORE, DIAGNOSE). Unique-command rule as before (case variants).
- [ ] **Step 2:** `zork1-cyclops.test.ts`: a scripted visit compared reply for reply against the original (no randomness in the cyclops): wait six turns until he eats you; a second run with lunch and water; a third with ULYSSES. Restart the original whenever the thief appears.
- [ ] **Step 3:** `zork1-thief.test.ts`: the original, 150 sessions: go underground and wander a fixed loop of underground rooms for 80 turns, then into the Treasure Room and fight; collect every line. Native: 200 seeds of the same. The stage 4a rule: native lines must be original lines, rare variants excused only when rare natively too.
- [ ] **Step 4: Run** all three until they pass; record rulings for anything the story file shows that the ZIL doesn't.
- [ ] **Step 5: Commit** `"Differential tests: the maze, the cyclops, the thief"`.

---

### Task 8: Docs, recipes and 1.8.0

**Files:**
- Create: `src/worlds/examples/topics.ts` (a librarian with topics), `src/worlds/examples/wanderer.ts` (a cat that roams three rooms by a daemon script and steals a sock), their tests in `tests/worlds/examples/recipes.test.ts` (inline snapshots) and `tests/worlds/examples/audit.test.ts`
- Modify: `docs/reference/world-schema.md`, `docs/reference/conditions-and-events.md`, `docs/reference/commands.md`, `docs/guide/building-worlds/recipes.md`, `docs/guide/building-worlds/index.md`, `docs/guide/porting-zork.md`, `docs/guide/how-it-works.md`, `CHANGELOG.md`, `package.json`, `server/package.json`, `docs/superpowers/backlog.md`

- [ ] **Step 1:** The two recipe worlds and their pinned transcripts.
- [ ] **Step 2:** The doc updates listed in the spec's section 6, each checked against the code; `npm run docs:build`.
- [ ] **Step 3:** CHANGELOG 1.8.0; version bumps; full checks (lint, type-check, `test:coverage`, build, server).
- [ ] **Step 4: Commit** `"1.8.0: docs and recipes for topics, orders and wandering characters"`.

---

### Task 9: Office Space

- [ ] Sync with `scripts/sync-from-public.sh ../brass-lantern` on a new branch; Office Space's tests should pass unchanged. Bump to 1.8.0, CHANGELOG (orders: “Bill Lumbergh ignores you.”; ASK X ABOUT Y as TALK TO), PR. After the final review and CI, with the owner's go-ahead: merge both, tag `v1.8.0` on each (Office Space deploys), publish the brass-lantern release, check the live site.

---

## Self-review notes

- **Spec coverage:** hidden/treasure/tags/helpers 1; topics and orders 2; backlog 3; the slice and room order 4; the cyclops 5; the thief 6; testing layers 7 plus each task's units; docs 8; Office Space 9.
- **Deferred to execution with rulings:** the exact maze path (from the ZIL exits), the CLOCKER position of I-CYCLOPS and I-THIEF relative to the lamp and sword daemons (confirmed by Task 7), and the seeds that produce each thief outcome.
- **Type consistency:** `npcsSeen`, `isNpcIn`, `seen:`, `handleAsk`, `handleOrder`, `talkLine`, `storyRooms`, `Death.then`, `weaponHeldBy` are used under these names throughout.
