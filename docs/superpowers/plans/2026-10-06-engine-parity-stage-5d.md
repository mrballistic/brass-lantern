# Engine parity, stage 5d Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One generic condition (`score<op>N`); native Zork I gains the Mountains, winning at 350 and the Stone Barrow ending; the thief's arrival rate is measured against the original; the whole 350-point game runs natively and is compared with zork1.z3 chapter by chapter.

**Architecture:** One engine task (the condition, with the score moved to its own module so conditions can read it). One content task (Mountains, the win daemon, the map, West of House, the barrow, the ending). Then the proof: a thief-frequency test and the unparked diff walkthrough; the full game natively; the chaptered differential on a generalized session harness. Docs and the Office Space sync close it.

**Tech Stack:** TypeScript 6, Vue 3/Pinia, Vitest 5, ifvms (tests only), Express intent server.

**Spec:** `docs/superpowers/specs/2026-10-06-engine-parity-stage-5d-design.md`. ZIL: `/tmp/zork1-src` (clone `https://github.com/historicalsource/zork1` there if missing). Story: `tests/fixtures/zork1.z3`.

## Global Constraints

- The engine never branches on a world's IDs. World scripts may.
- An engine miss never mutates state. Scripts run only where events run. A capture that declines changes nothing.
- The LLM only classifies.
- Conditions only in `src/engine/conditions.ts`; fuzzy matching only in `src/engine/fuzzy.ts`.
- Randomness only from the seeded generator in the game state.
- Existing worlds keep working; Office Space syncs with no world changes and no player-visible change.
- Saves stay format 2.0; new state fields, if any, are optional.
- Curly quotes in player-facing text. Coverage: 80% lines, functions and statements; 75% branches.
- When zork1.z3 disagrees with the ZIL source, the story file wins.
- Tests run in the node environment; DOM-using files start with `// @vitest-environment happy-dom` (session and differential tests need it).
- Long tests (more than ~2 minutes) run only when `ZORK_LONG=1`; CI sets it (`.github/workflows/ci.yml`), and the docs say so.

## Tools carried over

- `tests/worlds/zsession.ts`: `prefixed(side, commands, seed)` (PREFIX, or `@prefix:<name>` from `PREFIXES`), `findSeed(side, commands, accept?, tries?)`, `compare`, `normalize`, `THIEF`, `openOriginal(seed)`, `openNative(seed)`.
- `tests/zz/seeds.test.ts`, `tests/zz/route.test.ts` (env `C=cmd,cmd,…` prints both sides), `tests/zz/peek3.test.ts` — untracked, in `.git/info/exclude`.
- Session tables in `tests/worlds/zork1-sessions.ts`; `GROUPS`/`SEEDS` in `zork1-sessions.test.ts`.

Run suites with `npx vitest run --exclude "tests/zz/**"`.

## Review Focus

1. The win fires once: reaching 350, taking a treasure out of the case and putting it back doesn't repeat the whisper; dying after winning keeps `won` and the path. (Task 2 unit test.)
2. Southwest (and IN) from West of House before winning answers “You can't go that way.”; after winning they lead to the barrow. (Task 2 unit test + session `barrow-closed`.)
3. After the barrow ending, only RESTART and the allowed meta commands work; RESTORE of a save from before the ending plays on. (Task 2 store test.)
4. `score<op>N` is the same number SCORE prints (including `vars.score`), in both styles; `score>=x` is an audit problem; a `scoring` entry that itself uses `score` is an audit problem (it would recurse). (Task 1 tests.)
5. The chaptered differential never passes vacuously: a chapter whose seed search fails or falls back to line sets is reported by name, and the native full game asserts 350 and the ending, not just "no exception". (Task 5 harness test.)

---

### Task 1: `score<op>N`

**Files:**
- Create: `src/engine/score.ts` (`currentScore` moves here from `src/engine/verbs/meta.ts`; meta re-exports it so imports keep working)
- Modify: `src/engine/conditions.ts`, `src/engine/verbs/meta.ts`, `tests/helpers/audit.ts` (if the scoring-recursion check lives in the audit helper rather than `conditionProblems`), `docs/reference/conditions-and-events.md`
- Test: `tests/engine/conditions.test.ts`

**Interfaces:**
- Produces: `currentScore(world, state): number` in `src/engine/score.ts`; condition form `score<op>N`.

