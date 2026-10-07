import { moveItem, PLAYER } from '@/engine/model';
import type { ScriptContext } from '@/engine/scripts';
import type { GameState } from '@/types/game';
import type { EventStep, World } from '@/types/world';

/**
 * Zork III's endgame, as a native slice (engine parity 6a, Task 11): the Parapet with its sundial
 * and button, the North Corridor and its cell door, the cell turning in its slot, the bronze door
 * of cell 4 and the Treasury of Zork, and the Dungeon Master, who follows you and takes orders.
 * Text from Infocom's story file (Release 25) and its source (historicalsource/zork3, MIT
 * License, Copyright (c) 2025 Microsoft); tests/worlds/zork3-slices.test.ts plays it against the
 * story file. Only what the slice needs: the corridors east and west, the cells' stored contents
 * (MOVE-CELL-OBJECTS) and the dungeon door aren't here.
 */

const IF_YOU_WISH = '“If you wish,” he replies.';
const NO_SETTING = 'There is no such setting.';
const BARE_HANDS = 'Your bare hands don’t appear to be enough.';
const DM = 'dungeon_master';

/** DPR. */
const dpr = (ctx: ScriptContext, door: string) => (ctx.test(`open:${door}`) ? 'open.' : 'closed.');

/** Where the dungeon master stands. */
const dmAt = (ctx: ScriptContext, room: string) => ctx.npcIn(DM, room);

