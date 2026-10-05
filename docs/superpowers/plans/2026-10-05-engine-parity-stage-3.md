# Engine Parity Stage 3 (Parser Parity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the native engine Infocom's parser niceties and prove them against the real Zork:
- questions back to the player (which one / what);
- pronoun slots;
- AGAIN, OOPS, UNDO;
- ALL and EXCEPT;
- named saves;
- the status line, SCRIPT and VERSION.

**Architecture:**
- **Handlers** detect ties (`resolveItem` via `fuzzyCandidates`) and missing objects, and return a non-mutating, free `ask` result.
- **A pure `Conversation` object** (`src/engine/conversation.ts`) sits between the store and the engine. It owns the pending question and its answer, pronoun slots, AGAIN, OOPS and the undo history.
- **The store** keeps persistence (named saves), SCRIPT downloads and the status line.

**Tech Stack:** Vue 3, TypeScript 6, Pinia, Vitest 5, VitePress, ifvms (differential harness).

**Spec:** `docs/superpowers/specs/2026-10-05-engine-parity-stage-3-design.md`

## Global Constraints

- The engine never branches on a world's IDs.
- An engine miss never mutates state. Questions, UNDO, AGAIN-with-nothing, and the save prompts are understood, `free`, and change nothing they shouldn't.
- A pending question is resolved before the intent server is consulted. Answers are never sent to it.
- Conditions only in `conditions.ts`; fuzzy matching only in `fuzzy.ts` (`fuzzyCandidates` lives there).
- New built-in verbs go in the parser, `BUILT_IN_WORDS`, the dispatcher with HELP, and `ACTION_VOCAB`. AGAIN, OOPS, UNDO, SAVE *name*, RESTORE, SCRIPT and VERSION are store or conversation commands. They still go in `SINGLE_WORD` or the patterns, HELP and `ACTION_VOCAB`, so the intent server can map "take that back" to `undo`.
- No new `GameState` fields; conversation state isn't saved. `World` gains optional `statusLine`, `title`, `credits`.
- Office Space syncs with no world changes. Only the listed visible changes, with its tests updated for them.
- Curly quotes in player-facing text. Coverage 80/80/80/75.
- Checks before each commit: `npm run lint && npm run type-check && npx vitest run`; server changes also `cd server && npm run lint && npm run type-check && npm test`.

## Review Focus

1. Answering a question with something that is itself a command ("north" after "Which knife…?"): the question is dropped and the command runs. "nasty" never goes to the LLM.
2. UNDO right after a question, after a free command, or after a death and resurrection: undoes the last *changing* turn, and restores output length and state together.
3. TAKE ALL EXCEPT a name that matches nothing: the EXCEPT word is ignored (Zork), not an error, and nothing is taken twice.
4. A save name made of only stripped characters ("!!!"): rejected with the prompt again, never saved under an empty name.
5. OOPS after the intent server already understood the line: "There was no word to replace!".

The tests for these are in Tasks 2, 4, 5, 6 and 3.

> **Ruling (moves):** `GameState.moveCount` stays for old saves and the brass "MOVES" display, but it's now incremented on every acted-on turn (in `execute`, next to `turns`) instead of on room entry. The display and the finale's score line both then read turns. This needs no migration: saved counts simply continue.

---

### Task 1: Ties and questions

**Files:**
- Modify: `src/engine/fuzzy.ts` (`fuzzyCandidates`), `src/engine/model.ts` (`resolveItem`), `src/engine/result.ts` (`ask`), every handler that calls `matchItem` (23 call sites across `verbs/*.ts`, `rules.ts`, `world-verbs.ts`), and the 16 "X what?" replies
- Create: `src/engine/ask.ts` (wording), `tests/engine/ask.test.ts`
- Modify: `tests/fixtures/world.ts`: add a second key, `rusty_key` (`name: 'rusty key'`, `aliases: ['key']`, in the living room), so "key" is ambiguous there

