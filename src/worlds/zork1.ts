import type { World } from '@/types/world';

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
      items: ['trophy_case', 'lamp', 'sword', 'rug', 'wooden_door'],
      npcs: [],
      onEnter: [],
      scenery: ['trap_door'],
    },
    cellar: {
      name: 'Cellar',
      description:
        'You are in a dark and damp cellar with a narrow passageway leading north, and a crawlway to the south. On the west is the bottom of a steep metal ramp which is unclimbable.',
      dark: true,
      exits: {
        north: { denial: 'The troll’s domain isn’t built yet.' },
        south: 'east_of_chasm',
        up: { to: 'living_room', door: 'trap_door' },
        west: { denial: 'You try to ascend the ramp, but it is impossible, and you slide back down.' },
      },
      items: [],
      npcs: [],
      // The first time down, the trap door slams behind you. Zork's VALUE 25: points for getting here.
      onEnter: [
        { if: 'open:trap_door', then: 'trap_door_slams' },
        { if: '!flag:cellar_visited', then: 'cellar_points' },
      ],
      scenery: ['trap_door'],
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
      container: { openable: true, capacity: 10 },
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
      tags: [],
      container: { openable: true, capacity: 9 },
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
      tags: [],
    },
    bottle: {
      name: 'glass bottle',
      aliases: ['bottle', 'clear bottle', 'container'],
      description: 'The glass bottle contains:\n  A quantity of water',
      initialDescription: 'A bottle is sitting on the table.',
      portable: true,
      tags: [],
      container: { openable: true, transparent: true, capacity: 4 },
      contains: ['water'],
    },
    water: {
      name: 'quantity of water',
      aliases: ['water', 'liquid', 'h2o'],
      description: 'There’s nothing special about the quantity of water.',
      portable: true,
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
      tags: [],
    },
    knife: {
      name: 'nasty knife',
      aliases: ['knife', 'knives', 'blade', 'unrusty knife'],
      description: 'There’s nothing special about the nasty knife.',
      initialDescription: 'On a table is a nasty-looking knife.',
      portable: true,
      tags: [],
    },

    // The living room
    trophy_case: {
      name: 'trophy case',
      aliases: ['case'],
      description: 'The trophy case is empty.',
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
      switchable: true,
      light: true,
      home: 'living_room',
      tags: [],
      instead: { turn_on: [{ if: 'flag:lamp_dead', say: ['A burned-out lamp won’t light.'] }] },
    },
    sword: {
      name: 'sword',
      aliases: ['orcrist', 'glamdring', 'blade', 'elvish sword', 'antique sword'],
      description: 'There’s nothing special about the sword.',
      initialDescription: 'Above the trophy case hangs an elvish sword of great antiquity.',
      portable: true,
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
      container: { capacity: 20 },
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

  npcs: {},
  dialogue: {},

  verbs: {
    move: { words: ['move', 'shift', 'roll'], target: 'required' },
    count: { words: ['count'], target: 'required' },
    pray: { words: ['pray'], target: 'none', reply: 'If you pray enough, your prayers may be answered.' },
    diagnose: { words: ['diagnose'], target: 'none', reply: 'You are in perfect health.' },
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

  vars: { lamp_fuel: 185 },

  // Zork's LAMP-TABLE: warnings after 100, 170 and 185 lit turns; out on the next.
  daemons: [
    { if: 'on:lamp', then: [{ add: 'lamp_fuel', by: -1 }] },
    { if: 'on:lamp & var:lamp_fuel=85 & here:lamp', then: ['The lamp appears a bit dimmer.'] },
    { if: 'on:lamp & var:lamp_fuel=15 & here:lamp', then: ['The lamp is definitely dimmer now.'] },
    { if: 'on:lamp & var:lamp_fuel=0 & here:lamp', then: ['The lamp is nearly out.'] },
    { if: 'on:lamp & var:lamp_fuel<0', then: 'lamp_dies' },
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
      '[A native Brass Lantern port: the house, the forest and the first rooms below. The troll comes later.]',
    ],
    rug_moved: [
      'With a great effort, the rug is moved to one side of the room, revealing the dusty cover of a closed trap door.',
      '[Flag set: rug moved]',
    ],
    took_egg: ['[Flag set: took egg]'],
    kitchen_points: ['[Flag set: kitchen visited]'],
    trap_door_slams: [{ close: 'trap_door' }, 'The trap door crashes shut, and you hear someone barring it.'],
    cellar_points: [{ set: 'cellar_visited' }],
    took_painting: [{ set: 'took_painting' }],
    lamp_dies: [{ switch: 'lamp', on: false }, { set: 'lamp_dead' }, 'You’d better have more light than from the brass lantern.'],
    leaves_moved: ['Done.', 'In disturbing the pile of leaves, a grating is revealed.', '[Flag set: grate revealed]'],
  },
};
