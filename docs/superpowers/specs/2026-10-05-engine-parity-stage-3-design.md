# Engine parity, stage 3: parser parity

**Status:** approved in conversation 2026-10-05; this document awaits review.
**Repo:** brass-lantern (shared with the private Office Space repo).
**Builds on:** [stage 1](./2026-10-05-engine-parity-stage-1-design.md), which has the roadmap and the decisions for the whole effort, and [stage 2](./2026-10-05-engine-parity-stage-2-design.md).

## Decisions made while brainstorming

- **Many undos, named saves.** UNDO steps back up to 50 turns per session. SAVE and RESTORE take names, with a list to choose from.
- **A pure conversation layer.** Everything that lives *between* commands moves into `src/engine/conversation.ts`, a plain object the store holds:
  - a pending question;
  - the last command, for AGAIN;
  - the last unknown word, for OOPS;
  - the undo history.

  It's testable without Pinia or the UI, and the store stays thin.
- **Zork's wording in Infocom style, plain wording in brass.**

## Invariants (unchanged)

- The engine never branches on a world's IDs.
- **An engine miss never mutates state.** A question is an understood, non-mutating result.
- The LLM only classifies. A pending question is resolved **before** the intent server is consulted.
- Conditions are parsed only in `src/engine/conditions.ts`. Fuzzy matching only in `src/engine/fuzzy.ts`.
- Existing worlds keep working. Office Space's playthroughs pass, with only the visible improvements listed under Compatibility.
- Saves stay format 2.0; new state fields are optional.
- Curly quotes in player-facing text.
- Coverage: 80% lines, functions and statements; 75% branches.

## 1. Questions back to the player

### Ties

`fuzzy.ts` gains:

```ts
export function fuzzyCandidates(input: string, candidates: Array<{ id: string; name: string }>): string[];
```

It returns every candidate that ties for the best tier: exact ID, then exact name, then substring, then the best token-prefix score. `fuzzyMatch` stays, returning the first of them.

`model.ts` `matchItem` becomes `resolveItem(target, ids, world): { id } | { ambiguous: string[] } | null`. Every handler that resolves an item uses it.

### The question result

```ts
// result.ts
interface EngineResult {
  …
  ask?: { kind: 'which'; slot: 'target' | 'indirect'; candidates: string[]; action: ParsedAction }
      | { kind: 'what'; slot: 'target' | 'indirect'; action: ParsedAction };
}
```

**`which`:** when the target or indirect object is ambiguous, the handler returns `ask` with the candidates.
- Printed in Infocom style as “Which knife do you mean, the nasty knife or the rusty knife?”, Zork's WHICH-PRINT. The noun is the word the player typed, and the list reads “the A or the B”, or “the A, the B, or the C”.
- Printed in brass style as “Which do you mean: the nasty knife or the rusty knife?”.

**`what`:** when a verb that needs an object has none, the result is “What do you want to take?” in both styles. It replaces today's “Take what?” and its siblings. For a missing indirect object: “What do you want to unlock the chest with?” (verb, object, preposition).

**Both kinds** are understood, change nothing, and take no game time (`free`).

### Answering (`conversation.ts`)

`Conversation.pending` holds the last `ask`. On the next input:
- **A `which`:**
  - if the input fuzzy-matches exactly one of the candidates ("nasty", "the nasty one", "knife" when only one is still visible), run `action` with that slot filled;
  - if it's still ambiguous among them, ask again with the narrower list.
- **A `what`:** if the input doesn't parse as a command of its own, it's taken as the missing noun phrase and `action` runs with the slot filled.
- **Otherwise** (the input is a command in its own right), the question is dropped and the input runs normally.
- **An answer is never sent to the intent server.** If the filled-in action misses, that miss is the reply.

### Pronouns

- **Two slots:** “it”, “them” and “that” follow the last item acted on; “him” and “her” follow the last person.
- **Both objects resolve:** pronouns work for the target and the indirect object (“give it to her”).
- **Where:** the slots live in `Conversation`. The store's old `lastTarget` goes away.

## 2. AGAIN, OOPS, UNDO, ALL, and saves

### AGAIN / G

- Repeats the last **executed** action (resolved, so pronouns mean the same thing).
- Nothing to repeat: “Beg pardon?”.
- The last turn asked a question: “It’s difficult to repeat fragments.”.

### OOPS

- `Conversation.lastUnknown` remembers the input that nobody understood: the parser failed and so did the intent server.
- `OOPS word` replaces the first word of that input that matched nothing in the world (not a verb, item, NPC, exit or direction), then runs the corrected line.
- Nothing to fix: “There was no word to replace!”. More than one word after OOPS: Zork's “Warning: only the first word after OOPS is used.”, then it proceeds.

### UNDO

- **The history:** before every command that changes something, `Conversation` pushes a snapshot (a structured clone of `GameState`, plus the output length). It keeps the last 50.
- **UNDO** pops one, restores the state, trims the output back, and adds “Undone.” (infocom) or “[Previous turn undone.]” (brass).
- **Free:** UNDO takes no game time. With nothing left to undo: “[Nothing to undo.]” (both styles; Zork I has no UNDO).
- **Per session:** snapshots are memory-only. A reload starts a fresh history, and saves don't carry them.
- **Restart:** RESTART clears the history.

### ALL and ALL EXCEPT

- **Forms:**
  - TAKE ALL;
  - DROP ALL;
  - PUT ALL IN/ON *X*;
  - every one of these with **BUT/EXCEPT *a* [AND *b*]**.