export const endgameWorld: World = {
  style: 'infocom',
  startRoom: 'parapet',
  flagLabels: {},
  dialogue: {},
  // V-SCORE: Zork III keeps a potential, not a score, and has no ranks.
  maxScore: 7,
  scoreLine: 'Your potential is {score} of a possible {max}, in {moves}.',
  // LCELL (the cell in the slot) and PNUMB (the cell the dial points at).
  vars: { lcell: 1, pnumb: 1 },

  verbs: {
    follow: { words: ['follow', 'chase', 'pursue', 'come'], target: 'optional' },
    stay: { words: ['stay'], target: 'none' },
    // TURN X with no TO or WITH: PRE-TURN, no tool named (the engine's TURN wants one).
    turn_bare: { words: ['turn', 'set'], target: 'required', afterBuiltIns: true, reply: BARE_HANDS },
  },

  rooms: {
    parapet: {
      name: 'Parapet',
      description:
        'You are standing behind a stone retaining wall which rims a parapet\noverlooking a fiery pit. It is difficult to see through the\nsmoke and flame which fills the pit, but it seems to be bottomless.\nThe pit itself is circular, about two hundred feet in diameter,\nand is fashioned of roughly hewn stone. The flames generate considerable\nheat, so it is rather uncomfortable standing here.\nThere is an object here which looks like a sundial. On it are an\nindicator arrow surrounding a large button. On the face of\nthe dial are numbers 1 through 8. The indicator points to the number {var:pnumb}.\nTo the south, across a narrow corridor, is a prison cell.',
      exits: { south: 'north_corridor', north: { denial: 'You would be burned to a crisp in no time.' } },
      items: ['sundial', 'dial_button'],
      npcs: ['dungeon_master'],
      onEnter: [],
      scenery: ['parapet_obj'],
    },
    north_corridor: {
      name: 'North Corridor',
      description:
        'This is a wide east-west corridor which opens onto a northern\nparapet at its center. You can see flames and smoke as you peer\ntowards the parapet. The corridor turns south at either end, and in\nthe center of the south wall is a heavy wooden door with a small\nbarred window. The door is closed.',
      descriptions: [
        {
          if: 'open:cell_door',
          text: 'This is a wide east-west corridor which opens onto a northern\nparapet at its center. You can see flames and smoke as you peer\ntowards the parapet. The corridor turns south at either end, and in\nthe center of the south wall is a heavy wooden door with a small\nbarred window. The door is open.',
        },
      ],
      exits: { north: 'parapet', south: { to: 'cell', door: 'cell_door' }, in: { to: 'cell', door: 'cell_door' } },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['cell_door', 'parapet_obj'],
    },
    // CELL: whichever cell is in the slot.
    cell: {
      name: 'Prison Cell',
      description: 'You are in a featureless prison cell.',
      descriptionScript: 'cellLook',
      exits: { north: { to: 'north_corridor', door: 'cell_door' }, out: { to: 'north_corridor', door: 'cell_door' } },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['master_far', 'bronze_door', 'cell_door', 'parapet_obj'],
    },
    // GOOD-CELL: cell 4, turned out of the slot with you in it.
    good_cell: {
      name: 'Prison Cell',
      description:
        'You are in a bare prison cell. Its wooden door is securely fastened,\nand you can see only flames and smoke through its small window. On the\nsouth wall is a bronze door which seems to be closed.',
      descriptions: [
        {
          if: 'open:bronze_door',
          text: 'You are in a bare prison cell. Its wooden door is securely fastened,\nand you can see only flames and smoke through its small window. On the\nsouth wall is a bronze door which seems to be open.',
        },
      ],
      exits: { south: { to: 'nirvana', door: 'bronze_door' }, out: { to: 'nirvana', door: 'bronze_door' } },
      items: [],
      npcs: ['master_unheard'],
      onEnter: [],
      scenery: ['locked_cell_door', 'bronze_door'],
    },
    // PRISON-CELL: any other cell, turned out of the slot with you in it.
    prison_cell: {
      name: 'Prison Cell',
      description: 'You are in a bare prison cell. Its wooden door is securely fastened, and\nyou can see only flames and smoke through its small window.',
      exits: { out: { denial: 'The door is securely fastened.' } },
      items: [],
      npcs: ['master_unheard_too'],
      onEnter: [],
      scenery: ['locked_cell_door'],
    },
    nirvana: {
      name: 'Treasury of Zork',
      description:
        'This is a large room, richly appointed in a style that bespeaks exquisite\ntaste. To judge from its contents, it is the ultimate storehouse of the\nwealth of the Great Underground Empire.\n\nThere are chests containing precious jewels, mountains of\nzorkmids, rare paintings, ancient statuary, and beguiling curios.\n\nOn one wall is an annotated map of the Empire, showing the locations of\nvarious troves of treasure, and of many superior scenic views.\n\nOn a desk at the far end of the room are stock certificates\nrepresenting a controlling interest in FrobozzCo International, the\nmultinational conglomerate and parent company of\nthe Frobozz Magic Boat Co., etc.\n',
      exits: {},
      items: [],
      npcs: [],
      onEnter: [],
      // NIRVANA-F's M-END, then FINISH.
      onEnd: [{ if: 'in:nirvana', then: [{ end: 'treasury' }] }],
    },
  },

  items: {
    sundial: {
      name: 'sundial',
      aliases: ['dial', 'indicator', 'arrow', 'sun dial', 'indicator dial'],
      description: 'The dial points to {var:pnumb}.',
      scenery: true,
      portable: false,
      tags: [],
      // DIAL, the player turning it to a number.
      instead: {
        turn: [
          { if: 'number<1', say: [NO_SETTING] },
          { if: 'number>8', say: [NO_SETTING] },
          { if: 'number>=1', then: 'dial_turned' },
        ],
      },
    },
    dial_button: {
      name: 'large button',
      aliases: ['button'],
      description: 'There’s nothing special about the large button.',
      scenery: true,
      portable: false,
      tags: [],
      // DIALBUTTON.
      instead: { use: [{ then: 'button_pushed' }] },
    },
    parapet_obj: {
      name: 'parapet',
      description: '',
      descriptionScript: 'parapetLook',
      scenery: true,
      portable: false,
      tags: [],
      // PARAPET-OBJ-F: on the parapet, EXAMINE looks around.
      instead: { examine: [{ if: 'in:parapet', then: 'look_around' }] },
    },
    cell_door: {
      name: 'cell door',
      aliases: ['door', 'wooden door', 'wood door'],
      description: 'The cell door is closed.',
      scenery: true,
      portable: false,
      door: true,
      container: { openable: true },
      tags: [],
    },
    // GOOD-LOCKED-DOOR and LOCKED-DOOR: the cell door, from inside a cell out of the slot.
    locked_cell_door: {
      name: 'cell door',
      aliases: ['door', 'wooden door', 'wood door', 'locked door'],
      description: 'There’s nothing special about the cell door.',
      scenery: true,
      portable: false,
      tags: [],
      instead: {
        open: [{ say: ['The door is securely fastened.'] }],
        unlock: [{ say: ['The door is securely fastened.'] }],
      },
    },
    bronze_door: {
      name: 'bronze door',
      aliases: ['door'],
      description: 'The bronze door is closed.',
      scenery: true,
      portable: false,
      door: true,
      container: { openable: true, locked: true, key: 'key' },
      tags: [],
      instead: {
        // BRONZE-DOOR-F and KEY-F.
        open: [
          { if: 'in:good_cell & !open:bronze_door & !locked:bronze_door', then: 'bronze_door_opens' },
          { if: 'locked:bronze_door', say: ['The bronze door is locked.'] },
        ],
        unlock: [
          { with: 'key', if: 'in:good_cell & locked:bronze_door', then: 'bronze_door_unlocked' },
          { with: 'key', if: 'in:good_cell', say: ['It already is.'] },
          { with: 'key', say: ['The key molds itself to the lock but will not turn.'] },
        ],
      },
    },
    // MASTER, the local-global dungeon master, from the cell in the slot.
    master_far: {
      name: 'dungeon master',
      aliases: ['master', 'man', 'dungeon'],
      description: '',
      descriptionScript: 'masterLook',
      scenery: true,
      portable: false,
      tags: [],
    },
    key: { name: 'strange key', aliases: ['key'], description: 'The key seems to change shape constantly.', portable: true, size: 10, tags: [] },
    book: { name: 'very ancient book', aliases: ['book'], description: 'There’s nothing special about the book.', portable: true, tags: [] },
    torch: { name: 'torch', aliases: ['flaming torch'], description: 'The torch is burning.', portable: true, switchable: true, light: true, tags: [] },
    staff: { name: 'wooden staff', aliases: ['staff'], description: 'There’s nothing special about the wooden staff.', portable: true, tags: [] },
  },

  npcs: {
    dungeon_master: {
      name: 'dungeon master',
      aliases: ['master', 'man', 'dungeon'],
      description: 'The dungeon master is quietly leaning on his staff here.',
      // MASTER is in the North Corridor's and the cell's GLOBAL lists: you can talk to him from there.
      heardFrom: ['north_corridor', 'cell'],
      // I-FOLIN, while FOLFLAG holds: he follows you anywhere but into a cell.
      follows: 'flag:dm_folin & flag:folflag & !in:cell & !in:prison_cell & !in:good_cell',
      followLine: 'The dungeon master follows you.',
      refuseOrder: '“Do not be foolish! Consider the end of your quest!”',
      // DUNGEON-MASTER-F, the master as WINNER.
      orders: {
        follow: [{ if: 'with:dungeon_master', then: 'dm_follows' }, { say: ['The dungeon master’s voice replies, “You must come here first!”'] }],
        stay: [{ then: 'dm_stays' }],
        wait: [{ then: 'dm_stays' }],
        go: [
          { if: 'in:north_corridor & direction:south', say: ['“I am not permitted to enter the prison cell.”'] },
          { say: ['“I prefer to stay where I am, thank you.”'] },
        ],
        take: [{ say: ['“I will have no use for that, I am afraid.”'] }],
        turn: [
          { if: 'target:sundial & number<1', say: [IF_YOU_WISH, NO_SETTING] },
          { if: 'target:sundial & number>8', say: [IF_YOU_WISH, NO_SETTING] },
          { if: 'target:sundial & number>=1', then: 'dm_turns_dial' },
          { if: 'target:sundial', say: [IF_YOU_WISH, BARE_HANDS] },
        ],
        push: [{ if: 'target:dial_button', then: 'dm_pushes_button' }],
      },
      instead: {
        examine: [
          {
            say: [
              'He is dressed simply in a hood and cloak, wearing an amulet and ring,\ncarrying an old book under one arm, and leaning on a wooden staff. A single\nkey, as if to a prison cell, hangs from his belt.',
            ],
          },
        ],
        take: [{ say: ['“I’m willing to accompany you, but not ride in your pocket!”'] }],
        give: [{ say: ['“I have no need for those things.”'] }],
      },
    },
    // MASTER from a cell turned out of the slot: he can't hear you.
    master_unheard: {
      name: 'dungeon master',
      aliases: ['master', 'man', 'dungeon'],
      description: 'He is not here.',
      scenery: true,
      // MASTER-F answers the TELL itself, and Zork's main loop runs no clock for a TELL.
      instead: { order: [{ then: 'unheard' }] },
    },
    master_unheard_too: {
      name: 'dungeon master',
      aliases: ['master', 'man', 'dungeon'],
      description: 'He is not here.',
      scenery: true,
      // MASTER-F answers the TELL itself, and Zork's main loop runs no clock for a TELL.
      instead: { order: [{ then: 'unheard' }] },
    },
  },

  // I-FOLIN's other two cases: left behind at the cell door, and catching up.
  daemons: [
    {
      if: 'flag:dm_folin & flag:folflag & in:cell & !with:dungeon_master',
      then: ['You notice that the dungeon master doesn’t follow you.', { clear: 'folflag' }],
    },
    {
      if: 'flag:dm_folin & !flag:folflag & !with:dungeon_master & !in:cell & !in:prison_cell',
      then: ['The dungeon master rejoins you.', { set: 'folflag' }, { script: 'dmToPlayer' }],
    },
  ],

  events: {
    dial_turned: [{ setVar: 'pnumb', from: 'number' }, 'The dial now points to {var:pnumb}.'],
    dm_turns_dial: [IF_YOU_WISH, { setVar: 'pnumb', from: 'number' }],
    button_pushed: [{ script: 'cellMove', arg: 'player' }],
    dm_pushes_button: [IF_YOU_WISH, { script: 'cellMove' }],
    unheard: [{ free: true }, 'He can’t hear you.'],
    look_around: [{ look: true }],
    dm_follows: [{ set: 'dm_folin' }, 'The dungeon master answers, “I will follow.”'],
    dm_stays: [{ clear: 'dm_folin' }, 'The dungeon master answers, “I will stay.”'],
    bronze_door_unlocked: [{ unlock: 'bronze_door' }, 'The key seems to mold itself to the shape of the lock. With a mere\ntwist of your hand, the massive bolt gives way.'],
    bronze_door_opens: [{ open: 'bronze_door' }, 'On the other side of the bronze door is a narrow passage which opens out\ninto a larger area.'],
  },

  endings: {
    treasury: {
      lines: [
        'As you examine your new-found riches, the Dungeon Master\nmaterializes beside you, and says, “Now that you have solved all the\nmysteries of the Dungeon, it is time for you to assume your rightly earned\nplace in the scheme of things. Long have I waited for one capable of\nreleasing me from my burden!” He taps you lightly on the head with his\nstaff, mumbling a few well-chosen spells, and you feel yourself changing,\ngrowing older and more stooped. For a moment there are two identical mages\nstanding among the treasure, then your counterpart dissolves into a\nmist and disappears, a sardonic grin on his face.',
        '',
        'For a moment you are relieved, safe in the knowledge that you have\nat last completed your quest in ZORK. You begin to feel the vast powers\nand lore at your command and thirst for an opportunity to use them.',
        '',
      ],
      score: true,
      footer: ['', 'Would you like to restart the game from the beginning, restore a saved game position, or end this session of the game?', '(Type RESTART, RESTORE, or QUIT):'],
    },
  },

  scripts: {
    // CELL-ROOM's M-LOOK.
    cellLook: (ctx) => {
      const lines = [
        `You are in a featureless prison cell. You can see ${
          ctx.test('open:cell_door')
            ? 'an east-west\ncorridor outside the cell door. Your view also takes in the parapet and\na large, fiery pit.'
            : 'through the small window\nin the closed door the parapet, and, behind that,\nsmoke and flames rising from a fiery pit.'
        }`,
      ];
      if (dmAt(ctx, 'parapet')) lines.push('The dungeon master is at the parapet, leaning on his\nstaff. His keen gaze is fixed on you and he looks tense,\nas if waiting for something to happen.');
      if (ctx.test('var:lcell=4')) lines.push(`Behind you, to the south, is a bronze door which is ${dpr(ctx, 'bronze_door')}`);
      return [{ say: lines.join('\n') }];
    },
    // PARAPET-OBJ-F, from the corridor or the cell.
    parapetLook: (ctx) => [{ say: `You can see the parapet and sundial from here.${dmAt(ctx, 'parapet') ? ' The dungeon master is there\nalso, leaning on his staff.' : ''}` }],
    // MASTER-F's EXAMINE.
    masterLook: (ctx) => [{ say: dmAt(ctx, 'parapet') ? 'The dungeon master is standing on the parapet.' : 'The dungeon master isn’t here.' }],
    dmToPlayer: (ctx) => [{ moveNpc: DM, to: ctx.room() }],
    // DIALBUTTON and CELL-MOVE: the cells turn until the one the dial points at is in the slot.
    cellMove: (ctx) => {
      const lcell = ctx.state.vars?.lcell ?? 1;
      const pnumb = ctx.state.vars?.pnumb ?? 1;
      const wasOpen = ctx.test('open:cell_door');
      const steps: EventStep[] = [{ unvisit: 'cell' }];
      if (ctx.arg === 'player') steps.push('The button depresses with a slight click, and pops back.');
      steps.push({ close: 'cell_door' }, { close: 'bronze_door' });
      if (pnumb !== lcell) {
        steps.push(pnumb === 4 ? { reveal: 'bronze_door' } : { hide: 'bronze_door' });
        if (ctx.room() === 'cell') {
          const to = lcell === 4 ? 'good_cell' : 'prison_cell';
          if (lcell === 4) steps.push({ reveal: 'bronze_door' });
          steps.push({ unvisit: 'good_cell' }, { unvisit: 'prison_cell' }, { go: to });
        }
        steps.push({ setVar: 'lcell', to: pnumb });
      }
      if (wasOpen) steps.push('You notice that the cell door is now closed.');
      return steps;
    },
  },
};

/** On the Parapet, just arrived with the dungeon master, everything he asked for carried. */
export function buildParapet(state: GameState): void {
  state.currentRoom = 'parapet';
  state.visited = ['north_corridor', 'parapet'];
  for (const id of ['book', 'staff', 'torch', 'key']) {
    moveItem(state, id, PLAYER);
    state.itemState[id] = { ...state.itemState[id], moved: true };
  }
  state.itemState.torch = { ...state.itemState.torch, on: true };
  // Cell 1 is in the slot: the bronze door can't be seen.
  state.itemState.bronze_door = { ...state.itemState.bronze_door, hidden: true };
  state.npcs = { [DM]: { room: 'parapet' } };
  state.flags.dm_folin = true;
  state.flags.folflag = true;
  state.vars = { ...state.vars, score: 7, lcell: 1, pnumb: 1 };
  // The moves the original has counted by the end of the prefix (its SCORE says so).
  state.turns = 291;
  state.moveCount = 291;
}
