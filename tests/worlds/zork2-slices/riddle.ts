import { moveItem, PLAYER } from '@/engine/model';
import type { ScriptContext } from '@/engine/scripts';
import type { GameState } from '@/types/game';
import type { Rule, World } from '@/types/world';

/**
 * Zork II's riddle and its door, as a native slice (engine parity 6a, Task 11): the Riddle Room
 * and its answer, and the Palantir rooms' oak door, the place mat slid under it and the key
 * pushed out of the far keyhole. Text from Infocom's story file (Release 63) and its source
 * (historicalsource/zork2, MIT License, Copyright (c) 2025 Microsoft);
 * tests/worlds/zork2-slices.test.ts plays it against the story file. Only what the slice needs.
 */

const NOISE = 'There is a faint noise from behind the door and a small cloud of\ndust rises from beneath it.';

const DUMMY = ['Look around.', 'You think it isn’t?', 'I think you’ve already done that.'];

/** The words ANSWER or SAY read, as Zork's lexer has them. */
function typedWords(ctx: ScriptContext): string[] {
  return (ctx.command?.text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * P-DOOR: the door, its lid and keyhole, and the mat under it, as either room describes them.
 * (Its PLOOK-FLAG, set by looking through the barred window, isn't modelled.)
 */
function pDoor(ctx: ScriptContext, side: string, lidOpen: string, keyhole: string): string {
  let s = `On the ${side} side of the room is a massive wooden door, which has a\nsmall window barred with iron. A formidable bolt lock is set within the\ndoor frame. A keyhole `;
  if (!ctx.test(lidOpen)) s += 'covered by a thin metal lid ';
  s += 'lies within the lock.';
  const inHole = ctx.children(keyhole)[0];
  if (inHole) s += ` A ${ctx.world.items[inHole].name} is in place within the keyhole.`;
  if (ctx.test('flag:mat_under')) {
    s += ' The edge of a place mat is visible under the door.';
    if (ctx.test('flag:key_on_mat')) s += ' Lying on the place mat is a rusty iron key.';
  }
  return s;
}

/** PLID-FCN for one side's lid. */
function lidRules(flag: string, keyhole: string): Record<string, Rule[]> {
  const open: Rule[] = [{ if: `flag:${flag}`, then: 'dummy' }, { then: `${flag}_opens` }];
  return {
    open,
    raise: open,
    move: open,
    close: [
      { if: `inside:key:${keyhole}`, say: ['The keyhole is occupied.'] },
      { if: `inside:opener:${keyhole}`, say: ['The keyhole is occupied.'] },
      { if: `flag:${flag}`, then: `${flag}_closes` },
      { say: ['The lid covers the keyhole.'] },
    ],
    look_behind: [{ say: ['There’s a keyhole behind the lid.'] }],
  };
}

/**
 * PKH-FCN's PUT, the keyhole being the second object: the lid in the way, this keyhole blocked,
 * and the letter opener or key pushing out whatever is in the far one (then V-PUT's own “Done.”).
 */
function keyholeRules(lidFlag: string, here: string, far: string): Rule[] {
  return [
    { as: 'indirect', if: `!flag:${lidFlag}`, say: ['The lid is in the way.'] },
    { as: 'indirect', if: `inside:key:${here}`, say: ['The keyhole is blocked.'] },
    { as: 'indirect', if: `inside:opener:${here}`, say: ['The keyhole is blocked.'] },
    { as: 'indirect', with: 'opener', if: `inside:key:${far}`, then: 'key_pushed', continue: true },
    { as: 'indirect', with: 'opener', continue: true },
    { as: 'indirect', with: 'key', continue: true },
    { as: 'indirect', then: 'no_fit' },
  ];
}

export const riddleWorld: World = {
  style: 'infocom',
  startRoom: 'riddle_room',
  flagLabels: {},
  dialogue: {},

  verbs: {
    answer: { words: ['answer', 'reply'], target: 'text', reply: 'Nobody seems to be awaiting your answer.' },
    say: { words: ['say'], target: 'text' },
    move: { words: ['move', 'shift', 'roll'], target: 'required' },
    raise: { words: ['raise', 'lift'], target: 'required' },
    look_under: { words: ['look under'], target: 'required', reply: 'There is nothing but dust there.' },
    look_behind: { words: ['look behind'], target: 'required', reply: 'There is nothing behind the {target}.' },
  },

  rooms: {
    riddle_room: {
      name: 'Riddle Room',
      dark: true,
      // RIDDLE-ROOM-FCN's M-LOOK: the door closed until the riddle is answered.
      description:
        'This is a room which is bare on all sides. There is an exit down in\nthe northwest corner of the room. To the east is a great closed door made of\nstone. Above the stone, the following words are written: “No man shall\npass this door without solving this riddle:\n\n  What is tall as a house,\n    round as a cup,\n      and all the king’s horses\n        can’t draw it up?”',
      descriptions: [
        {
          if: 'open:riddle_door',
          text: 'This is a room which is bare on all sides. There is an exit down in\nthe northwest corner of the room. To the east is a great open door made of\nstone. Above the stone, the following words are written: “No man shall\npass this door without solving this riddle:\n\n  What is tall as a house,\n    round as a cup,\n      and all the king’s horses\n        can’t draw it up?”',
        },
      ],
      exits: { east: { to: 'pearl_room', door: 'riddle_door' } },
      items: ['riddle_door', 'riddle'],
      npcs: [],
      onEnter: [],
      // RIDDLE-ROOM-FCN's M-BEG: ANSWER or SAY, while the door is shut.
      instead: {
        answer: [{ if: '!open:riddle_door', then: 'riddle_answer' }],
        say: [{ if: '!open:riddle_door', then: 'riddle_answer' }],
      },
    },
    pearl_room: {
      name: 'Pearl Room',
      dark: true,
      description: 'This is a former broom closet. The exits are to the east and west.',
      exits: { west: 'riddle_room' },
      items: ['necklace'],
      npcs: [],
      onEnter: [],
    },
    tiny_room: {
      name: 'Tiny Room',
      dark: true,
      description: 'This is a tiny room carved out of the wall of the ravine.',
      descriptionScript: 'tinyRoom',
      exits: { north: { to: 'dreary_room', door: 'oak_door' }, in: { to: 'dreary_room', door: 'oak_door' }, down: 'ravine_ledge' },
      items: ['lid_1', 'keyhole_1'],
      npcs: [],
      onEnter: [],
      scenery: ['oak_door'],
    },
    dreary_room: {
      name: 'Dreary Room',
      description: 'This is a small and rather dreary room.',
      descriptionScript: 'drearyRoom',
      exits: { south: { to: 'tiny_room', door: 'oak_door' }, out: { to: 'tiny_room', door: 'oak_door' } },
      items: ['lid_2', 'keyhole_2', 'table', 'crack', 'blue_sphere'],
      npcs: [],
      onEnter: [],
      scenery: ['oak_door'],
    },
    ravine_ledge: {
      name: 'Ledge in Ravine',
      dark: true,
      description:
        'You are on a narrow ledge near the bottom of a deep ravine. The ledge\ncontinues to the west. A precarious climb up to another tiny ledge is\npossible. A short scramble down the rock face leads\nto a stream.',
      exits: { up: 'tiny_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
  },

  items: {
    riddle_door: {
      name: 'stone door',
      aliases: ['door', 'great door', 'stone door', 'great stone door'],
      description: '',
      scenery: true,
      portable: false,
      door: true,
      container: { openable: true },
      tags: [],
      // RIDDLE-DOOR-FCN.
      instead: {
        open: [{ if: 'open:riddle_door', say: ['It is open!'] }, { say: ['The door can only be opened by answering the riddle.'] }],
        close: [{ if: 'open:riddle_door', say: ['Not a chance. The door weighs many tons.'] }, { say: ['It is closed!'] }],
      },
    },
    // RIDDLE-PSEUDO.
    riddle: {
      name: 'riddle',
      description: 'Use the “Look” command.',
      scenery: true,
      portable: false,
      tags: [],
      instead: { examine: [{ say: ['Use the “Look” command.'] }] },
    },
    necklace: {
      name: 'pearl necklace',
      aliases: ['necklace', 'pearls', 'pearl', 'pearl necklace'],
      description: 'There’s nothing special about the pearl necklace.',
      initialDescription: 'There is a pearl necklace here with hundreds of large pearls.',
      portable: true,
      size: 10,
      treasure: 15,
      tags: [],
    },

    // PDOOR, a local global of both rooms.
    oak_door: {
      name: 'door made of oak',
      aliases: ['door', 'wooden door', 'oak door'],
      description: '',
      scenery: true,
      portable: false,
      door: true,
      container: { openable: true, opened: 'The door is now open.', closed: 'The door is now closed.' },
      tags: [],
      // PDOOR-FCN.
      instead: {
        look_under: [{ if: 'flag:mat_under', say: ['The place mat is under the door.'] }],
        unlock: [
          { with: 'key', if: 'in:tiny_room & inside:opener:keyhole_1', say: ['The keyhole is blocked.'] },
          { with: 'key', if: 'in:dreary_room & inside:opener:keyhole_2', say: ['The keyhole is blocked.'] },
          { with: 'key', then: 'door_unlocks' },
          { say: ['It can’t be unlocked with that.'] },
        ],
        lock: [{ with: 'key', then: 'door_locks' }, { say: ['It can’t be locked with that.'] }],
        open: [{ if: '!flag:door_unlocked', say: ['The door is locked.'] }],
        close: [{ if: '!flag:door_unlocked', say: ['The door is locked.'] }],
      },
    },
    lid_1: {
      name: 'metal lid',
      aliases: ['lid', 'metal lid'],
      description: 'There’s nothing special about the metal lid.',
      scenery: true,
      portable: false,
      tags: [],
      instead: lidRules('lid_1_open', 'keyhole_1'),
    },
    lid_2: {
      name: 'metal lid',
      aliases: ['lid', 'metal lid'],
      description: 'There’s nothing special about the metal lid.',
      scenery: true,
      portable: false,
      tags: [],
      instead: lidRules('lid_2_open', 'keyhole_2'),
    },
    keyhole_1: {
      name: 'keyhole',
      aliases: ['hole'],
      description: 'There’s nothing special about the keyhole.',
      scenery: true,
      portable: false,
      container: { weight: 2 },
      tags: [],
      instead: { put: keyholeRules('lid_1_open', 'keyhole_1', 'keyhole_2'), search: [{ say: ['No light can be seen through the keyhole.'] }] },
    },
    keyhole_2: {
      name: 'keyhole',
      aliases: ['hole'],
      description: 'There’s nothing special about the keyhole.',
      scenery: true,
      portable: false,
      container: { weight: 2 },
      contains: ['key'],
      tags: [],
      instead: { put: keyholeRules('lid_2_open', 'keyhole_2', 'keyhole_1'), search: [{ say: ['No light can be seen through the keyhole.'] }] },
    },
    key: {
      name: 'rusty iron key',
      aliases: ['key', 'iron key', 'rusty key', 'rusty iron key'],
      description: 'There’s nothing special about the rusty iron key.',
      portable: true,
      size: 2,
      tags: [],
    },
    opener: {
      name: 'letter opener',
      aliases: ['opener', 'letter opener'],
      description: 'There’s nothing special about the letter opener.',
      portable: true,
      size: 2,
      tags: [],
    },
    mat: {
      name: 'place mat',
      aliases: ['mat', 'placemat', 'place mat'],
      description: 'There’s nothing special about the place mat.',
      portable: true,
      surface: true,
      size: 12,
      tags: [],
      // PLACE-MAT-FCN.
      instead: {
        put: [
          { prep: 'under', with: 'oak_door', then: 'mat_under' },
          { prep: 'under', with: 'riddle_door', say: ['There’s not enough room under this door.'] },
        ],
        take: [{ if: 'flag:key_on_mat', then: 'mat_moved' }],
        move: [{ if: 'flag:key_on_mat', then: 'mat_moved' }],
        use: [{ if: 'flag:key_on_mat', then: 'mat_moved' }],
      },
    },
    teapot: { name: 'china teapot', aliases: ['teapot', 'pot', 'tea pot'], description: 'There’s nothing special about the china teapot.', portable: true, tags: [] },
    lamp: { name: 'lamp', aliases: ['lantern', 'light', 'brass lamp'], description: 'The lamp is on.', portable: true, switchable: true, light: true, size: 15, tags: [] },
    table: {
      name: 'table',
      aliases: ['table', 'dusty table', 'wooden table'],
      description: 'There’s nothing special about the table.',
      scenery: true,
      portable: false,
      surface: true,
      tags: [],
    },
    crack: { name: 'narrow crack', aliases: ['crack'], description: 'There’s nothing special about the narrow crack.', scenery: true, portable: false, tags: [] },
    blue_sphere: {
      name: 'blue crystal sphere',
      aliases: ['sphere', 'palantir', 'blue sphere', 'crystal sphere'],
      description: 'There’s nothing special about the blue crystal sphere.',
      // On the table in Zork; its first-seen sentence says so.
      initialDescription: 'In the center of the table sits a blue crystal sphere.',
      portable: true,
      size: 10,
      treasure: 20,
      tags: [],
    },
  },

  npcs: {},

  events: {
    riddle_answer: [{ script: 'riddle' }],
    no_fit: [{ script: 'noFit' }],
    dummy: [{ script: 'dummy' }],
    // PKH-FCN: the far keyhole's key falls out, onto the mat if it's there (MATOBJ), else it's gone.
    key_pushed: [
      NOISE,
      { move: 'key', to: null },
      { if: 'flag:mat_under', then: [{ set: 'key_on_mat' }] },
    ],
    // PLACE-MAT-FCN's PUT-UNDER the oak door: under it, out of the room's list (PCHECK's NDESCBIT).
    mat_under: ['The place mat fits easily under the door.', { move: 'mat', to: 'here' }, { unlist: 'mat' }, { set: 'mat_under' }],
    // PLACE-MAT-FCN's TAKE or MOVE with the key on it: the key falls off, and the mat is out from under the door.
    mat_moved: [
      { move: 'key', to: 'here' },
      { relist: 'key' },
      'As the place mat is moved, a rusty iron key falls from it and onto the floor.',
      { clear: 'key_on_mat' },
      { clear: 'mat_under' },
      { relist: 'mat' },
    ],
    door_unlocks: ['The door is now unlocked.', { set: 'door_unlocked' }],
    door_locks: ['The door is locked.', { clear: 'door_unlocked' }],
    lid_1_open_opens: ['The lid is now open.', { set: 'lid_1_open' }],
    lid_1_open_closes: ['The lid covers the keyhole.', { clear: 'lid_1_open' }],
    lid_2_open_opens: ['The lid is now open.', { set: 'lid_2_open' }],
    lid_2_open_closes: ['The lid covers the keyhole.', { clear: 'lid_2_open' }],
  },

  scripts: {
    // RIDDLE-ROOM-FCN: the first or second word typed is WELL (P-LEXV at P-CONT or P-CONT+2).
    riddle: (ctx) => {
      const words = typedWords(ctx);
      if (words[0] !== 'well' && words[1] !== 'well') return ['A hollow laugh seems to come from the stone door.'];
      return ['There is a deafening clap of thunder and the stone door\nquietly swings open to reveal a passageway beyond.', { score: 5 }, { open: 'riddle_door' }];
    },
    // RANDOM-ELEMENT of DUMMY.
    dummy: (ctx) => [DUMMY[ctx.roll(DUMMY.length) - 1]],
    noFit: (ctx) => [`The ${ctx.world.items[ctx.command?.target ?? '']?.name ?? 'thing'} doesn’t fit.`],
    tinyRoom: (ctx) => [{ say: `This is a tiny room carved out of the wall of the ravine. There is\nan exit down a precarious climb. ${pDoor(ctx, 'north', 'flag:lid_1_open', 'keyhole_1')}` }],
    drearyRoom: (ctx) => [
      {
        say: `This is a small and rather dreary room, eerily illuminated by a red glow\nemanating from a crack in one wall. The light falls upon a dusty wooden table\nin the center of the room. ${pDoor(ctx, 'south', 'flag:lid_2_open', 'keyhole_2')}`,
      },
    ],
  },
};

/** Things where the original has them at a slice's start, from a fresh game. */
function place(state: GameState, room: string, visited: string[], carrying: string[]): void {
  state.currentRoom = room;
  state.visited = [...visited];
  for (const id of carrying) moveItem(state, id, PLAYER);
  for (const id of carrying) state.itemState[id] = { ...state.itemState[id], moved: true };
  state.itemState.lamp = { ...state.itemState.lamp, on: true };
}

/** Just into the Riddle Room, the door shut, carrying what the Gazebo had and the lit lamp. */
export function buildRiddle(state: GameState): void {
  place(state, 'riddle_room', ['riddle_room'], ['teapot', 'mat', 'opener', 'lamp']);
}

/** Just up into the Tiny Room, the riddle answered, the lid shut, the key in the far keyhole. */
export function buildTinyRoom(state: GameState): void {
  place(state, 'tiny_room', ['riddle_room', 'tiny_room', 'ravine_ledge'], ['teapot', 'mat', 'opener', 'lamp']);
  state.flags.lid_2_open = true;
  // PCHECK: a key in a keyhole isn't listed (NDESCBIT).
  state.itemState.key = { ...state.itemState.key, unlisted: true };
}
