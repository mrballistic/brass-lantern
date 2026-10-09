# Testing a world

A world is data, and data rots quietly: an exit points at a renamed room, a flag label gets a typo, the ending becomes unreachable. Two kinds of test catch nearly all of it, and both run in plain Node with any test runner. The examples here use [Vitest](https://vitest.dev/).

## Play it

`createGame` from `@brass-lantern/engine` runs a world with no browser: feed it the lines a player would type, and read the replies. A test reads like a transcript:

```ts
import { describe, expect, it } from 'vitest';
import { createGame } from '@brass-lantern/engine';
import { tutorial } from '@brass-lantern/engine/worlds';

describe('Snack Attack', () => {
  it('plays to the best ending', () => {
    const game = createGame(tutorial, { seed: 1 });
    const text = [
      'open drawer',
      'take stapler',
      'north',
      'take mug and give mug to gary',
      'talk to gary',
      'north',
      'smash machine with stapler',
    ].flatMap((line) => game.send(line).lines).join('\n');

    expect(game.state.gameOver).toBe(true);
    expect(text).toContain('You share the pretzels');
    expect(text).toContain('[Score: 50 of 50');
  });
});
```

Swap `tutorial` for your own world (`import { myWorld } from './my-world'`). `seed` makes the game’s randomness repeatable, so a world with chance effects or fights plays the same way on every run.

Write at least two: the **shortest win**, and a run that **earns every point**. When either breaks, you’ve changed the critical path or the scoring, on purpose or not.

To pin every word, compare the whole transcript: `expect(text).toMatchInlineSnapshot()` fills itself in on the first `npx vitest -u`, and from then on any change to the text fails the test until you look at it.

`send` takes a whole line, as the player would type it: chained commands, pronouns, AGAIN, OOPS, UNDO and the answer to a question all work. When the game asks “Which door do you mean?”, the reply’s `awaiting` is true and the next `send` answers it. There’s no intent server in a test, so write commands the regex parser understands, and name things with words the world knows. Every word of three or more letters has to be in the thing’s name, an alias or its ID, so `take red ball` misses a thing called only “ball” (“You don’t see a “red ball” here.”). In the browser the intent server might rescue that; in a test it fails, which is how you find the alias players will need. Since 2.1.0 this is stricter than it was, so a test that passed on 2.0 can start failing here: add the alias (see [How names are matched](./building-worlds/#how-names-are-matched)).

## Check the data

`auditWorld(world)` returns a list of problems, one string each, and an empty list when it finds none:

```ts
import { expect, it } from 'vitest';
import { auditWorld } from '@brass-lantern/engine';
import { myWorld } from './my-world';

it('has no broken references', () => {
  expect(auditWorld(myWorld)).toEqual([]);
});
```

It finds the mistakes that fail silently in play:

- effects naming items, rooms, events or endings that don’t exist, and unknown effects;
- events named by rules, `onEnter`, `onTake`, `onWear`, `onSmash`, `onGive`, daemons and the finale that don’t exist;
- conditions of unknown kinds, or naming items and rooms that don’t exist (in rules, triggers, exits, `requires`, daemons, hints and scoring); `direction:` takes any lowercase word, since an `orders.go` rule sees the place as typed (`direction:basement`);
- exits to nowhere, doors that aren’t items, items listed in rooms or containers that don’t exist;
- a world verb word that a built-in verb already owns, and the reserved IDs `player` and `number`.

It doesn’t walk the map. A few more checks are worth writing for your own world. Every room reachable from the start:

```ts
it('every room is reachable from the start', () => {
  const seen = new Set<string>();
  const queue = [myWorld.startRoom];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const exit of Object.values(myWorld.rooms[id]?.exits ?? {})) {
      const to = typeof exit === 'string' ? exit : exit.to;
      if (to) queue.push(to);
    }
  }
  expect(Object.keys(myWorld.rooms).filter((id) => !seen.has(id))).toEqual([]);
});
```

More along the same lines: every `[Flag set: …]` label is in `flagLabels`; every flag in a `requires`, hint or scoring entry can actually be set by some event; every gated room has a `denial`; every `listExits` label is a real exit.

**Copy style** is easy to test too. If you use curly quotes, fail on straight ones:

```ts
it('uses smart punctuation', () => {
  const strings: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(myWorld);
  expect(strings.filter((s) => /["']/.test(s))).toEqual([]);
});
```

That walks every string in the world, IDs and conditions included, which is fine as long as those don’t use quotes either.
