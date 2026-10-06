import type { EventStep, World } from '@/types/world';

/**
 * Zork I, rebuilt as a native Brass Lantern world: the house and the forest
 * above ground (engine-parity stage 1), and the cellar, the gallery and the
 * studio below (stage 2). Text adapted from Infocom's
 * source (historicalsource/zork1, MIT License, Copyright (c) 2025 Microsoft);
 * tests/worlds/zork1-diff.test.ts plays it against the original story file.
 *
 * Rooms' `items` and items' `contains` list things in the reverse of the order
 * Zork prints them: Infocom style lists newest first, as Zork does.
 */

const CARRYING = 'You can’t get up there with what you’re carrying.';
const GRUE = 'Oh, no! You have walked into the slavering fangs of a lurking grue!';
const OFF_MAP = 'That part of the map isn’t built yet.';
const NO_TREE = 'There is no tree here suitable for climbing.';
const BOARDED = 'The windows are all boarded.';

const KITCHEN =
  'You are in the kitchen of the white house. A table seems to have been used recently for the preparation of food. A passage leads to the west and a dark staircase can be seen leading upward. A dark chimney leads down and to the east is a small window which is ';
const BEHIND = 'You are behind the white house. A path leads into the forest to the east. In one corner of the house there is a small window which is ';
const LIVING =
  'You are in the living room. There is a doorway to the east, a wooden door with strange gothic lettering to the west, which appears to be nailed shut, a trophy case, ';
const CLEARING = 'You are in a clearing, with a forest surrounding you on all sides. A path leads south.';

const outside = ['white_house', 'forest'];
const inForest = ['tree', 'forest', 'white_house'];