**Interfaces:**

```ts
// fuzzy.ts
export function fuzzyCandidates(input: string, candidates: Array<{ id: string; name: string }>): string[];
// model.ts
export type Resolved = { id: string } | { ambiguous: string[] } | null;
export function resolveItem(target: string, ids: string[], world: World): Resolved;
// result.ts EngineResult gains
ask?: Ask;
export type Ask =
  | { kind: 'which'; slot: 'target' | 'indirect'; word: string; candidates: string[]; action: ParsedAction }
  | { kind: 'what'; slot: 'target' | 'indirect'; action: ParsedAction };
// ask.ts
export function askWhich(world: World, slot, word, candidates, action): EngineResult;  // free, understood, mutated:false
export function askWhat(world: World, slot, action, prompt?: string): EngineResult;
```

**Ties.** `fuzzyCandidates` returns, from the first tier that has any match, all matches in that tier. The tiers are: exact ID, exact name or alias word set, substring, best token-prefix score. Ties within the token-prefix tier are those sharing the best score. One more rule: when one candidate's name equals the input exactly and the others merely contain it, the exact one wins alone (that's already the tier order).

**Wording:**
- **which, infocom:** “Which key do you mean, the brass key or the rusty key?”. Three or more: “the A, the B, or the C”.
- **which, brass:** “Which do you mean: the brass key or the rusty key?”.
- **what, target:** “What do you want to take?”. The verb word is the action's canonical English: `turn_on` → “turn on”, `search` → “look in”, and so on, from a small map in `ask.ts`.
- **what, indirect:** “What do you want to unlock the wooden chest with?”, a template per verb that has an indirect object (`unlock`/`lock`: with; `put`: in; `give`: to).

Handlers replace `matchItem(...)` with `resolveItem(...)`:
- `null` → the existing miss;
- `{ ambiguous }` → `askWhich`;
- `{ id }` → proceed.

Missing objects (`if (!target) return ok(['Take what?'])`) become `askWhat`.

