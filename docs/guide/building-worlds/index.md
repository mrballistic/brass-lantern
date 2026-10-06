# Building worlds

A world is one TypeScript object, typed by [`World`](../../reference/world-schema). There's no build step, no scripting language and no engine code to write: rooms, items, people and rules are data, and the engine plays them.

This section is three worked examples, each a real world file that a test plays from start to finish, so the code you read here is code that runs:

- **[A two-room game](./two-rooms)** starts from nothing: two rooms, a hidden key, a locked door and a way to win. Start here.
- **[The demo game: Snack Attack](../your-first-world)** walks through the three-room world the demo boots into, with people, dialogue, hints, a score and a finale.
- **[Recipes](./recipes)** are small worlds for one idea each: containers and keys, darkness and death, timers, endings with verbs of your own, a guard to fight, and scripts.

## Where a world lives

Put the file in `src/worlds/` and add it to `cartridges` in `src/app.config.ts`:

```ts
import { twoRooms } from '@/worlds/examples/two-rooms';

export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'two-rooms', title: 'TWO ROOMS', world: twoRooms },
];
```

With one cartridge the terminal boots straight into it; with several it shows a menu. Run `npm run dev` and play.

## The loop

1. **Write a little.** One room, one item, one rule.
2. **Play it** in the browser, or in a test (below), which is faster.
3. **Run the checks.** `npm test` runs `tests/worlds/audit.test.ts` over every world in `cartridges`: effects naming things that don't exist, exits to nowhere, unknown conditions and events. Those mistakes fail silently in play, so they fail loudly here.

A test that plays your world is a few lines:

```ts
import { play } from '../helpers/play';
import { twoRooms } from '@/worlds/examples/two-rooms';

it('can be won', () => {
  const { state } = play(twoRooms, ['examine mat', 'take key', 'unlock door with key', 'open door', 'north', 'read letter']);
  expect(state.gameOver).toBe(true);
});
```

[Testing a world](../testing) covers the rest.

## Style

- **Brass** (the default) is this engine's own voice: “You can see: …”, “Taken: lamp.”, an exit line.
- **Infocom** (`style: 'infocom'`) follows Zork: “There is a lamp here.”, “Taken.”, no exit line, brief revisits. The native [Zork I](../porting-zork) uses it.

Write player-facing text with curly quotes and apostrophes (“ ” ’), as the engine's own replies do.