export const zork1: World = {
  style: 'infocom',
  title: 'ZORK I: The Great Underground Empire',
  credits: [
    'Copyright (c) 1981, 1982, 1983 Infocom, Inc. All rights reserved.',
    'ZORK is a registered trademark of Infocom, Inc.',
  ],
  startRoom: 'west_of_house',
  emptyInventory: 'You are empty-handed.',

  rooms: {
    west_of_house: {
      name: 'West of House',
      description: 'You are standing in an open field west of a white house, with a boarded front door.',
      exits: {
        north: 'north_of_house',
        south: 'south_of_house',
        northeast: 'north_of_house',
        southeast: 'south_of_house',
        west: 'forest_1',
        east: { denial: 'The door is boarded and you can’t remove the boards.' },
      },
      items: ['mailbox', 'front_door'],
      npcs: [],
      onEnter: [],
      scenery: [...outside, 'board'],
    },
    north_of_house: {
      name: 'North of House',
      description:
        'You are facing the north side of a white house. There is no door here, and all the windows are boarded up. To the north a narrow path winds through the trees.',
      exits: {
        southwest: 'west_of_house',
        southeast: 'east_of_house',
        west: 'west_of_house',
        east: 'east_of_house',
        north: 'path',
        south: { denial: BOARDED },
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: [...outside, 'boarded_window', 'board'],
    },
    south_of_house: {
      name: 'South of House',
      description: 'You are facing the south side of a white house. There is no door here, and all the windows are boarded.',
      exits: {
        west: 'west_of_house',
        east: 'east_of_house',
        northeast: 'east_of_house',
        northwest: 'west_of_house',
        south: 'forest_3',
        north: { denial: BOARDED },
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: [...outside, 'boarded_window', 'board'],
    },
    east_of_house: {
      name: 'Behind House',
      description: `${BEHIND}slightly ajar.`,
      descriptions: [{ if: 'open:kitchen_window', text: `${BEHIND}open.` }],
      exits: {
        north: 'north_of_house',
        south: 'south_of_house',
        southwest: 'south_of_house',
        northwest: 'north_of_house',
        east: 'clearing',
        west: { to: 'kitchen', door: 'kitchen_window' },
        in: { to: 'kitchen', door: 'kitchen_window' },
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: [...outside, 'kitchen_window'],
    },
    forest_1: {
      name: 'Forest',
      description: 'This is a forest, with trees in all directions. To the east, there appears to be sunlight.',
      exits: {
        up: { denial: NO_TREE },
        north: 'grating_clearing',
        east: 'path',
        south: 'forest_3',
        west: { denial: 'You would need a machete to go further west.' },
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: inForest,
    },
    forest_2: {
      name: 'Forest',
      description: 'This is a dimly lit forest, with large trees all around.',
      exits: {
        up: { denial: NO_TREE },
        north: { denial: 'The forest becomes impenetrable to the north.' },
        east: { denial: OFF_MAP },
        south: 'clearing',
        west: 'path',
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: inForest,
    },
    forest_3: {
      name: 'Forest',
      description: 'This is a dimly lit forest, with large trees all around.',
      exits: {
        up: { denial: NO_TREE },
        north: 'clearing',
        east: { denial: 'The rank undergrowth prevents eastward movement.' },
        south: { denial: 'Storm-tossed trees block your way.' },
        west: 'forest_1',
        northwest: 'south_of_house',
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: inForest,
    },
    path: {
      name: 'Forest Path',
      description:
        'This is a path winding through a dimly lit forest. The path heads north-south here. One particularly large tree with some low branches stands at the edge of the path.',
      exits: { up: 'up_a_tree', north: 'grating_clearing', east: 'forest_2', south: 'north_of_house', west: 'forest_1' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: inForest,
    },
    up_a_tree: {
      name: 'Up a Tree',
      description:
        'You are about 10 feet above the ground nestled among some large branches. The nearest branch above you is above your reach.',
      exits: { down: 'path', up: { denial: 'You cannot climb any higher.' } },
      items: ['nest'],
      npcs: [],
      onEnter: [],
      scenery: inForest,
    },
    grating_clearing: {
      name: 'Clearing',
      description: CLEARING,
      descriptions: [{ if: 'flag:grate_revealed', text: `${CLEARING} There is a grating securely fastened into the ground.` }],
      exits: {
        north: { denial: 'The forest becomes impenetrable to the north.' },
        east: 'forest_2',
        west: 'forest_1',
        south: 'path',
        down: { if: 'flag:grate_revealed', door: 'grate' },
      },
      items: ['leaves'],
      npcs: [],
      onEnter: [],
      scenery: ['white_house', 'grate'],
    },
    clearing: {
      name: 'Clearing',
      description: 'You are in a small clearing in a well marked forest path that extends to the east and west.',
      exits: {
        up: { denial: NO_TREE },
        east: { denial: OFF_MAP },
        north: 'forest_2',
        south: 'forest_3',
        west: 'east_of_house',
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: inForest,
    },
    kitchen: {
      name: 'Kitchen',
      description: `${KITCHEN}slightly ajar.`,
      descriptions: [{ if: 'open:kitchen_window', text: `${KITCHEN}open.` }],
      exits: {
        east: { to: 'east_of_house', door: 'kitchen_window' },
        out: { to: 'east_of_house', door: 'kitchen_window' },
        west: 'living_room',
        up: 'attic',
        down: { denial: 'Only Santa Claus climbs down chimneys.' },
      },
      items: ['kitchen_table'],
      npcs: [],
      // Zork's VALUE 10: points the first time you come in.
      onEnter: [{ if: '!flag:kitchen_visited', then: 'kitchen_points' }],
      scenery: ['kitchen_window', 'chimney'],
    },
    attic: {
      name: 'Attic',
      description: 'This is the attic. The only exit is a stairway leading down.',
      dark: true,
      exits: { down: 'kitchen' },
      items: ['attic_table', 'rope'],
      npcs: [],
      onEnter: [],
    },
    living_room: {
      name: 'Living Room',
      description: `${LIVING}and a large oriental rug in the center of the room.`,
      descriptions: [
        { if: 'flag:rug_moved & open:trap_door', text: `${LIVING}and a rug lying beside an open trap door.` },
        { if: 'flag:rug_moved', text: `${LIVING}and a closed trap door at your feet.` },
      ],
      exits: {
        east: 'kitchen',
        west: { denial: 'The door is nailed shut.' },
        down: { to: 'cellar', if: 'flag:rug_moved', door: 'trap_door' },
      },
      items: ['trophy_case', 'lamp', 'sword', 'rug'],
      npcs: [],
      onEnter: [],
      scenery: ['wooden_door', 'trap_door'],
    },
    cellar: {
      name: 'Cellar',
      description:
        'You are in a dark and damp cellar with a narrow passageway leading north, and a crawlway to the south. On the west is the bottom of a steep metal ramp which is unclimbable.',
      dark: true,
      exits: {
        north: 'troll_room',
        south: 'east_of_chasm',
        up: { to: 'living_room', door: 'trap_door' },
        west: { denial: 'You try to ascend the ramp, but it is impossible, and you slide back down.' },
      },
      items: [],
      npcs: [],
      // The first time down, the trap door slams behind you. Zork's VALUE 25: points for getting here.
      onEnter: [
        // CELLAR-FCN: slams whenever it's open and “someone” hasn't barred it since you last came round by the chimney.
        { if: 'open:trap_door & !flag:trap_door_barred', then: 'trap_door_slams', repeat: true },
        { if: '!flag:cellar_visited', then: 'cellar_points' },
      ],
      scenery: ['trap_door'],
    },
    troll_room: {
      name: 'The Troll Room',
      description:
        'This is a small room with passages to the east and south and a forbidding hole leading west. Bloodstains and deep scratches (perhaps made by an axe) mar the walls.',
      dark: true,
      exits: {
        south: 'cellar',
        east: { to: 'ew_passage', denials: [{ if: 'awake:troll', text: 'The troll fends you off with a menacing gesture.' }] },
        west: { denials: [{ if: 'awake:troll', text: 'The troll fends you off with a menacing gesture.' }], denial: 'The maze isn’t built yet.' },
      },
      items: [],
      npcs: ['troll'],
      onEnter: [],
    },
    ew_passage: {
      name: 'East-West Passage',
      description: 'This is a narrow east-west passageway. There is a narrow stairway leading down at the north end of the room.',
      dark: true,
      exits: {
        east: 'round_room',
        west: 'troll_room',
        down: { denial: 'That part of the Great Underground Empire isn’t built yet.' },
        north: { denial: 'That part of the Great Underground Empire isn’t built yet.' },
      },
      items: [],
      npcs: [],
      // Zork's VALUE 5.
      onEnter: [{ if: '!flag:ew_passage_visited', then: 'ew_passage_points' }],
    },
    round_room: {
      name: 'Round Room',
      description: 'This is a circular stone room with passages in all directions. Several of them have unfortunately been blocked by cave-ins.',
      dark: true,
      exits: {
        west: 'ew_passage',
        east: { denial: 'That part of the Great Underground Empire isn’t built yet.' },
        north: { denial: 'That part of the Great Underground Empire isn’t built yet.' },
        south: { denial: 'That part of the Great Underground Empire isn’t built yet.' },
        southeast: { denial: 'That part of the Great Underground Empire isn’t built yet.' },
      },
      items: [],
      npcs: [],
      onEnter: [],
    },
    east_of_chasm: {
      name: 'East of Chasm',
      description:
        'You are on the east edge of a chasm, the bottom of which cannot be seen. A narrow passage goes north, and the path you are on continues to the east.',
      dark: true,
      exits: {
        north: 'cellar',
        east: 'gallery',
        down: { denial: 'The chasm probably leads straight to the infernal regions.' },
      },
      items: [],
      npcs: [],
      onEnter: [],
    },
    gallery: {
      name: 'Gallery',
      description:
        'This is an art gallery. Most of the paintings have been stolen by vandals with exceptional taste. The vandals left through either the north or west exits.',
      exits: { west: 'east_of_chasm', north: 'studio' },
      items: ['painting'],
      npcs: [],
      onEnter: [],
    },
    studio: {
      name: 'Studio',
      description:
        'This appears to have been an artist’s studio. The walls and floors are splattered with paints of 69 different colors. Strangely enough, nothing of value is hanging here. At the south end of the room is an open door (also covered with paint). A dark and narrow chimney leads up from a fireplace; although you might be able to get up it, it seems unlikely you could get back down.',
      dark: true,
      exits: {
        south: 'gallery',
        up: {
          to: 'kitchen',
          // UP-CHIMNEY-FUNCTION: coming round this way with the trap door shut un-bars it.
          then: 'chimney_climbed',
          denials: [
            { if: 'carrying<=0', text: 'Going up empty-handed is a bad idea.' },
            { if: '!has:lamp', text: CARRYING },
            { if: 'carrying>2', text: CARRYING },
          ],
        },
      },
      items: ['owners_manual'],
      npcs: [],
      onEnter: [],
      scenery: ['chimney'],
    },
  },

  items: {
    // West of House
    mailbox: {
      name: 'small mailbox',
      aliases: ['mailbox', 'box'],
      description: 'The small mailbox is closed.',
      portable: false,
      refusal: 'It is securely anchored.',
      tags: [],
      container: { openable: true, weight: 10 },
      contains: ['leaflet'],
    },
    leaflet: {
      name: 'leaflet',
      aliases: ['advertisement', 'booklet', 'mail', 'small leaflet'],
      description: 'There’s nothing special about the leaflet.',
      roomDescription: 'A small leaflet is on the ground.',
      text: '“WELCOME TO ZORK!\n\nZORK is a game of adventure, danger, and low cunning. In it you will explore some of the most amazing territory ever seen by mortals. No computer should be without one!”',
      portable: true,
      tags: [],
    },
    front_door: {
      name: 'door',
      aliases: ['front door', 'boarded door'],
      description: 'There’s nothing special about the door.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { open: [{ say: ['The door cannot be opened.'] }] },
    },
    board: {
      name: 'board',
      aliases: ['boards'],
      description: 'The boards are securely fastened.',
      portable: false,
      refusal: 'The boards are securely fastened.',
      tags: [],
    },
    boarded_window: {
      name: 'boarded window',
      aliases: ['window'],
      description: 'There’s nothing special about the boarded window.',
      portable: false,
      tags: [],
      instead: { open: [{ say: ['The windows are boarded and can’t be opened.'] }] },
    },
    white_house: {
      name: 'white house',
      aliases: ['house', 'beautiful house', 'colonial house'],
      description:
        'The house is a beautiful colonial house which is painted white. It is clear that the owners must have been extremely wealthy.',
      portable: false,
      tags: [],
    },
    forest: {
      name: 'forest',
      aliases: ['trees', 'pines', 'hemlocks'],
      description: 'There’s nothing special about the forest.',
      portable: false,
      tags: [],
    },
    tree: {
      name: 'tree',
      aliases: ['branch', 'large tree'],
      description: 'There’s nothing special about the tree.',
      portable: false,
      tags: [],
    },

    // Behind House and the kitchen
    kitchen_window: {
      name: 'kitchen window',
      aliases: ['window', 'small window'],
      description: 'The window is slightly ajar, but not enough to allow entry.',
      portable: false,
      tags: [],
      door: true,
      container: {
        openable: true,
        opened: 'With great effort, you open the window far enough to allow entry.',
        closed: 'The window closes (more easily than it opened).',
      },
    },
    kitchen_table: {
      name: 'kitchen table',
      aliases: ['table'],
      description: 'There’s nothing special about the kitchen table.',
      portable: false,
      tags: [],
      scenery: true,
      surface: true,
      contains: ['sack', 'bottle'],
    },
    sack: {
      name: 'brown sack',
      aliases: ['bag', 'sack', 'elongated sack', 'smelly sack'],
      description: 'The brown sack is closed.',
      initialDescription: 'On the table is an elongated brown sack, smelling of hot peppers.',
      portable: true,
      size: 9,
      tags: [],
      container: { openable: true, weight: 9 },
      contains: ['lunch', 'garlic'],
    },
    lunch: {
      name: 'lunch',
      aliases: ['food', 'sandwich', 'dinner', 'hot pepper sandwich'],
      description: 'There’s nothing special about the lunch.',
      roomDescription: 'A hot pepper sandwich is here.',
      portable: true,
      tags: [],
    },
    garlic: {
      name: 'clove of garlic',
      aliases: ['garlic', 'clove'],
      description: 'There’s nothing special about the clove of garlic.',
      portable: true,
      size: 4,
      tags: [],
    },
    bottle: {
      name: 'glass bottle',
      aliases: ['bottle', 'clear bottle', 'container'],
      description: 'The glass bottle contains:\n  A quantity of water',
      initialDescription: 'A bottle is sitting on the table.',
      portable: true,
      tags: [],
      container: { openable: true, transparent: true, weight: 4 },
      contains: ['water'],
    },
    water: {
      name: 'quantity of water',
      aliases: ['water', 'liquid', 'h2o'],
      description: 'There’s nothing special about the quantity of water.',
      portable: true,
      size: 4,
      tags: [],
    },
    chimney: {
      name: 'chimney',
      aliases: ['dark chimney', 'narrow chimney'],
      description: 'There’s nothing special about the chimney.',
      portable: false,
      tags: [],
    },

    // The attic
    attic_table: {
      name: 'table',
      description: 'There’s nothing special about the table.',
      portable: false,
      tags: [],
      scenery: true,
      surface: true,
      contains: ['knife'],
    },
    rope: {
      name: 'rope',
      aliases: ['hemp', 'coil', 'large rope'],
      description: 'There’s nothing special about the rope.',
      initialDescription: 'A large coil of rope is lying in the corner.',
      portable: true,
      size: 10,
      tags: [],
    },
    knife: {
      name: 'nasty knife',
      aliases: ['knife', 'knives', 'blade', 'unrusty knife'],
      description: 'There’s nothing special about the nasty knife.',
      initialDescription: 'On a table is a nasty-looking knife.',
      weapon: true,
      portable: true,
      tags: [],
    },

    // The living room
    trophy_case: {
      name: 'trophy case',
      aliases: ['case'],
      // Empty, so EXAMINE lists the treasures inside, or says the case is empty.
      description: '',
      portable: false,
      refusal: 'The trophy case is securely fastened to the wall.',
      tags: [],
      scenery: true,
      container: { openable: true, transparent: true },
      contentsHeading: 'Your collection of treasures consists of:',
    },
    lamp: {
      name: 'brass lantern',
      aliases: ['lamp', 'lantern', 'light', 'brass lamp'],
      description: 'The lamp is turned off.',
      initialDescription: 'A battery-powered brass lantern is on the trophy case.',
      roomDescription: 'There is a brass lantern (battery-powered) here.',
      portable: true,
      size: 15,
      switchable: true,
      light: true,
      home: 'living_room',
      tags: [],
      instead: {
        turn_on: [{ if: 'flag:lamp_dead', say: ['A burned-out lamp won’t light.'] }],
        examine: [{ if: 'on:lamp', say: ['The lamp is on.'] }],
      },
    },
    sword: {
      name: 'sword',
      aliases: ['orcrist', 'glamdring', 'blade', 'elvish sword', 'antique sword'],
      description: 'There’s nothing special about the sword.',
      initialDescription: 'Above the trophy case hangs an elvish sword of great antiquity.',
      weapon: true,
      portable: true,
      size: 30,
      tags: [],
    },
    axe: {
      name: 'bloody axe',
      aliases: ['axe', 'ax'],
      description: 'There’s nothing special about the bloody axe.',
      portable: true,
      size: 25,
      weapon: true,
      tags: [],
    },
    rug: {
      name: 'carpet',
      aliases: ['rug', 'oriental rug', 'large rug'],
      description: 'There’s nothing special about the carpet.',
      portable: false,
      refusal: 'The rug is extremely heavy and cannot be carried.',
      tags: [],
      scenery: true,
      instead: {
        move: [
          {
            if: 'flag:rug_moved',
            say: ['Having moved the carpet previously, you find it impossible to move it again.'],
          },
          { then: 'rug_moved' },
        ],
      },
    },
    trap_door: {
      name: 'trap door',
      aliases: ['door', 'trapdoor', 'cover', 'dusty door'],
      description: 'There’s nothing special about the trap door.',
      portable: false,
      tags: [],
      door: true,
      container: {
        openable: true,
        opened: 'The door reluctantly opens to reveal a rickety staircase descending into darkness.',
        closed: 'The door swings shut and closes.',
      },
      instead: {
        open: [
          { if: '!flag:rug_moved', say: ['You can’t see any trap door here!'] },
          { if: 'in:cellar & !open:trap_door', say: ['The door is locked from above.'] },
        ],
      },
    },
    wooden_door: {
      name: 'wooden door',
      aliases: ['door', 'lettering', 'writing', 'gothic lettering'],
      description: 'There’s nothing special about the wooden door.',
      text: 'The engravings translate to “This space intentionally left blank.”',
      portable: false,
      tags: [],
      scenery: true,
    },

    // Underground
    painting: {
      name: 'painting',
      aliases: ['art', 'canvas', 'treasure', 'beautiful painting'],
      description: 'There’s nothing special about the painting.',
      initialDescription: 'Fortunately, there is still one chance for you to be a vandal, for on the far wall is a painting of unparalleled beauty.',
      roomDescription: 'A painting by a neglected genius is here.',
      portable: true,
      size: 15,
      tags: [],
      after: { take: [{ if: '!flag:took_painting', then: 'took_painting' }] },
    },

    owners_manual: {
      name: 'ZORK owner’s manual',
      aliases: ['manual', 'piece of paper', 'paper', 'owners manual', 'small piece'],
      description: 'There’s nothing special about the ZORK owner’s manual.',
      initialDescription: 'Loosely attached to a wall is a small piece of paper.',
      text: 'Congratulations!\n\nYou are the privileged owner of ZORK I: The Great Underground Empire, a self-contained and self-maintaining universe. If used and maintained in accordance with normal operating practices for small universes, ZORK will provide many months of trouble-free operation.',
      portable: true,
      tags: [],
    },

    // The forest
    nest: {
      name: 'bird’s nest',
      aliases: ['nest', 'birds nest'],
      description: 'There’s nothing special about the bird’s nest.',
      initialDescription: 'Beside you on the branch is a small bird’s nest.',
      portable: true,
      tags: [],
      container: { weight: 20 },
      contains: ['egg'],
    },
    egg: {
      name: 'jewel-encrusted egg',
      aliases: ['egg', 'treasure', 'jeweled egg', 'encrusted egg'],
      description: 'There’s nothing special about the jewel-encrusted egg.',
      initialDescription:
        'In the bird’s nest is a large egg encrusted with precious jewels, apparently scavenged by a childless songbird. The egg is covered with fine gold inlay, and ornamented in lapis lazuli and mother-of-pearl. Unlike most eggs, this one is hinged and closed with a delicate looking clasp. The egg appears extremely fragile.',
      portable: true,
      tags: [],
      after: { take: [{ if: '!flag:took_egg', then: 'took_egg' }] },
      // Closed with a clasp; only the thief can open it without breaking it (stage 4b).
      container: { openable: true },
      contains: ['canary'],
      instead: { open: [{ say: ['You have neither the tools nor the expertise.'] }] },
    },
    canary: {
      name: 'golden clockwork canary',
      aliases: ['canary', 'clockwork canary', 'golden canary', 'gold canary'],
      description: 'There’s nothing special about the golden clockwork canary.',
      initialDescription:
        'There is a golden clockwork canary nestled in the egg. It has ruby eyes and a silver beak. Through a crystal window below its left wing you can see intricate machinery inside. It appears to have wound down.',
      portable: true,
      tags: [],
    },
    leaves: {
      name: 'pile of leaves',
      aliases: ['leaves', 'leaf', 'pile'],
      description: 'There’s nothing special about the pile of leaves.',
      roomDescription: 'On the ground is a pile of leaves.',
      portable: true,
      tags: [],
      instead: {
        move: [{ if: '!flag:grate_revealed', then: 'leaves_moved' }, { say: ['Done.'] }],
        count: [{ say: ['There are 69,105 leaves here.'] }],
      },
    },
    grate: {
      name: 'grating',
      aliases: ['grate'],
      description: 'There’s nothing special about the grating.',
      portable: false,
      tags: [],
      door: true,
      container: { openable: true, locked: true, opened: 'The grating opens.', closed: 'The grating is closed.' },
      instead: {
        open: [
          { if: '!flag:grate_revealed', say: ['You can’t see any grating here!'] },
          { say: ['The grating is locked.'] },
        ],
        examine: [{ if: '!flag:grate_revealed', say: ['You can’t see any grating here!'] }],
      },
    },
  },

  npcs: {
    troll: {
      name: 'troll',
      description: 'A nasty-looking troll, brandishing a bloody axe, blocks all passages out of the room.',
      descriptions: [
        { if: '!awake:troll', text: 'An unconscious troll is sprawled on the floor. All passages out of the room are open.' },
        { if: 'var:troll_ldesc=1', text: 'A pathetically babbling troll is here.' },
        { if: 'var:troll_ldesc=2', text: 'A troll is here.' },
      ],
      holds: ['axe'],
      combat: {
        strength: 2,
        weapon: 'axe',
        fears: { item: 'sword', by: 1 },
        wake: 25,
        firstStrike: 33,
        onBusy: 'troll_busy',
        onDeath: 'troll_drops_axe',
        onUnconscious: 'troll_drops_axe',
        onWake: 'troll_wakes',
        messages: {
          missed: [
            'The troll swings his axe, but it misses.',
            'The troll’s axe barely misses your ear.',
            'The axe sweeps past as you jump aside.',
            'The axe crashes against the rock, throwing sparks!',
          ],
          unconscious: ['The flat of the troll’s axe hits you delicately on the head, knocking you out.'],
          killed: [
            'The troll neatly removes your head.',
            'The troll’s axe stroke cleaves you from the nave to the chops.',
            'The troll’s axe removes your head.',
          ],
          lightWound: [
            'The axe gets you right in the side. Ouch!',
            'The flat of the troll’s axe skins across your forearm.',
            'The troll’s swing almost knocks you over as you barely parry in time.',
            'The troll swings his axe, and it nicks your arm as you dodge.',
          ],
          seriousWound: [
            'The troll charges, and his axe slashes you on your {weapon} arm.',
            'An axe stroke makes a deep wound in your leg.',
            'The troll’s axe swings down, gashing your shoulder.',
          ],
          stagger: [
            'The troll hits you with a glancing blow, and you are momentarily stunned.',
            'The troll swings; the blade turns on your armor but crashes broadside into your head.',
            'You stagger back under a hail of axe strokes.',
            'The troll’s mighty blow drops you to your knees.',
          ],
          loseWeapon: [
            'The axe hits your {weapon} and knocks it spinning.',
            'The troll swings, you parry, but the force of his blow knocks your {weapon} away.',
            'The axe knocks your {weapon} out of your hand. It falls to the floor.',
          ],
          hesitate: [
            'The troll hesitates, fingering his axe.',
            'The troll scratches his head ruminatively:  Might you be magically protected, he wonders?',
          ],
          sittingDuck: ['Conquering his fears, the troll puts you to death.'],
        },
      },
      instead: {
        throw: [{ then: 'troll_catches' }],
        give: [{ then: 'troll_catches' }],
        take: [{ then: 'troll_spits' }],
        move: [{ then: 'troll_spits' }],
        smash: [{ then: 'troll_laughs' }],
        listen: [{ say: ['Every so often the troll says something, probably uncomplimentary, in his guttural tongue.'] }],
      },
    },
  },
  dialogue: {
    troll: { default: 'The troll isn’t much of a conversationalist.' },
  },

  // Zork's HERO-MELEE, FIGHT-STRENGTH and CURE-WAIT.
  combat: {
    strength: { min: 2, max: 7 },
    cureWait: 30,
    messages: {
      missed: [
        'Your {weapon} misses the {defender} by an inch.',
        'A good slash, but it misses the {defender} by a mile.',
        'You charge, but the {defender} jumps nimbly aside.',
        'Clang! Crash! The {defender} parries.',
        'A quick stroke, but the {defender} is on guard.',
        'A good stroke, but it’s too slow; the {defender} dodges.',
      ],
      unconscious: [
        'Your {weapon} crashes down, knocking the {defender} into dreamland.',
        'The {defender} is battered into unconsciousness.',
        'A furious exchange, and the {defender} is knocked out!',
        'The haft of your {weapon} knocks out the {defender}.',
        'The {defender} is knocked out!',
      ],
      killed: [
        'It’s curtains for the {defender} as your {weapon} removes his head.',
        'The fatal blow strikes the {defender} square in the heart: He dies.',
        'The {defender} takes a fatal blow and slumps to the floor dead.',
      ],
      lightWound: [
        'The {defender} is struck on the arm; blood begins to trickle down.',
        'Your {weapon} pinks the {defender} on the wrist, but it’s not serious.',
        'Your stroke lands, but it was only the flat of the blade.',
        'The blow lands, making a shallow gash in the {defender}’s arm!',
      ],
      seriousWound: [
        'The {defender} receives a deep gash in his side.',
        'A savage blow on the thigh! The {defender} is stunned but can still fight!',
        'Slash! Your blow lands! That one hit an artery, it could be serious!',
        'Slash! Your stroke connects! This could be serious!',
      ],
      stagger: [
        'The {defender} is staggered, and drops to his knees.',
        'The {defender} is momentarily disoriented and can’t fight back.',
        'The force of your blow knocks the {defender} back, stunned.',
        'The {defender} is confused and can’t fight back.',
        'The quickness of your thrust knocks the {defender} back, stunned.',
      ],
      loseWeapon: [
        'The {defender}’s weapon is knocked to the floor, leaving him unarmed.',
        'The {defender} is disarmed by a subtle feint past his guard.',
      ],
    },
  },

  // Zork's LOAD-MAX, the player's own SIZE, and the fumble rule.
  carry: { limit: 100, self: 5, fumble: { over: 7, chance: 8 } },

  scripts: {
    // TROLL-FCN's F-BUSY?: picks his axe back up (75%), or cowers.
    troll_busy: (ctx) =>
      ctx.holder('axe') === 'troll_room' && ctx.roll(100) < 75
        ? [
            { move: 'axe', to: 'troll' },
            { setVar: 'troll_ldesc', to: 0 },
            ...(ctx.room() === 'troll_room'
              ? ['The troll, angered and humiliated, recovers his weapon. He appears to have an axe to grind with you.']
              : []),
          ]
        : ctx.room() === 'troll_room'
          ? [{ setVar: 'troll_ldesc', to: 1 }, 'The troll, disarmed, cowers in terror, pleading for his life in the guttural tongue of the trolls.']
          : [],
    // F-CONSCIOUS: back on his feet, and back to his axe if it's here.
    troll_wakes: (ctx) => {
      const here = ctx.room() === 'troll_room';
      const steps: EventStep[] = here ? [{ npcState: 'troll', fighting: true }, 'The troll stirs, quickly resuming a fighting stance.'] : [];
      if (ctx.holder('axe') === 'troll') return [...steps, { setVar: 'troll_ldesc', to: 0 }];
      if (ctx.holder('axe') === 'troll_room') return [...steps, { move: 'axe', to: 'troll' }, { setVar: 'troll_ldesc', to: 0 }];
      return [...steps, { setVar: 'troll_ldesc', to: 2 }];
    },
    // THROW or GIVE something to the troll.
    troll_catches: (ctx) => {
      const item = ctx.command?.target;
      if (!item) return [];
      const name = ctx.world.items[item]?.name ?? item;
      const wake: EventStep[] = [{ run: 'troll_wake_if_out' }];
      if (item === 'axe') return [...wake, { move: 'axe', to: 'troll' }, { npcState: 'troll', fighting: true }, 'The troll scratches his head in confusion, then takes the axe.'];
      const opening =
        ctx.command?.verb === 'throw'
          ? `The troll, who is remarkably coordinated, catches the ${name}`
          : 'The troll, who is not overly proud, graciously accepts the gift';
      const weapon = ['knife', 'sword', 'axe'].includes(item);
      if (weapon && ctx.roll(100) < 20) {
        return [
          ...wake,
          { move: item, to: null },
          `${opening} and eats it hungrily. Poor troll, he dies from an internal hemorrhage and his carcass disappears in a sinister black fog.`,
          { npcState: 'troll', strength: 0, fighting: false },
          { run: 'troll_drops_axe' },
        ];
      }
      if (weapon) {
        return [
          ...wake,
          { move: item, to: 'here' },
          `${opening} and, being for the moment sated, throws it back. Fortunately, the troll has poor control, and the ${name} falls to the floor. He does not look pleased.`,
          { npcState: 'troll', fighting: true },
        ];
      }
      return [...wake, { move: item, to: null }, `${opening} and not having the most discriminating tastes, gleefully eats it.`];
    },
    // F-DEAD / F-UNCONSCIOUS: the axe falls only if he was holding it.
    troll_drops_axe: (ctx) => (ctx.holder('axe') === 'troll' ? [{ move: 'axe', to: 'troll_room' }] : []),
    chimney_climbed: (ctx) => (ctx.state.itemState.trap_door?.open ? [] : [{ clear: 'trap_door_barred' }]),
    // AWAKEN: a knocked-out troll comes round when you meddle with him.
    troll_wake_if_out: (ctx) => {
      const strength = ctx.npc('troll')?.strength ?? 0;
      return strength < 0 ? [{ npcState: 'troll', strength: -strength }, { run: 'troll_wakes' }] : [];
    },
    // I-SWORD: the sword glows near living monsters, brightly beside one.
    sword_glow: (ctx) => {
      const infested = (room: string) =>
        Object.keys(ctx.world.npcs).some((id) => {
          const s = ctx.npc(id);
          const where = s?.room !== undefined ? s.room : Object.entries(ctx.world.rooms).find(([, r]) => r.npcs.includes(id))?.[0];
          return where === room && s?.strength !== 0;
        });
      const here = ctx.room();
      const next = Object.values(ctx.world.rooms[here]?.exits ?? {}).some((e) => {
        const to = typeof e === 'string' ? e : e.to;
        return to !== undefined && infested(to);
      });
      const level = infested(here) ? 2 : next ? 1 : 0;
      if (level === (ctx.state.vars?.sword_glow ?? 0)) return [];
      const line = ['Your sword is no longer glowing.', 'Your sword is glowing with a faint blue glow.', 'Your sword has begun to glow very brightly.'][level];
      return [{ setVar: 'sword_glow', to: level }, line];
    },
  },

  verbs: {
    move: { words: ['move', 'shift', 'roll'], target: 'required' },
    listen: { words: ['listen to', 'listen'], target: 'required', reply: 'At the moment, there is nothing to hear.' },
    count: { words: ['count'], target: 'required' },
    pray: { words: ['pray'], target: 'none', reply: 'If you pray enough, your prayers may be answered.' },
  },

  flagLabels: {
    'rug moved': 'rug_moved',
    'took egg': 'took_egg',
    'grate revealed': 'grate_revealed',
    'kitchen visited': 'kitchen_visited',
  },

  scoring: [
    { flag: 'kitchen_visited', points: 10 },
    { flag: 'took_egg', points: 5 },
    { flag: 'cellar_visited', points: 25 },
    { flag: 'ew_passage_visited', points: 5 },
    { flag: 'took_painting', points: 4 },
    // Treasures count while they're in the trophy case.
    { if: 'inside:painting:trophy_case', points: 6 },
  ],
  maxScore: 350,
  ranks: [
    { min: 0, title: 'Beginner' },
    { min: 26, title: 'Amateur Adventurer' },
    { min: 51, title: 'Novice Adventurer' },
    { min: 101, title: 'Junior Adventurer' },
    { min: 201, title: 'Adventurer' },
    { min: 301, title: 'Master' },
    { min: 331, title: 'Wizard' },
    { min: 350, title: 'Master Adventurer' },
  ],

  vars: { lamp_fuel: 185, sword_glow: 0, troll_ldesc: 0 },

  // Zork's LAMP-TABLE: warnings after 100, 170 and 185 lit turns; out on the next.
  daemons: [
    { if: 'on:lamp', then: [{ add: 'lamp_fuel', by: -1 }] },
    { if: 'on:lamp & var:lamp_fuel=85 & here:lamp', then: ['The lamp appears a bit dimmer.'] },
    { if: 'on:lamp & var:lamp_fuel=15 & here:lamp', then: ['The lamp is definitely dimmer now.'] },
    { if: 'on:lamp & var:lamp_fuel=0 & here:lamp', then: ['The lamp is nearly out.'] },
    { if: 'on:lamp & var:lamp_fuel<0', then: 'lamp_dies' },
    // I-SWORD, which runs after the lantern and before the fight.
    { if: 'has:sword', then: [{ script: 'sword_glow' }] },
  ],

  darkness: {
    look: 'It is pitch black. You are likely to be eaten by a grue.',
    tooDark: 'It’s too dark to see!',
    blunder: [{ chance: 80, then: [{ die: GRUE }], else: ['You can’t go that way.'] }],
  },

  death: {
    message: ['', '****  You have died  ****', ''],
    penalty: -10,
    lives: 2,
    respawn: 'forest_1',
    // JIGS-UP clears the trap door's TOUCHBIT: it slams again next time.
    then: 'death_resets',
    resurrection: [
      'Now, let’s take a look here... Well, you probably deserve another chance. I can’t quite fix you up completely, but you can’t have everything.',
    ],
    scatter: ['west_of_house', 'north_of_house', 'south_of_house', 'east_of_house', 'forest_1', 'forest_2', 'forest_3', 'path', 'clearing', 'grating_clearing'],
    final: [
      'You clearly are a suicidal maniac. We don’t allow psychotics in the cave, since they may harm other adventurers. Your remains will be installed in the Land of the Living Dead, where your fellow adventurers may gloat over them.',
    ],
  },

  quit: 'There is no quitting yet. Type EJECT to leave, or RESTART to begin again.',
  idle: 'Time passes...',

  events: {
    intro: [
      'ZORK I: The Great Underground Empire',
      'Infocom interactive fiction - a fantasy story',
      'Copyright (c) 1981, 1982, 1983, 1984, 1985, 1986 Infocom, Inc. All rights reserved.',
      'ZORK is a registered trademark of Infocom, Inc.',
      'Release 119 / Serial number 880429',
      '[A native Brass Lantern port: the house, the forest, the first rooms below and the troll. The rest comes later.]',
    ],
    rug_moved: [
      'With a great effort, the rug is moved to one side of the room, revealing the dusty cover of a closed trap door.',
      '[Flag set: rug moved]',
    ],
    took_egg: ['[Flag set: took egg]'],
    kitchen_points: ['[Flag set: kitchen visited]'],
    trap_door_slams: [{ close: 'trap_door' }, { set: 'trap_door_barred' }, 'The trap door crashes shut, and you hear someone barring it.'],
    chimney_climbed: [{ script: 'chimney_climbed' }],
    death_resets: [{ clear: 'trap_door_barred' }],
    cellar_points: [{ set: 'cellar_visited' }],
    ew_passage_points: [{ set: 'ew_passage_visited' }],
    troll_drops_axe: [{ script: 'troll_drops_axe' }],
    troll_wakes: [{ script: 'troll_wakes' }],
    troll_busy: [{ script: 'troll_busy' }],
    troll_catches: [{ script: 'troll_catches' }],
    troll_spits: [{ run: 'troll_wake_if_out' }, 'The troll spits in your face, grunting “Better luck next time” in a rather barbarous accent.'],
    troll_laughs: [{ run: 'troll_wake_if_out' }, 'The troll laughs at your puny gesture.'],
    troll_wake_if_out: [{ script: 'troll_wake_if_out' }],
    took_painting: [{ set: 'took_painting' }],
    lamp_dies: [{ switch: 'lamp', on: false }, { set: 'lamp_dead' }, 'You’d better have more light than from the brass lantern.'],
    leaves_moved: ['Done.', 'In disturbing the pile of leaves, a grating is revealed.', '[Flag set: grate revealed]'],
  },
};
