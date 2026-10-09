import type { World } from '@brass-lantern/engine';

/** Recipe: orders, numbers and a buggy. See docs/guide/building-worlds/recipes.md. */
export const workshop: World = {
  startRoom: 'workshop',
  // Fixes the buggy's choice of line, so the recipe's transcript plays the same every time.
  seed: 4,
  rooms: {
    workshop: {
      name: 'Workshop',
      description: 'Benches, a big brass dial on the wall and a red button. The yard is east.',
      exits: { east: 'yard' },
      items: ['dial', 'button', 'wrench'],
      npcs: ['robot'],
      onEnter: [],
    },
    yard: {
      name: 'Yard',
      description: 'A gravel yard. The workshop is west, and dunes begin to the east.',
      exits: { west: 'workshop', east: 'dune' },
      items: ['buggy'],
      npcs: [],
      onEnter: [],
    },
    // #region sand
    dune: {
      name: 'Dune',
      description: 'Soft sand rolls away in every direction. The yard is west; a bigger dune lies east.',
      // A terrain of the world's own: only something that travels on sand goes here.
      terrain: 'sand',
      exits: { west: 'yard', east: 'crest' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    crest: {
      name: 'Crest',
      description: 'The top of the biggest dune. You can see the whole desert, and it is all sand.',
      terrain: 'sand',
      exits: { west: 'dune' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    // #endregion sand
  },
  items: {
    // #region dial
    dial: {
      name: 'dial',
      aliases: ['brass dial'],
      // `{var:dial}` fills in from the game; it's 0 until the dial is set.
      description: 'The brass dial points at {var:dial}.',
      portable: false,
      tags: [],
      instead: {
        turn: [
          { with: 'number', if: 'number:4', then: 'hatch_opens' },
          { with: 'number', then: 'dial_set' },
        ],
      },
    },
    // #endregion dial
    button: { name: 'red button', aliases: ['button'], description: 'A red button. It begs to be pushed.', portable: false, tags: [] },
    wrench: { name: 'wrench', description: 'A big, greasy wrench.', portable: true, tags: [] },
    // #region buggy
    buggy: {
      name: 'dune buggy',
      aliases: ['buggy'],
      description: 'A rattling dune buggy with fat tires.',
      portable: false,
      tags: [],
      // It travels on land and on sand; its `leave` lines are said as it drives off with you.
      vehicle: { travels: ['land', 'sand'], leave: ['The engine roars.', 'Sand sprays behind you.'] },
      container: { open: true },
    },
    // #endregion buggy
  },
  // #region robot
  npcs: {
    robot: {
      name: 'robot',
      description: 'A squat robot on treads, with one clamp for an arm.',
      // It does these built-in orders itself: “robot, go east”, “robot, take wrench”.
      obeys: ['go', 'take'],
      obeyReplies: { go: 'Whirr, click!', take: 'Click!' },
      refuseOrder: 'The robot beeps, puzzled.',
      // And these through rules, keyed by the verb: “robot, push the button”.
      orders: {
        push: [{ if: 'target:button', then: 'robot_pushes' }, { say: ['The robot has no use for that.'] }],
        // “robot, go to the dunes”: in a go rule, `direction:` is where it was told to go, as typed.
        go: [{ if: 'direction:dunes', say: ['The robot looks at its treads, then at the sand, and stays put.'] }],
      },
    },
  },
  // #endregion robot
  events: {
    hatch_opens: ['The dial clicks to 4, and a hatch in the floor swings open. Inside is a tin of biscuits.', { setVar: 'dial', from: 'number' }, { end: 'biscuits' }],
    dial_set: [{ setVar: 'dial', from: 'number' }, 'The dial clicks round to {number}. Nothing else happens.'],
    robot_pushes: ['The robot extends its clamp and presses the button. Somewhere, a bell rings.'],
  },
  endings: { biscuits: { lines: ['A good day in the workshop.'] } },
  dialogue: { robot: { default: 'The robot beeps.' } },
  flagLabels: {},
};