- **What ALL covers:**
  - TAKE ALL takes the portable things in reach, not carried, and not inside something carried;
  - DROP ALL drops everything carried;
  - PUT ALL puts every carried thing except the destination itself.
- **Output:** one line per item, prefixed with its name: “leaflet: Taken.” (infocom; Zork capitalizes nothing). Brass uses “lamp: Taken: lamp.” trimmed to “lamp: Taken.”.
- **Nothing applies:** “There is nothing here to take.” (or to drop or put).
- **Parsing:** the parser yields `{ action, target: 'all', except?: string[] }`. `ParsedAction` gains `except?: string[]`.

### Named saves

- **SAVE *name*** stores the game under `<prefix>:save:<cartridge id>:<name>` and replies “Saved as *name*.”.
- **Plain SAVE** asks “Save as? Type a name, or CANCEL.” through the question mechanism, with a `kind: 'save'` pending entry.
- **RESTORE *name*** loads it.
- **Plain RESTORE** lists the saves (“Restore which save? before-troll, cellar. Or CANCEL.”) and takes the answer.
- **CANCEL** backs out.
- **Names** are trimmed, lowercased, at most 32 characters of `[a-z0-9 _-]`, with other characters removed.
- **Unchanged:** LOAD (the autosave), RESTART and the autosave keep their behavior.
- **Where:** saves are handled in the store, which owns persistence, with the prompting through `Conversation`.

## 3. Status line, transcripts, version, testing and housekeeping

### The status line

- **Infocom style:** the header shows the room name on the left and “Score: 15  Moves: 40” on the right (Zork's v3 status line), like the Z-machine cartridges.
- **Brass style:** “MOVES: n” stays. A world can set `statusLine: 'score'` to show “SCORE: n  MOVES: n”.
- **What counts:** MOVES becomes the turn counter (commands the engine acted on, not free ones) in both styles. It no longer counts room entries. `moveCount` stays in state for saves and the finale's score line, which switches to turns as well.

### SCRIPT, UNSCRIPT, VERSION

- **SCRIPT / UNSCRIPT:** the engine returns `{ script: 'start' | 'stop' }`.
  - **SCRIPT** starts a transcript: the terminal remembers the output index.
  - **UNSCRIPT**, or SCRIPT again, downloads the text since then as `<world>-transcript.txt`.
  - **Replies:** “[Transcript started.]” and “[Transcript saved.]”. In infocom style: “Here begins a transcript of interaction with” plus the title, Zork's wording.
- **VERSION** prints the app name and version, then the world's `title` and `credits` lines, new optional fields. Zork's credits are its copyright lines.

### Testing

- **Unit tests per feature:** ties and both question kinds, answering and dropping, pronoun slots, AGAIN (including fragments), OOPS, UNDO (including a cap of 50, RESTART, and free), ALL/EXCEPT for take, drop and put, named saves (store tests), the status line, SCRIPT and VERSION.
- **Miss invariant:** questions, UNDO and free commands change nothing they shouldn't.
- **Differential walkthrough** gains commands whose replies Zork gives:
  - a bare TAKE and its answer;
  - an ambiguous noun and its answer (the walkthrough sets one up: carry the nasty knife and the sword, then type “blade”);
  - AGAIN;
  - a typo and OOPS;
  - TAKE ALL and DROP ALL with several items around.

  It must match line for line with an empty allowlist. UNDO, named saves, SCRIPT and VERSION aren't in Zork I's vocabulary, so they're covered by unit tests only.

### Housekeeping (from the stage 2 review)

- **SUPERBRIEF** shows room names only, with no contents, matching its reply.
- **Rescheduling** a pending fuse restarts its count as a fresh schedule would.
- **Effects naming things that don't exist** are skipped in play: a `move` of an unknown item, or a `run` of a missing event, changes nothing.
- **The audit** also checks event names in rules (`then`), `onEnter` triggers and the finale, and condition strings (known kinds, items and rooms exist).
- **A dark room's intent context** sends only the inventory and exits (no room name, no people).

### Compatibility

- **Office Space syncs with no world changes.** Its visible changes:
  - “What do you want to take?” instead of “Take what?”;
  - MOVES counting every acted-on turn;
  - the new commands.

  Tests that assert the old wording are updated as part of the sync.
- **New `GameState` fields:** none. Conversation state isn't saved.
- **`World` gains** optional `statusLine`, `title` and `credits`.

### Code

| File | Owns |
|---|---|
| `src/engine/conversation.ts` | pending questions and answers, pronouns, AGAIN, OOPS, the undo history |
| `src/engine/fuzzy.ts` | `fuzzyCandidates` |
| `src/engine/model.ts` | `resolveItem` |
| `src/engine/verbs/all.ts` | ALL and EXCEPT expansion |
| `src/stores/game.ts` | wires the conversation layer, named saves, SCRIPT and the status line |

### Docs

- **commands:** the new commands and questions.
- **how-it-works:** the conversation layer in the keystroke-to-reply flow.
- **world-schema:** `statusLine`, `title`, `credits`.
- **porting-zork:** P-OFLAG/ORPHAN → questions, OOPS/AGAIN.
- **CHANGELOG** 1.6.0.

## Out of scope

- Actors, combat, weight and the code hatch (stage 4).
- Vehicles and the rest of the map (stage 5).
- The npm library, planned after stage 3 ships.
