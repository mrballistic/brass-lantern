# Testing a world

A world is data, and data rots quietly: an exit points at a renamed room, a flag label gets a typo, the ending becomes unreachable. Two kinds of test catch nearly all of it.

## Play it

[`tests/helpers/play.ts`](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/tests/helpers/play.ts) runs typed commands through the real parser and engine, so a test reads like a transcript:

```ts
import { play } from '../helpers/play';
import { tutorial } from '@/worlds/tutorial';

it('plays to the best ending', () => {
  const { state, text } = play(tutorial, [
    'open drawer',
    'take stapler',
    'north',
    'take mug and give mug to gary',
    'talk to gary',
    'north',
    'smash machine with stapler',
  ]);
  expect(state.gameOver).toBe(true);
  expect(text).toContain('You share the pretzels');
  expect(text).toContain('[Score: 50 of 50');
});
```

Write at least two: the **shortest win**, and a run that **earns every point**. When either breaks, you've changed the critical path or the scoring, on purpose or not.

To pin every word, compare the whole transcript: `expect(text).toMatchInlineSnapshot()` fills itself in on the first `npx vitest -u`, and from then on any change to the text fails the test until you look at it. The [example worlds](./building-worlds/) are tested this way.

`play()` calls the engine directly, without the store, so pronouns, questions, AGAIN, OOPS and UNDO aren't involved and the intent server isn't consulted. Write commands the regex parser understands, naming things fully enough not to be asked “which one?”.

## Check the data

[`tests/worlds/audit.test.ts`](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/tests/worlds/audit.test.ts) checks every world in `cartridges` for mistakes (`tests/worlds/examples/audit.test.ts` does the same for the example worlds) that fail silently in play:

- effects naming items, rooms, events or endings that don't exist, and unknown effects;
- events named by rules, `onEnter`, `onTake`, `onWear`, `onSmash`, `onGive`, daemons and the finale that don't exist;
- conditions of unknown kinds, or naming items and rooms that don't exist (in rules, triggers, exits, `requires`, daemons, hints and scoring);
- exits to nowhere, doors that aren't items, items listed in rooms or containers that don't exist;
- a world verb word that a built-in verb already owns, and the reserved ID `player`.

Your world gets these for free once it's a cartridge. A few more checks are worth writing for your own world. Every room reachable from the start:

```ts
it('every room is reachable from the start', () => {
  const seen = new Set<string>();
  const queue = [world.startRoom];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const exit of Object.values(world.rooms[id]?.exits ?? {})) {
      const to = typeof exit === 'string' ? exit : exit.to;
      if (to) queue.push(to);
    }
  }
  expect(Object.keys(world.rooms).filter((id) => !seen.has(id))).toEqual([]);
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
  walk(world);
  expect(strings.filter((s) => /["']/.test(s))).toEqual([]);
});
```

## The engine's own tests

`tests/engine/engine-hooks.test.ts` exercises every engine hook against a fixture world (`tests/fixtures/world.ts`), including a check that a command the engine can't act on never changes the game state. If you add a hook to the engine, give the fixture a use of it and a test here.
