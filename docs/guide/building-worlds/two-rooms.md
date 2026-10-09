# A two-room game

This page builds the smallest complete game, [`packages/engine/src/worlds/examples/two-rooms.ts`](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/src/worlds/examples/two-rooms.ts), from nothing. You’re home after a long time away; the door is locked, and you left the key somewhere obvious. [A test](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/tests/worlds/examples/two-rooms.test.ts) plays it to the end.

The whole game is one file, `two-rooms.ts`, holding one object. Its outline:

```ts
import type { World } from '@brass-lantern/engine';

export const twoRooms: World = {
  // Two rooms: startRoom and rooms
  // Things: items
  // What happens: npcs, dialogue, flagLabels, events and endings
};
```

Each section below shows one part of that object, in order; put them inside the braces one after another and you have the file. It’s also [shown whole](#the-whole-file) at the end. The game ships with the engine, so you can play it straight away without typing any of it: `import { twoRooms } from '@brass-lantern/engine/worlds'`.

## Two rooms

<<< ../../../packages/engine/src/worlds/examples/two-rooms.ts#rooms{ts}

- **`startRoom`** is where a new game begins.
- **`exits`** map what the player types to where it goes. A plain string (`north: 'hall'`) is enough for an open way through; here each exit is an object naming a **`door`**, an item that has to be open before anyone passes. Several labels for the same way (`north`, `in`) are normal.
- **`listExits`** is what the exit line shows. Without it, every label is listed.
- **`scenery`** lists items that are present without being *in* the room: the door belongs to both rooms, so both name it, and it’s never listed or taken.
- **`items`**, **`npcs`** and **`onEnter`** are required on every room, even when empty.

## Things

<<< ../../../packages/engine/src/worlds/examples/two-rooms.ts#items{ts}

- **Every item has a `name`** (shown to players), a **`description`** (EXAMINE), says whether it’s **`portable`**, and has **`tags`** (labels for your own rules; `[]` is fine). **`aliases`** are other words for it. The world’s `items` is required too.
- **`scenery: true`** on an item keeps it out of the room’s list of things (the description already mentions the mat). It’s still in the room’s `items`, so it can be examined. **`refusal`** is what TAKE says to something that isn’t portable.
- **The door** is an item with `door: true` and a `container` block: it can be opened, it starts locked, and the `key` item unlocks it. UNLOCK DOOR WITH KEY and OPEN DOOR work with no rules at all.
- **The mat hides the key.** An **`instead`** rule replaces what a verb normally does. A rule is `{ if, then }`: `if` is a [condition](../../reference/conditions-and-events#conditions) (`!flag:found_key`, “the flag `found_key` isn’t set”), and `then` names an event to run. EXAMINE MAT runs the `find_key` event the first time; once `found_key` is set the rule’s `if` fails and EXAMINE prints the description as usual.
- **The key starts nowhere.** It isn’t in any room’s `items`, so it’s offstage until an event moves it.
- **The side table is a `surface`**: what’s on it is always visible and in reach, which is where the hall’s “Sitting on the side table is:” comes from. `contains` puts the letter there at the start.
- **The letter ends the game** with an `instead` rule on READ.

## What happens

<<< ../../../packages/engine/src/worlds/examples/two-rooms.ts#events{ts}

- **`events`** are named lists of steps. A string prints; an object is an [effect](../../reference/conditions-and-events#events-and-effects). `find_key` prints a line, sets a flag and moves the key onto the porch.
- **`intro`** plays when a new game starts.
- **`end`** plays one of the world’s **`endings`**: its lines, then the footer, and the game is over. A line starting with an emoji (✨) is shown as an event; [How lines are styled](../../reference/conditions-and-events#how-lines-are-styled) has the rules.
- **`npcs`, `dialogue` and `flagLabels`** are required. This game has no people, and its flags are set by effects rather than [bracket lines](../../reference/conditions-and-events#bracket-lines-the-older-form), so they’re empty.

## The whole file

The three parts, assembled. The sections above leave out only what goes around them: the import, a comment, and `export const twoRooms: World = {` with its closing `};`. (The file in the repo also has `// #region` comments marking the three parts for this page. They change nothing, and they’re left out here.)

::: details two-rooms.ts
<<< ../../../packages/engine/src/worlds/examples/two-rooms.ts{ts}
:::

## Play it

You need Node 24 or later. In a new folder:

```bash
npm init -y
npm pkg set type=module
npm i @brass-lantern/engine
```

Save the file above as `two-rooms.ts`, and this beside it as `play.ts`:

```ts
import { createGame } from '@brass-lantern/engine';
import { twoRooms } from './two-rooms.ts';

const game = createGame(twoRooms);
console.log(game.opening.join('\n'));
for (const command of ['north', 'examine mat', 'take key', 'unlock door with key', 'open door', 'north', 'take letter', 'read letter']) {
  console.log(`> ${command}`);
  console.log(game.send(command).lines.join('\n'));
}
```

```bash
node play.ts
```

Node 24 and later run TypeScript files as they are, no compiler needed (`npx tsx play.ts` works too). `createGame` runs a world with no browser: `game.opening` is what the game says before the first command, and `game.send(line)` takes whatever a player would type and answers with its `lines`. No server or API key is needed. To skip the typing, import the shipped copy instead: `import { twoRooms } from '@brass-lantern/engine/worlds'`.

It prints this, word for word (the test checks the same transcript):

```
You’re back at the old house at last. You’re sure you left the key somewhere obvious.
📍 Front Porch
A creaky porch in front of an old house. A doormat lies at your feet.
Exits: north.
> north
The front door is closed.
> examine mat
You lift a corner of the mat. Underneath: a brass key.
> take key
Taken: brass key.
> unlock door with key
Unlocked.
> open door
Opened.
> north
📍 Hall
A dusty hall that smells of old books. The front door is south.
Sitting on the side table is:
  A letter
Exits: south.
> take letter
Taken: letter.
> read letter
“Dear me,” it begins. “If you’re reading this, you remembered the mat. Welcome home.”
✨ You’re home.
Type RESTART to play again.
```

**In the browser**, the same world plays in the terminal from `@brass-lantern/vue`: a styled window, like an old CRT screen, with the typing prompt, saves and the rest of what a player sees. The shortest way there is a new [Vite](https://vite.dev) app:

```bash
npm create vite@latest my-game -- --template vanilla-ts
cd my-game
npm i @brass-lantern/engine @brass-lantern/vue vue pinia
```

The template already has an `index.html` with `<div id="app">` that loads `src/main.ts`. Copy `two-rooms.ts` into `src/`, then replace everything in `src/main.ts` with:

```ts
import { mountGame } from '@brass-lantern/vue';
import '@brass-lantern/vue/style.css';
import './style.css';
import { twoRooms } from './two-rooms.ts';

mountGame('#app', {
  cartridges: [{ kind: 'world', id: 'two-rooms', title: 'TWO ROOMS', world: twoRooms }],
  storagePrefix: 'two-rooms',
});
```

and everything in `src/style.css` with:

```css
html, body, #app { height: 100%; margin: 0; overflow: hidden; }
```

```bash
npm run dev
```

Open the address it prints and the game boots. What the options mean:

- **`cartridges`** are the games on offer. A cartridge with `kind: 'world'` is a world like this one; `id` names it (in its saves, for one), and `title` is what the menu shows. With one cartridge there’s no menu: the terminal boots straight into it.
- **`storagePrefix`** names everything the game keeps in the browser (saves, the player’s theme), so two games on one site don’t share saves.
- **The game fills `#app`**, which is why `style.css` gives it the whole window.

Vite tells TypeScript what a `.css` import is (the template’s `vite/client` types), and it accepts the `.ts` ending on `./two-rooms.ts`, as Node does. Outside Vite, [Using the library](../using-the-library#put-a-game-on-a-page) says what to declare for the stylesheet, and covers themes and the rest of the options.

Players won’t type exactly the commands above. “Look under the mat” or “use the key on the door” aren’t commands the engine can act on by itself, so with the [intent server](../intent-server) running they can be mapped onto EXAMINE MAT and UNLOCK DOOR WITH KEY. Without it (as with `createGame`, which never uses it) the player gets a nudge to rephrase.

## Where next

- Give the game a person to talk to, hints and a score: [Snack Attack](../your-first-world) shows all three.
- Make the hall dark until you find a lamp: [darkness](./recipes#darkness-and-death).
- Every field, with its default: the [world schema](../../reference/world-schema).