- [ ] **Step 1: Failing tests** (`tests/engine/ask.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fuzzyCandidates } from '@/engine/fuzzy';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('ties', () => {
  it('fuzzyCandidates returns every equally good match', () => {
    const c = [{ id: 'key', name: 'brass key key' }, { id: 'rusty_key', name: 'rusty key key' }, { id: 'lamp', name: 'lamp' }];
    expect(fuzzyCandidates('key', c).sort()).toEqual(['key', 'rusty_key']);
    expect(fuzzyCandidates('rusty', c)).toEqual(['rusty_key']);
    expect(fuzzyCandidates('rusty_key', c)).toEqual(['rusty_key']);
    expect(fuzzyCandidates('trombone', c)).toEqual([]);
  });
});

describe('questions', () => {
  it('asks which one, changing nothing and taking no time', () => {
    const s = stateWith(world, { room: 'living' });
    const before = structuredClone(s);
    const r = execute({ action: 'take', target: 'key' }, { world, state: s });
    expect(r.lines).toEqual(['Which do you mean: the brass key or the rusty key?']);
    expect(r.ask).toMatchObject({ kind: 'which', slot: 'target', candidates: ['key', 'rusty_key'] });
    expect(r.understood).not.toBe(false);
    expect(s).toEqual(before);
  });

  it('Infocom style asks the way Zork does', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'living' });
    expect(execute({ action: 'take', target: 'key' }, { world: w, state: s }).lines).toEqual(['Which key do you mean, the brass key or the rusty key?']);
  });

  it('asks what, for a missing object or a missing second object', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key'] });
    expect(execute({ action: 'take' }, { world, state: s }).lines).toEqual(['What do you want to take?']);
    expect(execute({ action: 'turn_on' }, { world, state: s }).lines).toEqual(['What do you want to turn on?']);
    const r = execute({ action: 'unlock', target: 'chest' }, { world, state: s });
    expect(r.lines).toEqual(['What do you want to unlock the wooden chest with?']);
    expect(r.ask).toMatchObject({ kind: 'what', slot: 'indirect' });
  });
});
```

- [ ] **Step 2: See it fail. Step 3: Implement. Step 4: Run everything.** Existing tests that assert "X what?" wording change to the new questions (search `what?` in tests). Only the wording changes, not the behavior.

- [ ] **Step 5: Commit** `"Ties and questions: which one, and what"`.

---

### Task 2: The conversation layer: answers and pronouns

**Files:**
- Create: `src/engine/conversation.ts`, `tests/engine/conversation.test.ts`
- Modify: `src/stores/game.ts` (route each command through `Conversation`; delete `lastTarget`/`resolvePronoun`), `tests/stores/game.test.ts`

**Interfaces:**

```ts
export interface Conversation {
  pending: Ask | null;
  it: string | null;       // last item acted on
  him: string | null;      // last NPC acted on (him/her)
  lastAction: ParsedAction | null;   // for AGAIN (Task 3)
  lastUnknown: string | null;        // for OOPS (Task 3)
  history: Array<{ state: GameState; outputLength: number }>;  // for UNDO (Task 4)
}
export function newConversation(): Conversation;
/** Turns raw player input into the action to run, or a direct reply (Tasks 3–4 extend this). */
export type Step = { run: ParsedAction; viaAnswer?: boolean } | { reply: string[]; free?: boolean } | { parse: string };
export function interpret(input: string, conv: Conversation, world: World, state: GameState): Step;
/** After the engine ran an action: remember pronouns, questions, AGAIN. */
export function remember(conv: Conversation, action: ParsedAction, result: EngineResult, world: World): void;
export function resolvePronouns(action: ParsedAction, conv: Conversation): ParsedAction;
```

**Answering.** `interpret` with `pending`:
- **A `which`:** `fuzzyCandidates(input, pending.candidates labelled)`. Exactly one → `{ run: action with slot = id, viaAnswer: true }`. Several → `{ run: same action with slot = input }`, so the handler asks again with the narrower set. None → drop pending and `{ parse: input }`.
- **A `what`:** if `fallbackParse(input, world.verbs)` (strict, no bare-word) parses, drop pending and `{ parse: input }`. Otherwise `{ run: action with slot = input, viaAnswer: true }`.
- **No pending:** `{ parse: input }`. The store then does today's regex → engine → LLM flow, with `resolvePronouns` applied to target and indirect.

**Pronouns.** “it”, “them”, “that”, “this” → `conv.it`; “him”, “her” → `conv.him`. `remember` sets `it` when the resolved target is an item and `him` when it's an NPC, for both target and indirect. Resolving needs the resolved ids, so handlers return them: `EngineResult` gains `acted?: { target?: string; indirect?: string }`, set by the handlers that act on items or NPCs (take, drop, examine, use, put, give, talk, open, close, lock, unlock, read, search, switch, wear, smash, world verbs).

**Store flow** (`runCommand`):
1. `step = interpret(...)`.
2. `reply` → append. `run` → execute directly; never the LLM, if `viaAnswer`. `parse` → today's flow.
3. After any execute → `remember(...)`.

- [ ] **Step 1: Failing tests** (`tests/engine/conversation.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { interpret, newConversation, remember, resolvePronouns } from '@/engine/conversation';
import { fallbackParse } from '@/engine/parser';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

function say(conv: ReturnType<typeof newConversation>, state: ReturnType<typeof stateWith>, input: string) {
  const step = interpret(input, conv, world, state);
  if ('reply' in step) return step.reply;
  const action = 'run' in step ? step.run : resolvePronouns(fallbackParse(step.parse, world.verbs)!, conv);
  const r = execute(action, { world, state });
  remember(conv, action, r, world);
  return r.lines;
}

describe('answers', () => {
  it('a which-question takes an answer naming one candidate', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    expect(say(conv, s, 'take key')[0]).toContain('Which do you mean');
    say(conv, s, 'rusty');
    expect(s.locations.rusty_key).toBe('player');
    expect(conv.pending).toBeNull();
  });

  it('a command instead of an answer drops the question and runs', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    say(conv, s, 'take key');
    say(conv, s, 'east');
    expect(s.currentRoom).toBe('bedroom');
    expect(conv.pending).toBeNull();
  });

  it('a what-question takes the missing noun', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    expect(say(conv, s, 'take')).toEqual(['What do you want to take?']);
    say(conv, s, 'wallet');
    expect(s.locations.wallet).toBe('player');
  });

  it('an answer is marked so the store never sends it to the LLM', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    say(conv, s, 'take');
    expect(interpret('wallet', conv, world, s)).toMatchObject({ viaAnswer: true });
  });
});

describe('pronouns', () => {
  it('it follows things and her follows people, for both objects', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'yard', carrying: ['wallet'] });
    say(conv, s, 'examine neighbor');
    say(conv, s, 'examine wallet');
    say(conv, s, 'give it to her');
    expect(s.flags.paid).toBe(true);
  });
});
```

Store test (in `tests/stores/game.test.ts`): with the intent mock, `submit('take')`, then `submit('wallet')` in the living room. The wallet is taken, and `parseIntentRemote` (the mocked fetch) was not called for "wallet".

- [ ] **Step 2: Fail; Step 3: Implement; Step 4: Run everything; Step 5: Commit** `"The conversation layer: answers and pronoun slots"`.

---

### Task 3: AGAIN and OOPS

**Files:**
- Modify: `src/engine/conversation.ts`, `src/engine/parser.ts` (single words `again`, `g`; pattern `oops (\w+)`), `src/engine/verbs/meta.ts` (HELP), `server/src/llm.ts` (`again`, `oops`)
- Test: `tests/engine/conversation.test.ts`

`interpret`:
- **"again" / "g":**
  - `conv.lastAction` is null → `{ reply: ['Beg pardon?'] }`;
  - the last turn produced an `ask` → `{ reply: ['It’s difficult to repeat fragments.'] }`;
  - otherwise `{ run: conv.lastAction }`.
- **"oops word":**
  - `conv.lastUnknown` is null → `{ reply: ['There was no word to replace!'] }`;
  - otherwise replace the first word of `lastUnknown` that isn't a built-in word, a world-verb word, a direction, or a token of any item, NPC or exit name/alias with `word`, then `{ parse: corrected }`;
  - extra words after the first are dropped, with Zork's warning line first.

The store sets `conv.lastUnknown = input` when both the regex and the LLM fail (the `handleUnknown` path). It clears it on any understood command.

- [ ] **Step 1: Failing tests** (append):

```ts
describe('AGAIN and OOPS', () => {
  it('again repeats the last action; with nothing, or after a question, it says so', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'yard' });
    expect(say(conv, s, 'again')).toEqual(['Beg pardon?']);
    say(conv, s, 'ring bell');
    expect(say(conv, s, 'g')).toEqual(['Ding.']);
    say(conv, s, 'take');
    expect(say(conv, s, 'again')).toEqual(['It’s difficult to repeat fragments.']);
  });

  it('oops fixes the unknown word in the last line', () => {
    const conv = newConversation();
    const s = stateWith(world, { room: 'living' });
    conv.lastUnknown = 'take wallett';
    say(conv, s, 'oops wallet');
    expect(s.locations.wallet).toBe('player');
    expect(say(conv, s, 'oops wallet')).toEqual(['There was no word to replace!']);
  });
});
```

- [ ] **Step 2: Fail; Step 3: Implement (also the store's `lastUnknown` bookkeeping, with a store test: `submit('take wallett')` with the intent mock returning unknown, then `submit('oops wallet')`); Step 4: Run everything; Step 5: Commit** `"AGAIN and OOPS"`.

---

### Task 4: UNDO

**Files:**
- Modify: `src/engine/conversation.ts`, `src/stores/game.ts`, `src/engine/parser.ts` (`undo`), HELP, `ACTION_VOCAB`
- Test: `tests/stores/game.test.ts` (UNDO needs the output log, so test it at the store level)

Store:
- **Before** executing an action that might change state, push `{ state: structuredClone(game), outputLength: output.length }` onto `conv.history`.
- **After** the result, if `!result.mutated`, pop it again, so only changing turns are kept.
- **Cap** the history at 50.
- **"undo":** pop, restore `game` and truncate `output` to the length, then append “Undone.” (infocom) or “[Previous turn undone.]” (brass). Empty → “[Nothing to undo.]”. UNDO doesn't push.
- **RESTART** clears the history.

- [ ] **Step 1: Failing store tests**

```ts
it('undo steps back through changing turns, restoring state and screen', async () => {
  const store = freshStore(); store.initialize();
  const start = store.output.length;
  await store.submit('west');
  await store.submit('take wallet');
  await store.submit('look');            // doesn't change anything: not an undo step
  await store.submit('undo');
  expect(store.game.locations.wallet).toBe('living');
  await store.submit('undo');
  expect(store.game.currentRoom).toBe('bedroom');
  expect(store.output.length).toBe(start + 1);   // everything after the start is gone except the reply
  expect(store.output.at(-1)!.text).toBe('[Previous turn undone.]');
  await store.submit('undo');
  expect(store.output.at(-1)!.text).toBe('[Nothing to undo.]');
});

it('keeps at most 50 undo steps, and RESTART clears them', async () => {
  const store = freshStore(); store.initialize();
  for (let i = 0; i < 60; i++) await store.submit(i % 2 ? 'east' : 'west');
  for (let i = 0; i < 50; i++) await store.submit('undo');
  expect(store.output.at(-1)!.text).toBe('[Previous turn undone.]');
  await store.submit('undo');
  expect(store.output.at(-1)!.text).toBe('[Nothing to undo.]');
  await store.submit('west');
  await store.submit('restart');
  await store.submit('undo');
  expect(store.output.at(-1)!.text).toBe('[Nothing to undo.]');
});
```

- [ ] **Step 2: Fail; Step 3: Implement; Step 4: Run everything; Step 5: Commit** `"UNDO"`.

---

### Task 5: ALL and ALL EXCEPT

**Files:**
- Create: `src/engine/verbs/all.ts`, `tests/engine/all.test.ts`
- Modify: `src/engine/parser.ts` (`all|everything` with `but|except` lists for take, drop and put), `src/types/game.ts` (`ParsedAction.except?: string[]`), `src/engine/engine.ts` dispatch, `src/engine/verbs/objects.ts` (remove the old TAKE ALL branch)

`expandAll(action, world, state): string[]` lists the item ids, then each is run through `withRules(verb, …)` and its lines are prefixed `"<name>: "`:
- **TAKE:** visible items not carried, portable, reachable;
- **DROP:** carried;
- **PUT:** carried, minus the destination.

EXCEPT names are resolved with `fuzzyCandidates` over the list; unmatched EXCEPT words are ignored. An empty list → “There is nothing here to take.” / “You aren’t carrying anything to drop.” / “You aren’t carrying anything to put there.”.

In infocom style an item's own reply drops the name ("Taken."), so the line reads “leaflet: Taken.”. In brass style the reply is “Taken: leaflet.”, so the prefixed form uses the short reply: give handlers a `short` variant via `world.style`, or strip the `: name.` suffix when prefixing.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('ALL and EXCEPT', () => {
  it('parses', () => {
    expect(fallbackParse('take all but the wallet and shirt')).toEqual({ action: 'take', target: 'all', except: ['wallet', 'shirt'] });
    expect(fallbackParse('drop everything')).toEqual({ action: 'drop', target: 'all' });
    expect(fallbackParse('put all in chest')).toEqual({ action: 'put', target: 'all', indirect: 'chest', prep: 'in' });
  });

  it('takes everything here except what’s excepted, one line each', () => {
    const s = stateWith(world, { room: 'living' });
    const r = execute(fallbackParse('take all except wallet')!, { world, state: s });
    expect(r.lines.some((l) => l.startsWith('brass key: '))).toBe(true);
    expect(s.locations.wallet).toBe('living');
    expect(s.locations.shirt).toBe('player');
  });

  it('an except word that matches nothing is ignored, and nothing is taken twice', () => {
    const s = stateWith(world, { room: 'living' });
    execute(fallbackParse('take all but trombone')!, { world, state: s });
    expect(['key', 'wallet', 'shirt'].every((id) => s.locations[id] === 'player')).toBe(true);
  });

  it('drops all, puts all, and says when there’s nothing', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['wallet', 'key'] });
    execute(fallbackParse('drop all')!, { world, state: s });
    expect(s.locations.wallet).toBe('yard');
    expect(execute(fallbackParse('drop all')!, { world, state: s }).lines).toEqual(['You aren’t carrying anything to drop.']);
  });
});
```

- [ ] **Step 2: Fail; Step 3: Implement; Step 4: Run everything (tests that used the old TAKE ALL output adapt to the prefixed lines); Step 5: Commit** `"ALL and ALL EXCEPT"`.

---

### Task 6: Named saves

**Files:**
- Modify: `src/stores/game.ts`, `src/services/persistence.ts` (named keys and listing), `src/engine/conversation.ts` (`kind: 'save' | 'restore'` pending), the parser (`save (.+)`, `restore (.+)`, `restore`), HELP, `ACTION_VOCAB`
- Test: `tests/stores/game.test.ts`, `tests/services/persistence.test.ts`

**Persistence.** Add `saveNamed(name, state, output)`, `loadNamed(name): unknown`, and `listNamed(): string[]` (sorted), stored under `${key}:${name}`, where `key` is the cartridge's save key. Keep `save`/`loadRaw` for the autosave.

**Names:** `sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9 _-]/g, '').trim().slice(0, 32)`.

**Store:**
- **SAVE *name*** → saved; reply “Saved as *name*.”.
- **SAVE** alone → the save prompt “Save as? Type a name, or CANCEL.”, with `pending = { kind: 'save' }`. The answer gets sanitized; an empty result re-prompts; CANCEL → “[Cancelled.]”.
- **RESTORE *name*** → loads through `migrateSave`, replies “Restored *name*.”, then the room description.
- **RESTORE** alone → “Restore which save? a, b. Or CANCEL.”, or “[There are no saved games yet.]”.
- **Unknown name** → “[There’s no save called “x”.]”.
- **Unchanged:** SAVE with storage unavailable says so; LOAD (the autosave) and RESTART stay as they are. The old exact-match meta commands `save` and `load` move into this flow.

- [ ] **Step 1: Failing store tests**

```ts
it('saves and restores by name, and lists saves', async () => {
  const store = freshStore(); store.initialize();
  await store.submit('west');
  await store.submit('save before shed');
  expect(store.output.at(-1)!.text).toBe('Saved as before shed.');
  await store.submit('east');
  await store.submit('restore');
  expect(store.output.at(-1)!.text).toBe('Restore which save? before shed. Or CANCEL.');
  await store.submit('before shed');
  expect(store.game.currentRoom).toBe('living');
});

