import { exitTarget } from '../../../src/engine/describe';
import { moveItem, PLAYER } from '../../../src/engine/model';
import type { ScriptContext } from '../../../src/engine/scripts';
import type { GameState } from '../../../src/types/game';
import type { EventStep, World } from '../../../src/types/world';

/**
 * Zork II's robot, as a native slice (engine parity 6a, Task 11): the Low Room, the Machine Room,
 * the Dingy Closet with its cage and the red sphere, and the Carousel Room the triangular button
 * stops. Text from Infocom's story file (Release 63) and its source (historicalsource/zork2,
 * MIT License, Copyright (c) 2025 Microsoft); tests/worlds/zork2-slices.test.ts plays it against
 * the story file. Only what the slice needs: the rooms around the carousel are bare.
 */

const NO_WAY = 'You can’t go that way.';
const DIRS: Record<string, string> = { n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest' };
// The carousel's EIGHT-DIRECTIONS (seven: there's no west in it).
const EIGHT = ['north', 'east', 'south', 'northeast', 'southeast', 'southwest', 'northwest'];
// The exits MAGNET-ROOM-EXIT answers for.
const MAGNET = ['north', 'south', 'west', 'northeast', 'northwest', 'southwest', 'southeast', 'east', 'out'];

/** The direction GO was given, spelled out. */
function typedDirection(ctx: ScriptContext): string {
  const word = (ctx.command?.words?.target ?? '').toLowerCase().trim();
  return DIRS[word] ?? word;
}

/** Where a room's exit leads, if it has one that way. */
function exitTo(ctx: ScriptContext, room: string, dir: string): string | undefined {
  const exit = ctx.world.rooms[room]?.exits[dir];
  return exit === undefined ? undefined : exitTarget(exit);
}

export const robotWorld: World = {
  style: 'infocom',
  startRoom: 'low_room',
  flagLabels: {},
  dialogue: {},

  // The words the robot's orders use that aren't the engine's own.
  verbs: {
    follow: { words: ['follow', 'chase', 'pursue'], target: 'optional' },
    eat: { words: ['eat', 'consume', 'taste'], target: 'required' },
    drink: { words: ['drink', 'imbibe', 'swallow'], target: 'required' },
    lift: { words: ['lift', 'raise'], target: 'required' },
  },

  rooms: {
    low_room: {
      name: 'Low Room',
      description: 'You are in a circular room with a low ceiling. There are exits to the east and southeast.',
      exits: { east: 'machine_room', southeast: 'tea_room', out: 'tea_room' },
      items: ['paper'],
      npcs: ['robot'],
      // MAGNET-ROOM-FCN's M-ENTER while the carousel is flipped.
      onEnter: [{ if: 'flag:carousel_flip', then: 'compass_spins', repeat: true }],
      // MAGNET-ROOM-EXIT: flipped, the player can't get their bearings (the robot can).
      instead: { go: [{ if: 'flag:carousel_flip', then: 'magnet_walk' }] },
    },
    machine_room: {
      name: 'Machine Room',
      description:
        'This is a large room full of assorted heavy machinery, whirring noisily.\nThe room smells of burned resistors. Along one wall are three buttons\nwhich are, respectively, round, triangular, and square. Naturally,\nabove these buttons are instructions written in EBCDIC. A large sign\nin English above all the buttons says\n       “DANGER -- HIGH VOLTAGE”\nThere are exits to the west and the south.',
      exits: { west: 'low_room', south: 'dingy_closet' },
      items: ['triangular_button', 'square_button', 'round_button'],
      npcs: [],
      onEnter: [],
    },
    dingy_closet: {
      name: 'Dingy Closet',
      description:
        'This is a dingy closet adjacent to a larger room to the north.\nChiselled into a wall are these words:\n\n     Protected by\n       FROBOZZ\n Magic Alarm Company\n  (Hello, footpad!)\n\nThere doesn’t seem to be any footpad here, however.',
      exits: { north: 'machine_room', out: 'machine_room' },
      items: ['sphere'],
      npcs: [],
      onEnter: [],
    },
    in_cage: {
      name: 'Cage',
      description: 'You are trapped inside a solid steel cage.',
      exits: {},
      items: [],
      npcs: [],
      onEnter: [],
    },
    tea_room: {
      name: 'Tea Room',
      description:
        'This is a small room containing a large oblong table, no doubt set\nfor afternoon tea. It is clear from the\nobjects on the table that the users were indeed mad. In the eastern\ncorner of the room is a small hole (no more than four inches high).\nThere are passageways leading away to the west and the northwest.',
      exits: { northwest: 'low_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    carousel_room: {
      name: 'Carousel Room',
      dark: true,
      description: 'You are in a large circular room whose high ceiling is lost in gloom. Eight\nidentical passages leave the room.',
      descriptions: [
        {
          if: '!flag:carousel_flip',
          text: 'You are in a large circular room whose high ceiling is lost in gloom. Eight\nidentical passages leave the room.\nA loud whirring sound comes from all around, and you feel\nsort of disoriented in here.',
        },
      ],
      exits: {
        north: 'marble_hall',
        northeast: 'stream_path',
        east: 'topiary',
        southeast: 'riddle_room',
        south: 'menhir_room',
        southwest: 'cobwebby_corridor',
        west: 'room_8',
        northwest: 'cool_room',
      },
      items: ['iron_box'],
      npcs: [],
      onEnter: [],
      // CAROUSEL-ROOM-FCN's M-BEG: until the triangular button flips it, the passages are a muddle.
      instead: { go: [{ if: '!flag:carousel_flip', then: 'carousel_walk' }] },
    },
    riddle_room: {
      name: 'Riddle Room',
      dark: true,
      description:
        'This is a room which is bare on all sides. There is an exit down in\nthe northwest corner of the room. To the east is a great open door made of\nstone. Above the stone, the following words are written: “No man shall\npass this door without solving this riddle:\n\n  What is tall as a house,\n    round as a cup,\n      and all the king’s horses\n        can’t draw it up?”',
      exits: { down: 'carousel_room', northwest: 'carousel_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    marble_hall: {
      name: 'Marble Hall',
      dark: true,
      description:
        'This is an arched hall of fine marble. The hall stops abruptly\nto the north at a ford across a stream, where the marble is cracked and\nbroken. Perhaps a flood or collapse of the cave was responsible. To\nthe south the hall opens into a large room. There is rather annoying\nwhirring sound coming from that room.',
      exits: { south: 'carousel_room', east: { denial: 'That’s a wall there.' } },
      items: ['brick'],
      npcs: [],
      onEnter: [],
    },
    // The carousel's other passages, bare.
    stream_path: {
      name: 'Path Near Stream',
      dark: true,
      description:
        'The path follows the south edge of a deep ravine and heads northeast.\nA tunnel heads southwest, narrowing to a rather tight crawl. A\nfaint whirring sound can be heard in that direction. On the east is a\nruined archway choked with vegetation.',
      exits: { southwest: 'carousel_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    topiary: {
      name: 'Topiary',
      description:
        'This is the southern end of a formal garden. Hedges hide the cavern\nwalls and mosses provide dim illumination. Fantastically shaped hedges\nand bushes are arrayed with geometric precision. They have not recently\nbeen clipped, but you can discern creatures in the shapes of the bushes:\nThere is a dragon, a unicorn, a great serpent, a huge misshapen dog, and\nseveral human figures. On the west side of the garden the path\nleads through a rose arbor into a tunnel.',
      exits: { west: 'carousel_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    menhir_room: {
      name: 'Menhir Room',
      dark: true,
      description:
        'This is a large room which was evidently used once as a quarry. Many\nlarge limestone chunks lie helter-skelter around the room. Some are\nrough-hewn and unworked, others smooth and well-finished. One side of\nthe room appears to have been used to quarry building blocks, the other\nto produce menhirs (standing stones). Obvious passages lead north and\nsouth.',
      exits: { north: 'carousel_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    cobwebby_corridor: {
      name: 'Cobwebby Corridor',
      dark: true,
      description:
        'A winding corridor is filled with cobwebs. Some\nare broken and the dust on the floor is disturbed. The trend of the\ntwists and turns is northeast to southwest. On the north side of one\ntwist, high up, is a narrow crack.',
      exits: { northeast: 'carousel_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    room_8: {
      name: 'Room 8',
      dark: true,
      description: 'This is a small chamber carved out of the rock at the end of a short crawl.\nOn the wall is crudely chiseled the number “8”.',
      exits: { east: 'carousel_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    cool_room: {
      name: 'Cool Room',
      dark: true,
      description:
        'The room is cool and damp. The air is misty. A twisty path from the\nsoutheast splits here toward a wide northerly stone bridge, and a narrow\nwesterly tunnel. It is from the latter\nthat the mist and chill seem to originate.',
      exits: { southeast: 'carousel_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
  },

  items: {
    paper: {
      name: 'green piece of paper',
      aliases: ['paper', 'piece', 'instructions', 'green paper'],
      description: 'There’s nothing special about the green piece of paper.',
      roomDescription: 'There is a green piece of paper here.',
      text: '!!  FROBOZZ MAGIC ROBOT COMPANY  !!\n\nHello, Master!\n\n   I am a late-model robot, trained at GUE Tech to perform various\nsimple household functions.\n\n   To activate me, say the following:\n\n        >ROBOT, <things to do>\n\nAt your service!',
      portable: true,
      burnable: true,
      size: 3,
      tags: [],
    },
    round_button: { name: 'round button', aliases: ['button'], description: 'There’s nothing special about the round button.', scenery: true, portable: false, tags: [] },
    square_button: { name: 'square button', aliases: ['button'], description: 'There’s nothing special about the square button.', scenery: true, portable: false, tags: [] },
    triangular_button: { name: 'triangular button', aliases: ['button'], description: 'There’s nothing special about the triangular button.', scenery: true, portable: false, tags: [] },
    sphere: {
      name: 'red crystal sphere',
      aliases: ['sphere', 'ball', 'palantir', 'crystal sphere', 'red sphere'],
      description: 'There’s nothing special about the red crystal sphere.',
      roomDescription: 'There is a beautiful red crystal sphere here.',
      portable: true,
      size: 10,
      treasure: 20,
      tags: [],
      // SPHERE-FCN: the alarm, until the robot has thrown the cage off.
      instead: { take: [{ if: '!flag:cage_solved', then: 'cage_falls' }] },
    },
    cage: {
      name: 'solid steel cage',
      aliases: ['cage', 'steel cage'],
      description: 'There’s nothing special about the solid steel cage.',
      scenery: true,
      portable: false,
      tags: [],
    },
    mangled_cage: {
      name: 'mangled cage',
      aliases: ['cage', 'steel cage', 'mangled steel cage'],
      description: 'There’s nothing special about the mangled cage.',
      roomDescription: 'There is a mangled steel cage here.',
      portable: true,
      size: 60,
      tags: [],
    },
    teapot: { name: 'china teapot', aliases: ['teapot', 'pot', 'tea pot'], description: 'There’s nothing special about the china teapot.', portable: true, tags: [] },
    lamp: { name: 'lamp', aliases: ['lantern', 'light', 'brass lamp'], description: 'The lamp is on.', portable: true, switchable: true, light: true, size: 15, tags: [] },
    iron_box: {
      name: 'steel box',
      aliases: ['box', 'dented box', 'dented steel box'],
      description: 'There’s nothing special about the steel box.',
      roomDescription: 'There is a dented steel box here.',
      portable: true,
      size: 40,
      container: { openable: true, weight: 20 },
      tags: [],
    },
    brick: {
      name: 'brick',
      aliases: ['square brick', 'clay brick'],
      description: 'There’s nothing special about the brick.',
      roomDescription: 'There is a square brick here which feels like clay.',
      portable: true,
      burnable: true,
      size: 9,
      tags: [],
    },
  },

  npcs: {
    robot: {
      name: 'robot',
      aliases: ['r2d2', 'c3po', 'robby'],
      description: 'There is a robot here.',
      // ROBOT-FCN with the robot as WINNER. GO and TAKE are the engine's own, after the robot's
      // acknowledgement; the rest answer here. (Its 2% “Buzz! Buzz! Buzz!” isn't modelled.)
      obeys: ['go', 'take'],
      obeyReplies: { go: 'The robot leaves the room.', take: 'Taken.' },
      refuseOrder: '“My programming is insufficient to allow me to perform that task.”',
      orders: {
        go: [{ then: 'robot_ack', continue: true }],
        take: [{ if: 'target:cage', then: 'cage_lifted' }, { then: 'robot_ack', continue: true }],
        lift: [{ if: 'target:cage', then: 'cage_lifted' }],
        drop: [{ then: 'robot_drop' }],
        push: [
          { if: 'target:square_button & !flag:carousel_zoom', then: 'zoom_up' },
          { if: 'target:square_button', then: 'push_nothing' },
          { if: 'target:round_button & flag:carousel_zoom', then: 'zoom_down' },
          { if: 'target:round_button', then: 'push_nothing' },
          { if: 'target:triangular_button', then: 'carousel_flips' },
        ],
        follow: [{ say: ['“My memory circuits are not that advanced. I can move as directed, though.”'] }],
        eat: [{ say: ['“I am sorry but that is difficult for a being with no mouth.”'] }],
        drink: [{ say: ['“I am sorry but that is difficult for a being with no mouth.”'] }],
        read: [{ say: ['“My vision is not sufficiently acute to do that.”'] }],
        examine: [{ say: ['“My vision is not sufficiently acute to do that.”'] }],
      },
      // ROBOT-FCN with the player as WINNER: GIVE X TO ROBOT.
      instead: { give: [{ then: 'robot_gift' }] },
    },
  },

  events: {
    // ROBOT-FCN's acknowledgement of a walk, a take or a push: PROB 80.
    robot_ack: [{ chance: 80, then: ['“Whirr, buzz, click!”'], else: ['“Buzz, click, whirr!”'] }],
    robot_drop: [{ script: 'robotDrop' }],
    robot_gift: [{ script: 'robotGift' }],
    // BUTTONS, pushed by the robot.
    zoom_up: [{ run: 'robot_ack' }, { set: 'carousel_zoom' }, 'The whirring increases in intensity.'],
    zoom_down: [{ run: 'robot_ack' }, { clear: 'carousel_zoom' }, 'The whirring decreases in intensity.'],
    push_nothing: [{ run: 'robot_ack' }, 'Nothing seems to happen.'],
    carousel_flips: [
      { run: 'robot_ack' },
      { if: 'flag:carousel_flip', then: [{ clear: 'carousel_flip' }], else: [{ set: 'carousel_flip' }] },
      {
        if: 'inside:iron_box:carousel_room',
        then: [
          'A dull thump is heard in the distance.',
          // The box shows while the carousel is stopped; the room's full description comes back with it.
          { if: 'flag:carousel_flip', then: [{ reveal: 'iron_box' }, { unvisit: 'carousel_room' }], else: [{ hide: 'iron_box' }] },
        ],
        else: ['Click.'],
      },
    ],
    // SPHERE-FCN, the player reaching for the sphere.
    cage_falls: [
      'As you reach for the sphere, a solid steel cage falls from the ceiling\nto entrap you. To make matters worse, poisonous gas starts coming\ninto the room.',
      '',
      { if: 'with:robot', then: [{ moveNpc: 'robot', to: 'in_cage' }, { npcState: 'robot', scenery: true }] },
      { go: 'in_cage' },
      { move: 'cage', to: 'in_cage' },
      { schedule: 'sphere_gas', in: 6 },
    ],
    // I-SPHERE.
    sphere_gas: [
      { if: 'in:dingy_closet', then: [{ die: 'Time passes...and you die from some obscure poisoning.' }] },
      { if: 'in:in_cage', then: [{ die: 'Time passes...and you die from some obscure poisoning.' }] },
    ],
    // ROBOT-FCN: RAISE (or TAKE) CAGE.
    cage_lifted: [
      'The cage shakes and is hurled across the room. It’s hard to say, but the robot appears to be smiling.',
      '',
      { cancel: 'sphere_gas' },
      { go: 'dingy_closet' },
      { move: 'mangled_cage', to: 'dingy_closet' },
      { npcState: 'robot', scenery: false },
      { moveNpc: 'robot', to: 'dingy_closet' },
      { set: 'cage_solved' },
    ],
    // MAGNET-ROOM-FCN's M-ENTER, flipped.
    compass_spins: [
      'As you enter, your compass starts spinning wildly.',
      { if: '!flag:compass_kludge', then: ['What compass, you ask? The one which allows you to specify compass directions for movement.', { set: 'compass_kludge' }] },
    ],
    magnet_walk: [{ script: 'magnetWalk' }],
    carousel_walk: [{ script: 'carouselWalk' }],
  },

  scripts: {
    // ROBOT-FCN's DROP: only what it holds.
    robotDrop: (ctx) => {
      const thing = ctx.command?.target;
      if (!thing || ctx.holder(thing) !== 'robot') return ['“Click! I don’t have that. Buzz! Whirr!”'];
      return ['“Whirr, buzz, click!”', { move: thing, to: 'here' }, 'Dropped.'];
    },
    robotGift: (ctx) => {
      const thing = ctx.command?.target;
      if (!thing) return;
      return [{ move: thing, to: 'robot' }, `The robot gladly takes the ${ctx.world.items[thing]?.name ?? thing} and nods his head-like appendage in thanks.`];
    },
    // MAGNET-ROOM-EXIT, flipped: any of its exits is a coin toss between two rooms.
    magnetWalk: (ctx) => {
      if (!MAGNET.includes(typedDirection(ctx))) return [NO_WAY];
      return ['You cannot get your bearings...', '', { go: ctx.roll(100) <= 50 ? 'machine_room' : 'tea_room' }];
    },
    // CAROUSEL-ROOM-FCN's M-BEG: up and down are as ever; any other way, 80% of the time
    // (always, for west), a passage at random.
    carouselWalk: (ctx) => {
      let dir = typedDirection(ctx);
      if (dir === 'up' || dir === 'down' || !(dir === 'out' || dir in ctx.world.rooms.carousel_room.exits)) return [NO_WAY];
      const steps: EventStep[] = dir === 'out' ? ['Feeling dizzy, you pick a direction at random.', ''] : ['You’re not sure which direction is which. This\nroom is very disorienting.', ''];
      if (dir === 'out') dir = 'east';
      if (dir === 'west' || ctx.roll(100) <= 80) dir = EIGHT[ctx.roll(7) - 1];
      const to = exitTo(ctx, 'carousel_room', dir);
      return to ? [...steps, { go: to }] : [...steps, NO_WAY];
    },
  },
};

/** Things where the original has them at a slice's start, from a fresh game. */
function place(state: GameState, opts: { room: string; visited: string[]; carrying: string[]; flags?: string[]; boxShown?: boolean }): void {
  state.currentRoom = opts.room;
  state.visited = [...opts.visited];
  for (const id of opts.carrying) moveItem(state, id, PLAYER);
  state.itemState.lamp = { ...state.itemState.lamp, on: true };
  for (const id of opts.carrying) state.itemState[id] = { ...state.itemState[id], moved: true };
  for (const f of opts.flags ?? []) state.flags[f] = true;
  // The steel box is invisible until the carousel stops.
  state.itemState.iron_box = { ...state.itemState.iron_box, hidden: !opts.boxShown };
}

/** In the Low Room with the robot, carrying the (emptied) teapot and the lit lamp. */
export function buildLowRoom(state: GameState): void {
  place(state, { room: 'low_room', visited: ['carousel_room', 'riddle_room', 'tea_room', 'low_room'], carrying: ['teapot', 'lamp'] });
}

/** Just into the Carousel Room for the first time, still spinning. */
export function buildCarousel(state: GameState): void {
  place(state, { room: 'carousel_room', visited: ['carousel_room'], carrying: ['teapot', 'lamp'] });
}

/** Back in the Carousel Room after the robot pushed the triangular button: stopped, the box showing. */
export function buildStoppedCarousel(state: GameState): void {
  place(state, { room: 'carousel_room', visited: ['riddle_room', 'tea_room', 'low_room', 'machine_room', 'carousel_room'], carrying: ['teapot', 'lamp'], flags: ['carousel_flip', 'compass_kludge'], boxShown: true });
  state.npcs = { robot: { room: 'machine_room' } };
}
