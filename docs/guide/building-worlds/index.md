# Building worlds

A world is one TypeScript object, typed by [`World`](../../reference/world-schema). There’s no build step, no scripting language and no engine code to write: rooms, items, people and rules are data, and the engine plays them.

This section is three worked examples, each a real world file that a test plays from start to finish, so the code you read here is code that runs:

- **[A two-room game](./two-rooms)** starts from nothing: two rooms, a hidden key, a locked door and a way to win. Start here.
- **[The demo game: Snack Attack](../your-first-world)** walks through the three-room world the demo boots into, with people, dialogue, hints, a score and a finale.
- **[Recipes](./recipes)** are small worlds for one idea each: containers and keys, darkness and death, timers, endings with verbs of your own, a guard to fight, scripts, a librarian with topics, a wandering cat, a room that listens, a raft, and a robot, a dial and a dune buggy.

Every one of them ships with the engine, so you can play it, read it or start from it: `import { twoRooms, tutorial, containers } from '@brass-lantern/engine/worlds'`.

## Where a world lives

Anywhere in your app. Put it in a file of its own, typed with `World`:

```ts
// my-world.ts
import type { World } from '@brass-lantern/engine';

export const myWorld: World = {
  startRoom: 'porch',
  rooms: { /* … */ },
  items: { /* … */ },
  npcs: {},
  dialogue: {},
  events: { intro: [ /* … */ ] },
  flagLabels: {},
};
```

Then hand it to the terminal as a cartridge ([Using the library](../using-the-library) has the setup):

```ts
import { mountGame } from '@brass-lantern/vue';
import '@brass-lantern/vue/style.css';
import { myWorld } from './my-world';

mountGame('#app', {
  cartridges: [{ kind: 'world', id: 'my-world', title: 'MY WORLD', world: myWorld }],
  storagePrefix: 'my-world',
});
```

With one cartridge the terminal boots straight into it; with several it shows a menu.

## The loop

1. **Write a little.** One room, one item, one rule.
2. **Play it** in the browser, or in a test (below), which is faster.
3. **Run the checks.** `auditWorld(myWorld)` lists effects naming things that don’t exist, exits to nowhere, unknown conditions and events. Those mistakes fail silently in play, so make them fail loudly in a test: expect it to return `[]`.

A test that plays your world is a few lines:

```ts
import { expect, it } from 'vitest';
import { auditWorld, createGame } from '@brass-lantern/engine';
import { twoRooms } from '@brass-lantern/engine/worlds';

it('has no broken references', () => {
  expect(auditWorld(twoRooms)).toEqual([]);
});

it('can be won', () => {
  const game = createGame(twoRooms, { seed: 1 });
  for (const line of ['examine mat', 'take key', 'unlock door with key', 'open door', 'north', 'read letter']) game.send(line);
  expect(game.state.gameOver).toBe(true);
});
```

[Testing a world](../testing) covers the rest.

## Style

- **Brass** (the default) is this engine’s own voice: “You can see: …”, “Taken: lamp.”, an exit line.
- **Infocom** (`style: 'infocom'`) follows Zork: “There is a lamp here.”, “Taken.”, no exit line, brief revisits. The native [Zork I](../porting-zork) uses it.

Write player-facing text with curly quotes and apostrophes (“ ” ’), as the engine’s own replies do.
