# Testing a world

A world is data, and data rots quietly: an exit points at a renamed room, a flag label gets a typo, the ending becomes unreachable. Two kinds of test catch nearly all of it.

## Play it

[`tests/worlds/tutorial.test.ts`](https://github.com/mrballistic/brass-lantern/blob/main/tests/worlds/tutorial.test.ts) has a `play()` helper that runs typed commands through the real parser and engine, so a test reads like a transcript:

```ts
import { tutorial as world } from '@/worlds/tutorial';
import { execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse, splitCommands } from '@/engine/parser';

function play(lines: string[]) {
  const state = initialState(world);
  const log = [...openingLines(world, state)];
  for (const line of lines) {
    log.push(`> ${line}`);
    for (const command of splitCommands(line)) {
      const parsed = fallbackParse(command);
      if (!parsed) throw new Error(`unparsed: ${command}`);
      log.push(...execute(parsed, { world, state }).lines);
    }
  }
  return { state, text: log.join('\n') };
}

it('plays to the best ending', () => {
  const { state, text } = play([
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

The helper calls the engine directly, without the store, so `it`/`them` aren't resolved and the intent server isn't consulted. Write commands the regex parser understands.

## Check the data

Integrity checks that are worth having for any world:

```ts
import { tutorial as world } from '@/worlds/tutorial';

it('every exit leads to a real room', () => {
  const broken = Object.entries(world.rooms).flatMap(([id, room]) =>
    Object.entries(room.exits)
      .filter(([, dest]) => !world.rooms[dest])
      .map(([label, dest]) => `${id}.${label} → ${dest}`),
  );
  expect(broken).toEqual([]);
});

it('every [Flag set: …] label is mapped', () => {
  const unmapped = Object.values(world.events)
    .flat()
    .map((line) => line.match(/^\[Flag set:\s*(.+?)\]$/)?.[1])
    .filter((label): label is string => !!label && !world.flagLabels[label.toLowerCase()]);
  expect(unmapped).toEqual([]);
});

it('every room is reachable from the start', () => {
  const seen = new Set<string>();
  const queue = [world.startRoom];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...Object.values(world.rooms[id]?.exits ?? {}));
  }
  expect(Object.keys(world.rooms).filter((id) => !seen.has(id))).toEqual([]);
});
```

More along the same lines: every event a room, item, person or the finale names exists; every item a room lists exists; every flag in a `requires`, hint or scoring entry can actually be set by some event; every gated room has a `denial`; every `listExits` label is a real exit.

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
