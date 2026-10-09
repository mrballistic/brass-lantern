import type { World } from '../types/world.ts';

/**
 * A three-room world that exercises most of the engine: a gated room, a use
 * rule that hands over an item, a gift, a refusal, dialogue that changes with
 * progress, a timed interruption, hints, a score and a finale.
 *
 * It's the worked example in the world-building guide, and tests/worlds/tutorial.test.ts
 * plays it to the end, so the guide can't drift from what the engine does.
 */
export const tutorial: World = {
  startRoom: 'cubicle',

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
    hallway: {
      name: 'Hallway',
      description: 'A long hallway lit by one flickering tube. Gary from Accounts is guarding the water cooler. The break room is at the end.',
      exits: {
        south: 'cubicle',
        cubicle: 'cubicle',
        north: 'break_room',
        break_room: 'break_room',
      },
      listExits: ['cubicle', 'break_room'],
      items: ['mug'],
      npcs: ['gary'],
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
  },

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
    badge: {
      name: 'badge',
      aliases: ['id', 'card'],
      description: 'Your employee badge. The photo is from a better year.',
      portable: true,
      tags: [],
    },
    stapler: {
      name: 'stapler',
      description: 'Heavy. Reliable. Faintly menacing.',
      portable: true,
      tags: ['weapon'],
    },
    mug: {
      name: 'mug',
      aliases: ['cup'],
      description: 'A mug that says WORLD’S OKAYEST EMPLOYEE.',
      portable: true,
      tags: [],
    },
    vending_machine: {
      name: 'vending machine',
      aliases: ['machine', 'vending'],
      description: 'It has your pretzels. It knows it has your pretzels.',
      portable: false,
      refusal: 'It weighs four hundred pounds and has no intention of going anywhere.',
      tags: [],
    },
  },

  npcs: {
    gary: {
      name: 'Gary',
      article: '',
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

  flagLabels: {
    'drawer open': 'drawer_open',
    'gary is happy': 'gary_happy',
    'saw the pretzels': 'saw_pretzels',
    'lunch freed': 'lunch_freed',
  },

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

  ranks: [
    { min: 0, title: 'Intern' },
    { min: 50, title: 'Lunch Liberator' },
  ],

  confused: ['The office hums, uncomprehending. (Type HELP.)'],

  ambient: [
    {
      if: 'in:break_room & !flag:lunch_freed',
      every: 2,
      lines: ['The vending machine hums, smug.', 'The pretzels sway, just out of reach.'],
    },
  ],

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
    see_pretzels: [
      '“So close,” you whisper to the pretzels.',
      '[Flag set: Saw the pretzels]',
    ],
    hurt_hand: ['🤜 You punch the vending machine. The vending machine wins.'],
    free_lunch: [
      '🔨 You bring the stapler down on the side of the machine.',
      '💥 The spiral turns. The pretzels fall.',
      '[Flag set: Lunch freed]',
    ],
    ending_with_gary: ['“Gary gives you a thumbs-up from the hallway. You share the pretzels. It is a good lunch.”'],
    ending_alone: ['“You eat the pretzels alone, standing up, in the break room. It is still a good lunch.”'],
    footer: ['═══════════════════════════════', 'Type RESTART to play again.'],
  },
};