- [ ] **Step 1: Write the failing test** (append to `tests/engine/conditions.test.ts`):

```ts
describe('score<op>N (5d)', () => {
  it('is the score SCORE prints, vars.score included', () => {
    const w: World = { ...fixtureWorld, scoring: [{ flag: 'a', points: 10 }, { if: 'flag:b', points: 5 }] };
    const s = stateWith(w, { room: 'bedroom' });
    expect(evaluateCondition('score=0', s, w)).toBe(true);
    s.flags.a = true;
    s.flags.b = true;
    s.vars = { ...s.vars, score: 3 };
    expect(evaluateCondition('score>=18', s, w)).toBe(true);
    expect(evaluateCondition('score>18', s, w)).toBe(false);
    expect(evaluateCondition('!score<18', s, w)).toBe(true);
  });
  it('the audit knows the form and catches a malformed one', () => {
    expect(conditionProblems('score>=350', fixtureWorld)).toEqual([]);
    expect(conditionProblems('score>=x', fixtureWorld)).not.toEqual([]);
  });
});
```

And in the audit test (`tests/worlds/audit.test.ts`, the “catches the mistakes it's for” case), a world whose `scoring` has `{ if: 'score>=1', points: 1 }` reports a problem mentioning `score`.

- [ ] **Step 2: Run** — `npx vitest run tests/engine/conditions.test.ts tests/worlds/audit.test.ts -t "score|mistakes"`. Expected: FAIL.
- [ ] **Step 3: Implement:** move `currentScore` to `src/engine/score.ts` (it imports `evaluateCondition` from `./conditions`; `conditions.ts` imports `currentScore` from `./score` — a function-level cycle, safe in ESM because neither runs at import time); `meta.ts` does `export { currentScore } from '../score'`. In `conditions.ts` extend the compare form to `(carrying|heaviest|score)`, computing `score` as `world ? currentScore(world, state) : 0`, and accept it in `conditionProblems`. In the audit, flag any `scoring[].if` containing `score` (“a scoring condition can't use the score”).
- [ ] **Step 4: Run** — same command. Expected: PASS. Then the full suite.
- [ ] **Step 5: Docs** — conditions-and-events: `score<op>N` (“the score, as SCORE reports it; not usable inside `scoring` itself”).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "score<op>N: the score as a condition"`

---

### Task 2: The Mountains, winning, and the Stone Barrow

**Files:**
- Modify: `src/worlds/zork1.ts`, `tests/worlds/zork1.test.ts`, `tests/worlds/zork1-store.test.ts`, `tests/worlds/zork1-sessions.ts` + `.test.ts`

**Interfaces:**
- Consumes: Task 1's `score>=350`.
- Produces: rooms `mountains`, `stone_barrow`; items `mountain_range`, `map` (in `trophy_case`, hidden), `barrow_door`, `barrow`; flag `won`; daemon on `score>=350 & !flag:won`; event `won`; ending `barrow` in `endings`; West of House `descriptions` + exits `southwest`/`in` with `if: 'flag:won'`.

- [ ] **Step 1: Transcribe from ZIL:** MOUNTAINS and MOUNTAIN-RANGE-F (1dungeon/1actions); SCORE-UPD's win branch (gverbs 1851–1862: `won`, reveal MAP, unvisit West of House, the whisper with curly quotes); MAP (FDESC, TEXT, size 2); WEST-HOUSE (the secret-path sentence); STONE-BARROW, BARROW-DOOR-FCN, BARROW-FCN, STONE-BARROW-FCN (M-BEG on ENTER, WALK west/in, THROUGH barrow: “Inside the Barrow” + the text; Release 119's flags byte picks the trilogy text — check which the story file prints by reaching it in Task 5, and use the ZIL's trilogy branch until then). Story order: `mountains` and `stone_barrow` sit where `tests/helpers/zobjects.ts` says (the rooms test enforces it).
- [ ] **Step 2: Write failing tests** in `tests/worlds/zork1.test.ts` (`describe('Zork I, natively: the end (5d)')`):
  - the Mountains: from `forest_2` `east` arrives; `up`/`east` there: “The mountains are impassable.”; `climb mountain`: “Don't you believe me? The mountains are impassable!”
  - before winning, from `west_of_house`, `southwest` and `in` answer “You can't go that way.” and stay put (Review Focus 2).
  - winning: set flags/locations so `currentScore` is 349 with one treasure short, put it in the case (`execute put … in trophy case`), and assert the reply ends with the whisper, `flags.won`, the map visible in the case, and West of House's description includes the secret path; take the treasure out and put it back: no second whisper (Review Focus 1). Then `die` via an event and check `won` survives.
  - the barrow: with `won`, `southwest` → Stone Barrow; `open door`: “The door is too heavy.”; `west` prints “Inside the Barrow” and ends the game (`state.gameOver`), with the score line.
  - a store test in `zork1-store.test.ts` (Review Focus 3): save before entering, enter (game over), `look` gets the game-over line, `restore` plays on.
  - a session `barrow-closed` in a new `END_SESSIONS` table: from PREFIX's end walk back to West of House is not possible (the trap door) — so instead a session from the start: `@prefix:` a new `surface` opening that stops before the cellar (add to `PREFIXES`: PREFIX's first nine commands), then `west`, `west`… to West of House, `southwest`, `in`, `look`, and the Mountains (`north`, … `east` from Forest 2, `look`, `up`, `climb mountains`). Pin seeds.
- [ ] **Step 3: Run** — `npx vitest run tests/worlds/zork1.test.ts tests/worlds/zork1-store.test.ts -t "5d|end"` and the session. Expected: FAIL.
- [ ] **Step 4: Implement** Step 1.
- [ ] **Step 5: Run** — `npx vitest run tests/worlds`. Expected: PASS (re-pin seeds the new rooms shift; ledger each).
- [ ] **Step 6: Commit** — `Zork I: the Mountains, winning, and the Stone Barrow`

---

### Task 3: The thief's timing

**Files:**
- Create: `tests/worlds/zork1-thief-timing.test.ts`
- Modify: `tests/worlds/zork1-diff.test.ts` (unpark), `.github/workflows/ci.yml` (`ZORK_LONG: 1` on the frontend test step), `vitest` config only if a longer timeout is needed

**Interfaces:**
- Consumes: `openOriginal`, `openNative`, `THIEF`, `normalize` from zsession.
- Produces: `firstThief(side, seed, room, limit): Promise<number | null>` (turns until his first line, null if none within `limit`), local to the test file.

- [ ] **Step 1: Write the test** (`describe.skipIf(!process.env.ZORK_LONG)`):

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { openNative, openOriginal, PREFIX, THIEF } from './zsession';

/** PREFIX, then WAITs in the Round Room; the turn his first line shows, or null within `limit`. */
async function firstThief(side: 'native' | 'original', seed: number, limit: number): Promise<number | null> {
  const game = side === 'original' ? await openOriginal(seed) : openNative(seed);
  for (const c of PREFIX.filter((c) => c !== '@fight')) await game.send(c);
  // (fight the troll as prefixed() does; reuse its loop — extract it from zsession as `fightTroll(send)` if needed)
  for (let t = 1; t <= limit; t++) if (THIEF.test((await game.send('wait')).join(' '))) return t;
  return null;
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe.skipIf(!process.env.ZORK_LONG)('the thief turns up as often as in the original (5d)', () => {
  it('first-arrival medians agree within 25%', async () => {
    const runs = async (side: 'native' | 'original') => {
      const out: number[] = [];
      for (let seed = 1; seed <= 40; seed++) {
        const t = await firstThief(side, seed, 200);
        if (t !== null) out.push(t);
      }
      return out;
    };
    const [n, o] = [await runs('native'), await runs('original')];
    expect(n.length).toBeGreaterThan(20);
    expect(o.length).toBeGreaterThan(20);
    expect(Math.abs(median(n) - median(o)) / median(o)).toBeLessThanOrEqual(0.25);
  }, 1_800_000);
});
```

(The troll must be dead first: extract `prefixed`'s fight loop into an exported `playPrefix(send, opening)` in zsession and use it here; keep `prefixed` calling it.)
- [ ] **Step 2: Run** — `ZORK_LONG=1 npx vitest run tests/worlds/zork1-thief-timing.test.ts`. Read both medians (log them). Expected: PASS if 5a–5c converged him; if not, find the cause (route, SACRED/water skips, I-THIEF's probabilities) and fix it in `src/worlds/zork1.ts` with a unit test in `zork1-thief-unit.test.ts`. If the measured spread needs a different tolerance, ledger it with the numbers.
- [ ] **Step 3: Unpark** the diff walkthrough (`zork1-diff.test.ts` line ~97: drop `state.npcs = { thief: { room: null } }`; `nativeOnce` already returns null when he shows; make `native()` try seeds like `original()` does). Run `npx vitest run tests/worlds/zork1-diff.test.ts`. Expected: PASS; update its comment (lines ~94–96).
- [ ] **Step 4: CI** — add `ZORK_LONG: 1` to the frontend test step's `env`; run `actionlint` if installed.
- [ ] **Step 5: Commit** — `The thief's timing, measured; the walkthrough lets him roam`

---

### Task 4: The full game, natively

**Files:**
- Create: `tests/worlds/zork1-full.ts` (the walkthrough as `CHAPTERS: Array<{ name: string; commands: string[]; thief?: boolean }>`), `tests/worlds/zork1-full.test.ts`
- Modify: `tests/worlds/zsession.ts` (generalize `@fight` to `@fight <character>`), `src/worlds/zork1.ts` and engine files only for differences the game exposes (each with a unit test and a ledgered ruling; backlog items it hits get struck in `docs/superpowers/backlog.md`)

**Interfaces:**
- Consumes: Task 2's ending; `openNative(seed)`.
- Produces: `CHAPTERS`; `@fight <character>` handled by `playCommands(send, commands)` in zsession (attack with the held weapon until the foe's death line, at most 15 tries; returns null if the player dies).

- [ ] **Step 1: Write the chapters** — a standard 350-point solution for Release 119, built from the 5a–5c session routes (the dam, the Loud Room's echo, the temple and the exorcism, the boat and the river, the rainbow, the mine) plus the 4a/4b slices (the house, the troll, the maze and its skeleton, the cyclops by ULYSSES, the thief's lair). Chapters, in order:
  1. `house` — the leaflet, the sack, the bottle, the lamp, the sword, the rug and the trap door, the painting from the Gallery (via the chasm), the egg from the tree (given to the thief later).
  2. `troll-maze` — `@fight troll`; the maze to the skeleton (the bag of coins, the skeleton key), the grating, the cyclops (`ulysses`), the Treasure Room path.
  3. `dam` — the matchbook, the wrench and the screwdriver, the gates, the platinum bar (Loud Room echo), the trident from Atlantis via the low-tide reservoir, the trunk of jewels.
  4. `temple` — the torch, the bell, the candles and the book, the exorcism, the crystal skull, the gold coffin and the sceptre.
  5. `river` — the boat, the river to the Shore, the scarab, the buoy's emerald, the rainbow and the pot of gold.
  6. `mine` — the jade, the bracelet, the coal, the diamond.
  7. `egg` (`thief: true`) — let the thief take the egg, `@fight thief` in his lair, the opened egg, the canary, the brass bauble (wind the canary in the forest).
  8. `case` — every treasure into the trophy case (deposits along the way are fine), `score` (350), `read map`, West of House, `southwest`, `west`.
  Verify each chapter on the original as it's written (`tests/zz/route.test.ts`), fixing the route, not the engine, when the original disagrees with the plan's guess.
- [ ] **Step 2: Write the native test** (`zork1-full.test.ts`): play all chapters from a seed (try seeds 1..N until one runs through; pin it), then assert: every treasure (`ctx.treasure(id) > 0` items) is in `trophy_case`, `currentScore === 350`, the replies contain the whisper, `read map`'s text, “Inside the Barrow”, and `state.gameOver`. This is Review Focus 5's native half.
- [ ] **Step 3: Run** — expected to FAIL at first on whatever the engine doesn't yet do; each difference is fixed generically or in Zork's data with its own unit test first.
- [ ] **Step 4: Run** — `npx vitest run tests/worlds/zork1-full.test.ts`. Expected: PASS. If it takes more than ~2 minutes, put it behind `ZORK_LONG`.
- [ ] **Step 5: Commit** — `The whole of Zork I, natively`

---

### Task 5: The full game against zork1.z3, by chapter

**Files:**
- Create: `tests/worlds/zork1-chapters.test.ts`
- Modify: `tests/worlds/zsession.ts` (`chapterRun`), `tests/worlds/zork1-allowlist.ts` only for documented differences

**Interfaces:**
- Consumes: `CHAPTERS`, `playCommands`.
- Produces: `chapterRun(side, k, seed): Promise<string[][] | null>` — replays chapters 1..k (fights synced), returns chapter k's replies; null if the player died, a fight didn't resolve, or the thief's line appeared in a chapter without `thief: true`. `CHAPTER_SEEDS: Record<string, { native: number; original: number } | 'lines'>`.

- [ ] **Step 1: Write the harness test first** (Review Focus 5): a unit test of `chapterRun`/the chapter loop on a two-chapter fake (`CHAPTERS` injected) proving that a chapter marked `'lines'` is listed in the test's report and that a null seed search fails the test with the chapter's name — no silent pass.
- [ ] **Step 2: Write the comparison** — for each chapter: if `CHAPTER_SEEDS[name]` is a seed pair, `compare(native, original, commands)` must be empty, with chapter `thief: true`'s thief lines compared as sets (filter `THIEF` lines out of both sides' replies and check every native thief line is one the original printed in that chapter); if `'lines'`, every native line in the chapter must be one the original prints in the same chapter (line-set comparison), and the test name says “(line sets)”.
- [ ] **Step 3: Pin seeds** — extend `tests/zz/seeds.test.ts` (or a sibling) to search `chapterRun` seeds per chapter (TRIES up to 300). Chapters with no agreeing pair get `'lines'`, ledgered with the reason (e.g. “the thief shows in every original run of chapter 3 within 300 seeds”).
- [ ] **Step 4: Run** — `ZORK_LONG=1 npx vitest run tests/worlds/zork1-chapters.test.ts`. Expected: PASS; any reply difference found here is fixed (unit test first) or allowlisted with a reason.
- [ ] **Step 5: Commit** — `The whole of Zork I against the original, chapter by chapter`

---

### Task 6: Docs and 1.12.0

**Files:**
- Modify: `docs/guide/porting-zork.md` (Zork I is complete: every room, 350 points; SCORE-UPD as a daemon on `score>=350`; FINISH as an `endings` entry; the full-game proof and which chapters, if any, use line sets; the thief's measured medians; `ZORK_LONG`; What's next: the Zork II/III survey, then the npm library), `docs/reference/conditions-and-events.md` (done in Task 1), `CHANGELOG.md` (1.12.0), `package.json` + `server/package.json` (1.12.0; lockfiles via `npm install --package-lock-only --ignore-scripts`), `docs/superpowers/backlog.md` (strike what shipped).

- [ ] Steps: docs, `npm run docs:build && npm run lint && npm run type-check && ZORK_LONG=1 npx vitest run --coverage --exclude "tests/zz/**" && (cd server && npm test)`, commit `1.12.0: docs`.

---

### Task 7: Office Space

- [ ] Sync with `scripts/sync-from-public.sh ../brass-lantern` on a new branch `engine-parity-stage-5d` (tree clean); its tests pass unchanged. Re-run the 5c before/after probe (CLIMB/TALK phrasings in every room) plus SCORE in a few rooms in a throwaway `tests/zz/` test, deleted after. Bump to 1.12.0 with a CHANGELOG entry; lint, type-check, coverage, build, server tests; commit, push, PR on both repos. After the final review and CI, with the owner's go-ahead: merge both, tag `v1.12.0` on each, publish the brass-lantern release, check the live site.

---

## Self-review notes

- **Spec coverage:** `score<op>N` → 1; Mountains, winning, map, West of House, barrow, ending → 2; full game natively → 4; chaptered differential → 5; thief frequency + unpark → 3; cost/`ZORK_LONG` → 3, 4, 5, 6; docs/release → 6, 7; edge cases → Review Focus, pinned in 1, 2, 5.
- **Deferred to execution with rulings:** the exact walkthrough commands (verified chapter by chapter on the original), seeds, the barrow's closing text variant, the thief tolerance once measured, which chapters (if any) fall back to line sets.
- **Type consistency:** `currentScore` (now in `src/engine/score.ts`), `CHAPTERS`, `CHAPTER_SEEDS`, `chapterRun`, `playCommands`, `playPrefix`, `firstThief`, `ZORK_LONG` are used under these names throughout.
