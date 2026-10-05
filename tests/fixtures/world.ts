import type { World } from '@/types/world';

/**
 * A small world that touches every engine hook, for tests that should pass
 * against any game (they mock '@/app.config' to play this). Shared with the
 * public brass-lantern repo, so keep it world-agnostic and complete: when the
 * engine grows a hook, give this world a use of it.
 */
export const fixtureWorld: World = {
  startRoom: 'bedroom',

  rooms: {
    bedroom: {
      name: 'Bedroom',
      description: 'A small bedroom.',
      exits: { west: 'living', living_room: 'living' },
      listExits: ['living_room'],
      items: ['alarm', 'bed'],
      npcs: [],
      onEnter: [],
      instead: {
        snooze: [{ if: 'flag:alarm_smashed', say: ['The alarm clock is in pieces. There is nothing left to snooze.'] }],
      },
    },
    living: {
      name: 'Living Room',
      description: 'A living room with a table by the door.',
      exits: {
        east: 'bedroom',
        bedroom: 'bedroom',
        out: 'yard',
        outside: 'yard',
        south: { to: 'yard', if: 'flag:paid', denial: 'The door is stuck.' },
      },
      listExits: ['bedroom', 'outside'],
      items: ['key', 'wallet', 'shirt'],
      npcs: [],
      onEnter: [{ if: '!flag:entered_living', then: 'enter_living' }],
    },
    yard: {
      name: 'Yard',
      description: 'A yard. The shed is to the north.',
      exits: {
        in: 'living',
        inside: 'living',
        north: 'shed',
        shed: 'shed',
        wait: 'shed',
        west: { denial: 'The fence is too high to climb.' },
        climb: { denial: 'The fence is too high to climb.' },
      },
      listExits: ['inside', 'shed'],
      items: ['bat', 'lamp', 'bell', 'fence'],
      npcs: ['neighbor'],
      onEnter: [],
      scenery: ['sky'],
    },
    shed: {
      name: 'Shed',
      description: 'A dusty shed. A crate sits in the middle.',
      firstDescription: 'You push the door open. A dusty shed, untouched for years. A crate sits in the middle.',
      descriptions: [{ if: 'open:hatch', text: 'A dusty shed. Daylight falls through the open hatch.' }],
      exits: { south: 'yard', out: 'yard', northeast: { to: 'loft', door: 'hatch' }, up: { to: 'loft', door: 'hatch' }, down: 'cellar' },
      listExits: ['out'],
      items: ['crate', 'socket', 'chest', 'jar', 'shelf'],
      npcs: [],
      onEnter: [],
      scenery: ['sky', 'hatch'],
      requires: 'has:key',
      denial: 'The shed is locked.',
    },
    cellar: {
      name: 'Cellar',
      description: 'A damp cellar.',
      dark: true,
      exits: { up: 'shed' },
      items: ['barrel'],
      npcs: [],
      onEnter: [],
    },
    loft: {
      name: 'Loft',
      description: 'A cramped loft.',
      exits: { southwest: { to: 'shed', door: 'hatch' }, down: { to: 'shed', door: 'hatch' } },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['hatch'],
    },
  },

  items: {
    hatch: { name: 'hatch', description: 'A wooden hatch in the ceiling.', portable: false, tags: [], door: true, container: { openable: true } },
    alarm: {
      name: 'alarm clock',
      aliases: ['clock'],
      description: 'A ringing alarm clock.',
      portable: false,
      refusal: 'It is screwed to the wall.',
      tags: [],
      onSmash: 'smash_alarm',
      instead: { snooze: [{ say: ['😴 You hit snooze.'] }] },
    },
    bed: {
      name: 'bed',
      description: 'An unmade bed.',
      portable: false,
      tags: [],
      onUse: [{ if: 'flag:rested', say: ['You are already rested.'] }, { then: 'rest' }],
    },
    key: { name: 'brass key', aliases: ['key'], description: 'A small brass key.', portable: true, tags: [], onTake: 'take_key' },
    wallet: {
      name: 'wallet',
      description: 'A leather wallet.',
      portable: true,
      tags: [],
      initialDescription: 'A wallet lies by the door.',
      roomDescription: 'Someone dropped a wallet here.',
    },
    shirt: { name: 'loud shirt', aliases: ['shirt'], description: 'A very loud shirt.', portable: true, tags: [], onWear: 'wear_shirt' },
    bat: {
      name: 'bat',
      aliases: ['club'],
      description: 'A wooden bat.',
      portable: true,
      tags: [],
      instead: { take: [{ if: 'flag:paid', say: ['Not yours to take.'] }] },
    },
    bell: { name: 'bell', description: 'A brass bell on a post.', portable: false, tags: [], instead: { ring: [{ say: ['Ding.'] }] } },
    lamp: {
      name: 'lamp',
      description: 'An unplugged lamp.',
      portable: true,
      switchable: true,
      light: true,
      home: 'shed',
      tags: [],
      onUse: [{ with: 'socket', then: 'plug_lamp' }, { say: ['It needs a socket.'] }],
      after: { drop: [{ if: '!flag:lamp_rolled', then: 'lamp_rolls' }] },
    },
    lit_lamp: { name: 'lit lamp', description: 'A glowing lamp.', portable: true, tags: [] },
    socket: { name: 'socket', description: 'A wall socket.', portable: false, tags: [] },
    chest: {
      name: 'wooden chest',
      aliases: ['chest'],
      description: 'A heavy wooden chest.',
      portable: false,
      tags: [],
      container: { openable: true, locked: true, key: 'key', capacity: 2 },
      contains: ['coin'],
    },
    coin: { name: 'gold coin', aliases: ['coin'], description: 'A gold coin.', portable: true, tags: [] },
    jar: {
      name: 'glass jar',
      aliases: ['jar'],
      description: 'A glass jar.',
      portable: true,
      tags: [],
      container: { openable: true, transparent: true },
      contains: ['marble'],
    },
    marble: { name: 'marble', description: 'A blue marble.', portable: true, tags: [] },
    shelf: { name: 'shelf', description: 'A sturdy shelf.', portable: false, tags: [], surface: true, contains: ['book'] },
    book: { name: 'book', description: 'A dog-eared book.', portable: true, tags: [], text: '“It was a dark and stormy night.”' },
    fence: { name: 'fence', description: 'A white picket fence.', portable: false, tags: [], scenery: true },
    sky: { name: 'sky', description: 'Blue, mostly.', portable: false, tags: [] },
    barrel: { name: 'barrel', description: 'An old barrel.', portable: false, tags: [] },
    crate: { name: 'crate', aliases: ['box'], description: 'A nailed-shut crate.', portable: false, refusal: 'It is too heavy.', tags: [] },
  },

  npcs: {
    neighbor: {
      name: 'Neighbor',
      description: 'Your neighbor, leaning on the fence.',
      onGive: { wallet: 'give_wallet' },
      refuse: { key: '“Keep your key.”' },
      refuseGift: '“No thanks.”',
    },
  },

  dialogue: {
    neighbor: {
      default: '“Nice day.”',
      'flag:paid': '“Thanks for the cash.”',
      'flag:paid & has:bat': '“Careful with that bat.”',
    },
  },

  flagLabels: {
    'entered living': 'entered_living',
    'alarm smashed': 'alarm_smashed',
    rested: 'rested',
    'wearing shirt': 'wearing_shirt',
    paid: 'paid',
    'lamp lit': 'lamp_lit',
    'crate broken': 'crate_broken',
    'lamp rolled': 'lamp_rolled',
  },

  hints: [
    { if: '!has:key', text: 'Find the key.' },
    { if: '!flag:crate_broken', text: 'Break the crate.' },
  ],

  scoring: [
    { flag: 'alarm_smashed', points: 10 },
    { flag: 'paid', points: 10 },
    { flag: 'crate_broken', points: 20 },
  ],
  ranks: [
    { min: 0, title: 'Novice' },
    { min: 40, title: 'Master' },
  ],

  verbs: {
    snooze: {
      words: ['snooze', 'hit snooze', 'hit the snooze button', 'press snooze'],
      target: 'none',
      reply: 'There is nothing here to snooze.',
    },
    ring: { words: ['ring'], target: 'required' },
    wander: { words: ['wander', 'wander to'], target: 'optional', go: true },
  },

  darkness: { look: 'It is pitch black.', blunder: [{ chance: 100, then: ['You trip in the dark.'] }] },
  death: {
    message: ['**** You have died ****'],
    penalty: -10,
    lives: 1,
    respawn: 'bedroom',
    resurrection: ['You wake up.'],
    scatter: ['yard', 'living'],
    final: ['That’s it.'],
  },

  idle: 'The clock ticks.',
  confused: ['Please rephrase that.', 'Still confused.'],

  ambient: [{ if: 'in:yard & !flag:paid', every: 2, lines: ['A dog barks.', 'The dog barks again.'] }],

  finale: {
    room: 'shed',
    item: 'crate',
    with: 'bat',
    event: 'smash_crate',
    epilogue: [
      { if: 'flag:paid', then: 'ending_paid' },
      { if: '!flag:paid', then: 'ending_unpaid' },
    ],
    footer: 'footer',
    bareHanded: 'hurt_hand',
    bareHandedAgain: 'Still hurts.',
    wrongRoom: 'Not here.',
  },

  events: {
    intro: ['═══ TEST HOUSE ═══', '✨ CHAPTER 1: TESTING'],
    enter_living: ['You smell coffee.', '[Flag set: Entered living]'],
    smash_alarm: ['🔨 You smash the alarm clock.', '[Flag set: Alarm smashed]'],
    lamp_rolls: ['The lamp rolls under the fence.', '[Flag set: Lamp rolled]'],
    rest: ['😴 You nap.', '[Flag set: Rested]'],
    take_key: ['📎 The key is cold.'],
    wear_shirt: ['🌺 You put on the shirt.', '[Flag set: Wearing shirt]'],
    give_wallet: ['💼 The neighbor takes the wallet.', '[Flag set: Paid]'],
    plug_lamp: ['✨ The lamp glows.', '[Lamp consumed]', '[Added to inventory: lit lamp]', '[Flag set: Lamp lit]'],
    hurt_hand: ['🤜 Ouch.'],
    smash_crate: ['💥 The crate splinters.', '[Flag set: Crate broken]'],
    ending_paid: ['“The neighbor waves.”'],
    ending_unpaid: ['“The neighbor glares.”'],
    footer: ['Type RESTART to play again.'],
    fall_down: [{ die: 'You fall.' }, 'never printed'],
  },
};

/** Drop-in replacement for src/app.config.ts in tests: vi.mock('@/app.config', () => fixtureConfig). */
export const fixtureConfig = {
  cartridges: [{ kind: 'world' as const, id: 'test', title: 'TEST HOUSE', world: fixtureWorld, saveKey: 'test:save' }],
  appName: 'TEST TERMINAL',
  storagePrefix: 'test',
};
