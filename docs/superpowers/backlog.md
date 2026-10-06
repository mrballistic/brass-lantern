# Engine backlog

Known gaps the reviews found and deferred. Each stage's spec picks up the ones it touches; strike an item through (or delete it) when it ships. Newest first.

## From stage 4a (1.7.0)

- ~~**DIAGNOSE in a world without combat**~~ (1.8.0) says “You can be killed by a serious wound.” after “You are in perfect health.” A world with no `combat` should get just the health line. (Seen live in Office Space.)
- **A script that throws** leaves its turn half-applied in production (no guard or snapshot around the turn). Tests surface the error; players would see a half-finished turn.
- ~~**The `sword_glow` script**~~ (1.8.0) in `src/worlds/zork1.ts` finds characters its own way (the first room listing them) instead of `isNpcIn`. Scripts could get `ctx.npcIn(id, room)`.
- **Fidelity gaps against zork1.z3:**
  - worn things don't count 1 toward weight (there's no worn state yet), and CCOUNT's worn exclusion for the fumble count isn't ported;
  - ~~the player's weapon (FIND-WEAPON) is the first in `world.items` order, not the most recently taken~~ (1.8.0);
  - the troll's first strike (F-FIRST?) doesn't cancel the rest of a compound command (P-CONT);
  - ~~waking the troll while you're away resets his wake counter; Zork's AWAKEN doesn't~~ (1.8.0);
  - ~~the trap door doesn't re-bar after a death~~ (1.8.0: `death.then`).
- ~~**The world audit**~~ (1.8.0) doesn't check characters' combat hooks (`onDeath`, `onBusy`, `onWake`, `onUnconscious`), `combat.weapon`, `fears.item`, `holds`, `descriptions[].if`, or characters' `instead`/`after` rules. A typo there silently does nothing.
- ~~**In a world with combat, ATTACK at an item**~~ (1.8.0) skips `withRules`, so an item's `instead.attack` rule can never fire.
- ~~**Stale comment**~~ (1.8.0) at `tests/worlds/zork1-allowlist.ts` (“The walkthrough skips the sword”).

## From stage 3 (1.6.0)

- ~~**PUT ALL IN X**~~ (1.8.0) compares the typed indirect word to item IDs, so “put all in brown sack” may try to put the sack into itself.
- ~~**`conditionProblems`**~~ (1.8.0) accepts a character's ID for `has:` and `on:`, not only `here:`, so a typo naming a person slips past the audit.
