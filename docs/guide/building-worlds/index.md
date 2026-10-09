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
3. **Run the checks.** `auditWorld(myWorld)` lists effects naming things that don’t exist, exits to nowhere, unknown conditions and events, and IDs, flags or variables named `__proto__`, `constructor` or `prototype` (the engine ignores those names, so they can’t reach `Object.prototype`; a player who types one just gets the reply for a word the game doesn’t know). Those mistakes fail silently in play, so make them fail loudly in a test: expect it to return `[]`.

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

## How names are matched

The player’s words find a thing (or a character, or a topic) by trying, in order, and stopping at the first that finds anything:

1. **exactly** its name, an alias or its ID (`take brass lantern`);
2. **part of** its name, an alias or its ID (`take lantern`, `take lant`);
3. **its words**: every word of three or more letters the player typed matches the start of a word in its name, aliases or ID (`take lantern of brass`). Shorter words (`a`, `of`, `my`) are ignored, and so are common determiners and possessives (`this`, `that`, `his`, `your`, `some`, …): the player may type them, and they never have to match.

If two things match equally, the game asks which one the player means.

The third step is strict on purpose: **a word the world doesn’t know stops the match.** If the player types `take red ball` and the world calls the thing only “ball”, nothing matches, even though there is a ball right there:

```
> take red ball
You don’t see a “red ball” here.
```

So when your description gives a thing a colour, a size or a material, put that word in its name or an alias. Either of these works:

```ts
ball: { name: 'ball', aliases: ['red ball'], description: 'A red rubber ball.', portable: true, tags: [] },
ball: { name: 'red ball', description: 'A red rubber ball.', portable: true, tags: [] },
```

```
> take red ball
Taken: ball.
```

(Before 2.1.0 one matching word was enough, so `give smiley flair` could land on some *other* flair once the smiley one was gone. If a test of yours stops finding a thing after upgrading, this is why: add the alias.) Exits have no aliases: their labels are the words, so give an exit every label a player might type.

## Characters: orders and FOLLOW

A character can be told to do things: `robot, go east`, `floyd, follow me`. Its `orders` rules answer, keyed by the verb, and `obeys` lets it carry out GO, TAKE, DROP and GIVE by itself. [Orders](../../reference/world-schema#orders) has the whole story; [Orders, numbers and a buggy](./recipes#orders-numbers-and-a-buggy) is a worked example.

In an `orders.go` rule, **`direction:`** is the place the character was told to go, as the player typed it. The robot in that recipe won’t drive onto sand by itself:

```ts
robot: {
  name: 'robot',
  description: 'A squat robot on treads, with one clamp for an arm.',
  obeys: ['go', 'take'],
  obeyReplies: { go: 'Whirr, click!', take: 'Click!' },
  orders: {
    go: [{ if: 'direction:dunes', say: ['The robot looks at its treads, then at the sand, and stays put.'] }],
  },
},
```

```
> robot, go to the dunes
The robot looks at its treads, then at the sand, and stays put.
> robot, go east
Whirr, click!
```

“Go to the dunes” matches `direction:dunes`, so the rule answers. “Go east” matches no rule, so the robot obeys. The word is compared as typed (lowercase, without “to the”), so `direction:east` works for compass directions too.

FOLLOW is a built-in verb. `follow floyd` doesn’t make Floyd anything; it tells the player how to bring him along. `floyd, follow me` is an order, so the character decides, in an `orders.follow` rule:

```ts
floyd: {
  name: 'Floyd',
  article: '',
  description: 'Floyd, a cheerful robot.',
  orders: { follow: [{ if: 'target:player', then: 'floyd_tags_along' }] },
},
// in events:
floyd_tags_along: ['“Floyd go too!” he squeaks.', { follow: 'floyd' }],
```

```
> follow floyd
You’d rather Floyd came to you. Try FLOYD, FOLLOW ME.
> floyd, follow me
“Floyd go too!” he squeaks.
> north
…
Floyd follows you.
```

**`article: ''`** is for proper names. The engine’s own lines about a character start with “The” (“The robot can’t go that way.”); `''` makes them “Floyd can’t go that way.” rather than “The Floyd …”.

An `instead.follow` rule on the character replaces the built-in reply to `follow floyd` (“Floyd is too quick for you.”).

## Darkness

A room with `dark: true` needs a light the player brings in: an item with `light: true` that is on. In the dark the player can use only what they carry: acting on anything else says “It’s too dark to see.” (`darkness.tooDark` changes the line), and so does EXAMINE of a character who’s there. Talking to characters, giving them things, ordering them and fighting them still work.

```
> examine troll
It’s too dark to see.
```

A `flaming` item with no switch, such as a torch or a lit match, is already burning: LIGHT TORCH says “It’s already lit.” Being on fire doesn’t make it a light, though; give it `light: true` and switch it on with an effect if it should light rooms. [Darkness and death](./recipes#darkness-and-death) is a worked example, and [Darkness](../../reference/world-schema#darkness) lists the fields.

## Saves and new versions of your world

Players’ saves hold the whole game: where every item is, flags, variables. When you ship a new version of a world with **new items**, a save made before them has no place for them. On load, the engine puts each item the save doesn’t mention where the world starts it, so an older save sees the new things where you placed them. An item the player used up (moved to `null`) stays gone. The browser terminal does this on every load; if you keep saves yourself, pass them through `migrateSave(world, raw)` from `@brass-lantern/engine` to get the same.

Say version 1 of the two-room game has nothing in the hall but the side table, and version 2 adds an umbrella. All you do is add it, as you would to a new world:

```ts
// Version 1
hall: { name: 'Hall', /* … */ items: ['side_table'], /* … */ },

// Version 2: the umbrella is new
hall: { name: 'Hall', /* … */ items: ['side_table', 'umbrella'], /* … */ },
// and in items:
umbrella: { name: 'umbrella', description: 'A black umbrella, still damp.', portable: true, tags: [] },
```

A player who saved in the hall under version 1 restores under version 2 and finds it there:

```
> look
📍 Hall
A dusty hall that smells of old books. The front door is south.
You can see: umbrella.
Sitting on the side table is:
  A letter
Exits: south.
```

In the save itself, `migrateSave` fills in the one place the old save was missing, and leaves everything else alone:

```ts
// before: version 1’s save has no umbrella
locations: { doormat: 'porch', key: 'player', side_table: 'hall', letter: 'side_table', /* … */ }
// after migrateSave(version2, save): the umbrella starts where version 2 puts it
locations: { doormat: 'porch', key: 'player', side_table: 'hall', letter: 'side_table', /* … */ umbrella: 'hall' }
```

That covers new items only. Change where an existing item starts and old saves keep it where it was; rename an item’s ID and old saves treat it as new, putting it back at its start even if the player had taken it. Prefer adding to renaming.

## Style

- **Brass** (the default) is this engine’s own voice: “You can see: …”, “Taken: lamp.”, an exit line.
- **Infocom** (`style: 'infocom'`) follows Zork: “There is a lamp here.”, “Taken.”, no exit line, brief revisits. The native [Zork I](../porting-zork) uses it.

Write player-facing text with curly quotes and apostrophes (“ ” ’), as the engine’s own replies do.
