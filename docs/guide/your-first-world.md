# The demo game: Snack Attack

A world is one TypeScript object: rooms, items, people, the lines they say, and the rules that join them. If you haven’t written one yet, start with [a two-room game](./building-worlds/two-rooms); this page goes further, and builds **Snack Attack**, the tutorial world (`tutorial` in `@brass-lantern/engine/worlds`, [source on GitHub](https://github.com/mrballistic/brass-lantern/blob/main/packages/engine/src/worlds/tutorial.ts)), piece by piece. A test plays that exact file to the end, so everything here matches what the engine does.

The story: it’s 12:01, your pretzels are stuck in the break room vending machine, and you need your badge, a heavy object, and maybe some advice from Gary in Accounts.

## The shape

```ts
import type { World } from '@brass-lantern/engine';

export const tutorial: World = {
  startRoom: 'cubicle',
  rooms: { /* … */ },
  items: { /* … */ },
  npcs: { /* … */ },
  dialogue: { /* … */ },
  events: { intro: [ /* … */ ] },
  flagLabels: { /* … */ },
  // optional: hints, scoring, ranks, idle, quit, confused, ambient, finale
};
```

Every room, item and person has an **ID**, its key (`desk_drawer`, `gary`). IDs are snake_case and never shown to players. The engine’s state is small: where you are, where every item is, a set of **flags** (named booleans like `drawer_open`), a few numbers, which events have fired, and how many moves you’ve made. Everything a world does comes down to reading and setting those.

## Rooms

```ts
rooms: {
  cubicle: {
    name: 'Your Cubicle',
    description: 'Gray carpet on the walls, gray carpet on the floor. Your desk has one drawer. It is closed.',
    exits: { north: 'hallway', hallway: 'hallway', out: 'hallway' },
    listExits: ['hallway'],
    items: ['desk_drawer', 'stapler'],
    npcs: [],
    onEnter: [],
  },
  break_room: {
    name: 'The Break Room',
    description: 'A vending machine hums in the corner. Your lunch, a single bag of pretzels, hangs from its spiral, not quite falling.',
    exits: { south: 'hallway', hallway: 'hallway', out: 'hallway' },
    listExits: ['hallway'],
    items: ['vending_machine'],
    npcs: [],
    onEnter: [{ if: '!flag:saw_pretzels', then: 'see_pretzels' }],
    requires: 'has:badge',
    denial: 'The break room door has a badge reader. You do not have a badge on you.',
  },
}
```

- **`exits`** maps what the player can type to where it leads. Give each destination a few labels (a direction, a place name, `out`). The parser is forgiving about phrasing (“go to the hallway”, “hall”, “n”), but only matches labels you provide.
- **`listExits`** is what the player sees. The engine adds the direction that goes to the same place: `Exits: hallway (north).`
- **`requires`** is a [condition](../reference/conditions-and-events#conditions) for entering, and **`denial`** is the reply when it fails. A good denial hints at what’s missing.
- **`onEnter`** fires an event when you arrive, if its condition holds. **An `onEnter` event fires at most once per game.**

## Items

```ts
items: {
  desk_drawer: {
    name: 'desk drawer',
    aliases: ['drawer', 'desk'],
    description: 'A metal drawer that sticks.',
    portable: false,
    refusal: 'It is attached to the desk, which is attached to your career.',
    tags: [],
    onUse: [
      { if: '!flag:drawer_open', then: 'open_drawer' },
      { say: ['The drawer is already open. It holds nothing else of value.'] },
    ],
  },
  badge: { name: 'badge', aliases: ['id', 'card'], description: 'Your employee badge. The photo is from a better year.', portable: true, tags: [] },
  stapler: { name: 'stapler', description: 'Heavy. Reliable. Faintly menacing.', portable: true, tags: ['weapon'] },
}
```

`name` is what players see; `aliases` are other words they might use. Every word of three or more letters a player types has to be in one of them (or the ID), so “metal drawer” finds nothing here until `metal drawer` is an alias; see [How names are matched](./building-worlds/#how-names-are-matched). `portable: false` items stay put, and `refusal` is what trying to take one says.

The badge isn’t in any room: opening the drawer hands it over. **`onUse`** is a list of rules, and the first one whose conditions hold wins. Each rule can fire an event (`then`), print lines (`say`), require another item nearby (`with`), or test a condition (`if`). End with a plain `say` as the fallback. PUSH, PULL and PRESS mean USE, and OPEN falls back to use rules on anything that isn’t a container, so “open drawer” works.

Items also have `onTake`, `onWear` and `onSmash` hooks, and `instead`/`after` rules for any verb; see the [schema](../reference/world-schema#item).

## People

```ts
npcs: {
  gary: {
    name: 'Gary',
    description: 'Gary from Accounts. He has opinions about the water cooler.',
    onGive: { mug: 'gary_mug' },
    refuse: { badge: '“That’s your badge, man. Keep your badge.”' },
    refuseGift: '“I don’t want that.”',
  },
},
dialogue: {
  gary: {
    default: '“Has anyone seen my mug?” Gary asks nobody in particular.',
    'flag:gary_happy': '“Thanks for the mug. Hey, if that machine eats your money, just hit it. Hard. With something heavy.”',
  },
},
```

GIVE MUG TO GARY takes the mug and fires `gary_mug`. With only one person in the room, GIVE MUG is enough. **`refuse`** declines a specific item and lets the player keep it. Gary is a proper name, so he has `article: ''`: the engine’s own lines about him (FOLLOW GARY, an order he can’t carry out) say “Gary”, not “the Gary”.

**Dialogue** maps conditions to lines; TALK TO uses the **last** entry whose condition holds, so list them from least to most advanced. Here, Gary’s advice only appears once he’s happy, which turns him into a hint.

## Events and flags

Events are named lists of lines. Most are prose. Lines in square brackets are shown to the player *and* change the game:

```ts
events: {
  intro: [
    '═══════════════════════════════',
    '        SNACK ATTACK',
    '═══════════════════════════════',
    '✨ IT IS 12:01. YOU ARE HUNGRY.',
  ],
  open_drawer: [
    'You yank the drawer open. Inside, under a decade of sticky notes: your badge.',
    '[Added to inventory: badge]',
    '[Flag set: Drawer open]',
  ],
  gary_mug: [
    '💼 Gary takes the mug and looks at it like a long-lost child.',
    '💼 “You’re a good one,” he says, and lowers his voice. “That machine? Hit it.”',
    '[Flag set: Gary is happy]',
  ],
},
flagLabels: {
  'drawer open': 'drawer_open',
  'gary is happy': 'gary_happy',
},
```

`[Flag set: Gary is happy]` sets whichever flag `flagLabels['gary is happy']` names. `[Added to inventory: badge]` and `[Badge consumed]` match items by their display **name**. `intro` plays when a new game starts. Line prefixes also choose the styling and typewriter speed: `💼` lines are scripted moments, `“` lines are narration. The full list is in [conditions and events](../reference/conditions-and-events#how-lines-are-styled).

## The ending

Snack Attack wins with the **finale**: smash a particular item, in a particular room, while holding a particular other item. (The other way to end a game is the `end` effect; see [Endings](../reference/world-schema#endings) and the [two-room game](./building-worlds/two-rooms).)

```ts
finale: {
  room: 'break_room',
  item: 'vending_machine',
  with: 'stapler',
  event: 'free_lunch',
  epilogue: [
    { if: 'flag:gary_happy', then: 'ending_with_gary' },
    { if: '!flag:gary_happy', then: 'ending_alone' },
  ],
  footer: 'footer',
  bareHanded: 'hurt_hand',
  bareHandedAgain: 'Your hand still hurts. The machine is winning.',
  wrongRoom: 'Not here. Save it for the machine.',
},
```

SMASH MACHINE WITH STAPLER plays `free_lunch`, then every epilogue event whose condition holds, then the score, then `footer`, and the game ends. The epilogue is where choices pay off: help Gary and you share the pretzels.

## The extras

```ts
hints: [
  { if: '!has:badge', text: 'The break room needs a badge. Check your desk.' },
  { if: '!flag:gary_happy', text: 'Gary lost his mug. Gary knows things.' },
  { if: '!flag:lunch_freed', text: 'The machine has your pretzels. Bring something heavy.' },
],
scoring: [
  { flag: 'drawer_open', points: 10 },
  { flag: 'gary_happy', points: 20 },
  { flag: 'lunch_freed', points: 20 },
],
ranks: [{ min: 0, title: 'Intern' }, { min: 50, title: 'Lunch Liberator' }],
confused: ['The office hums, uncomprehending. (Type HELP.)'],
ambient: [
  {
    if: 'in:break_room & !flag:lunch_freed',
    every: 2,
    lines: ['The vending machine hums, smug.', 'The pretzels sway, just out of reach.'],
  },
],
```

- **HINT** shows the first hint whose condition holds, so order them along the critical path.
- **SCORE** sums points for flags that are set, and names the highest rank reached.
- **`confused`** replies rotate for input nothing could understand.
- **`ambient`** lines interrupt every few turns while their condition holds. They’re good for a ringing phone, a ticking clock, or a smug vending machine.

## Play it

Pass your world to `mountGame` as one of its `cartridges` (`{ kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial }`; see [Using the library](./using-the-library#put-a-game-on-a-page)). Snack Attack itself ships with the engine: `import { tutorial } from '@brass-lantern/engine/worlds'`. The winning transcript for Snack Attack:

```
> open drawer
> take stapler
> north
> take mug and give mug to gary
> talk to gary
> north
> smash machine with stapler
```

Next: [test your world](./testing), so it stays winnable as it grows.