it('a name that sanitizes to nothing asks again; cancel backs out', async () => {
  const store = freshStore(); store.initialize();
  await store.submit('save');
  await store.submit('!!!');
  expect(store.output.at(-1)!.text).toBe('Save as? Type a name, or CANCEL.');
  await store.submit('cancel');
  expect(store.output.at(-1)!.text).toBe('[Cancelled.]');
});
```

- [ ] **Step 2: Fail; Step 3: Implement; Step 4: Run everything; Step 5: Commit** `"Named saves"`.

---

### Task 7: The status line, SCRIPT, VERSION, and moves as turns

**Files:**
- Modify: `src/types/world.ts` (`statusLine?: 'moves' | 'score'`, `title?`, `credits?: string[]`), `src/engine/engine.ts` (`moveCount` += 1 per acted-on turn; script and version), `src/engine/verbs/movement.ts` (stop incrementing `moveCount`), `src/engine/result.ts` (`script?: 'start' | 'stop'`), `src/stores/session.ts` (status), `src/stores/game.ts` (`headerStatus` getter, script download), `src/components/Terminal.vue` (download), `src/worlds/zork1.ts` (`title`, `credits`)
- Test: `tests/engine/meta.test.ts` (new), `tests/stores/session.test.ts`, `tests/components/Terminal.test.ts`

**Status.** `headerStatus`:
- **infocom:** `${roomName}  Score: ${score}  Moves: ${turns}`;
- **brass:** `MOVES: ${moveCount}`, or `SCORE: n  MOVES: n` with `statusLine: 'score'`.

`session.status` uses it. Score comes from a shared `currentScore(world, state)` exported from `meta.ts`.

**Script.**
- **SCRIPT:** the result carries `script: 'start'`, and the store records `scriptFrom = output.length`.
- **UNSCRIPT, or SCRIPT while scripting:** `script: 'stop'`. The store builds the text from `output.slice(scriptFrom)` and calls an injectable `download(filename, text)`. The default creates a Blob link; tests mock it.
- **Replies:** brass “[Transcript started.]” and “[Transcript saved.]”. Infocom “Here begins a transcript of interaction with” followed by the title, then “Here ends a transcript of interaction with” followed by the title.

**VERSION:** `[appName vX.Y.Z]`, then `world.title`, then `world.credits` lines. The version comes from the store (`import.meta.env` / `package.json`, as the header gets it); the engine returns `version: true` and the store fills in the lines.

- [ ] **Step 1: Failing tests:**
  - `moveCount` counts acted-on turns, not room entries: two LOOKs make 2;
  - infocom status for Zork is `West of House  Score: 0  Moves: 0`;
  - SCRIPT/UNSCRIPT calls `download` with the lines between them;
  - VERSION lists the app name, the title and the credits.
- [ ] **Step 2: Fail; Step 3: Implement; Step 4: Run everything.** Tests asserting `moveCount` after moves adjust (e.g. "MOVES: 1" after one move still holds; LOOK now counts). **Step 5: Commit** `"Status line, SCRIPT, VERSION; moves count turns"`.

---

### Task 8: Housekeeping from the stage 2 review

Each item gets a failing test first.

1. **SUPERBRIEF shows names only:** no contents on entry; `describeRoom` gets a `namesOnly` option for superbrief.
2. **Rescheduling a pending fuse** restarts its count as a fresh schedule would. In `effects.ts` `schedule`, also remove the key from the turn's "existing" set. Have `afterTurn` treat a fuse whose count was set this turn as new: track `scheduledThisTurn` in a WeakMap per state, as `halted` does.
3. **Effects naming things that don't exist change nothing:** `move` of an unknown item, `open`/`close`/`lock`/`unlock`/`switch` of an unknown item, `run`/`schedule` of an unknown event.
4. **The audit** also checks rule `then` event keys (items' and rooms' `instead`, `after`, `onUse`, `onTake`, `onWear`, `onSmash`, NPCs' `onGive`), `onEnter` triggers, the finale's event, epilogue and footer, and every condition string. A condition check is: known kind (`flag`, `has`, `in`, `visited`, `inside`, `open`, `locked`, `on`, `here`, `lit`, `var`, `carrying`), and items and rooms that exist.
5. **A dark room's intent context** has no `roomName` content (send `'darkness'`) and no NPCs.

Commit `"Housekeeping: superbrief, fuse resets, safe effects, a stricter audit, dark context"`.

---

### Task 9: Differential walkthrough for stage 3

Extend `WALKTHROUGH` with unique commands whose replies Zork gives:
- in the living room, with the lamp and sword: `take` → “What do you want to take?” / `the sword`;
- an ambiguous noun: carry the nasty knife and the sword, then `drop blade` → “Which blade do you mean, the sword or the nasty knife?” / `knife`;
- `again` after a repeatable command (`examine case`, then `g`);
- a typo: `examine lanturn` → “I don't know the word "lanturn".” in Zork; native's miss reply differs, so the typo command is **allowlisted with a reason** (unknown-word replies differ by design: native asks the LLM), but `oops lantern` that follows must match;
- `take all` and `drop all` in a room with several items: the per-item lines.

Run the diff, fix the world, the engine's infocom style, or the walkthrough until it passes. Only the unknown-word reply may be allowlisted.

Commit `"Differential test: the parser"`.

---

### Task 10: Docs, the version in the docs site, changelog

- **The docs site shows the version.** In `docs/.vitepress/config.mts`, read `package.json`'s version:

  ```ts
  import pkg from '../../package.json' with { type: 'json' };
  ```

  - add a nav item `{ text: \`v${pkg.version}\`, link: 'https://github.com/mrballistic/brass-lantern/blob/main/CHANGELOG.md' }`;
  - footer message `Brass Lantern v${pkg.version} · Released under the MIT License.`.

  Verify both in `npm run docs:build` output (grep the built HTML for the version).
- **commands:** questions, AGAIN/G, OOPS, UNDO, ALL/EXCEPT, SAVE/RESTORE *name*, SCRIPT/UNSCRIPT, VERSION.
- **how-it-works:** the conversation layer in the keystroke-to-reply flow.
- **world-schema:** `statusLine`, `title`, `credits`.
- **porting-zork:** ORPHAN/WHICH-PRINT → questions, OOPS/AGAIN.
- **CHANGELOG `## 1.6.0`;** bump both package.json files.

Checks: docs build, full suite with coverage, server. Commit `"1.6.0: docs for the parser; the version in the docs"`. Push and open the PR after Task 11 and the final review.

---

### Task 11: Office Space

- Sync (`scripts/sync-from-public.sh`) on a new branch.
- **Expected visible changes:** the questions' wording, MOVES counting turns, and the new commands. Update Office Space tests that assert "X what?" or move counts after LOOKs, and nothing else.
- Bump to 1.6.0, add a CHANGELOG entry, open a PR. After the final review and CI: merge both repos, tag `v1.6.0`, and verify the live site (boots; a save resumes; `take` asks what; `undo` works).

---

## Self-review notes

- **Spec coverage:**

  | Spec area | Task |
  |---|---|
  | Ties | 1 |
  | Questions | 1 |
  | Answering | 2 |
  | Pronouns | 2 |
  | AGAIN/OOPS | 3 |
  | UNDO | 4 |
  | ALL/EXCEPT | 5 |
  | Named saves | 6 |
  | Status line, SCRIPT, VERSION, moves | 7 |
  | Housekeeping | 8 |
  | Differential | 9 |
  | Docs | 10 |
  | The docs version (owner's request) | 10 |
  | Office Space | 11 |

- **Deviation from the spec, with a ruling:** the typo command in the walkthrough is allowlisted. Native sends unknown words to the LLM instead of saying "I don't know the word", by design.
- **Type consistency:** `Ask`, `resolveItem`, `fuzzyCandidates`, `Conversation`, `interpret`, `remember` and `resolvePronouns` are used under the same names throughout.
