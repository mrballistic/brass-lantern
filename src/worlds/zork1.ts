import type { ScriptContext } from '@/engine/scripts';
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

// The thief (1actions.zil: I-THIEF, THIEF-VS-ADVENTURER, ROB, STEAL-JUNK,
// ROB-MAZE, DROP-JUNK, DEPOSIT-BOOTY, HACK-TREASURES, RECOVER-STILETTO).
// A script returns its steps all at once, so the thief's turn works on a
// local view of where things are, and emits the moves as it goes.

const LAIR = 'treasure_room';
const KEEPS = ['stiletto', 'large_bag'];

/** Zork's <PROB n>: n > RANDOM 100. */
const prob = (ctx: ScriptContext, n: number) => n > ctx.roll(100);

function thiefTurn(ctx: ScriptContext): EventStep[] {
  const steps: EventStep[] = [];
  const moved = new Map<string, string | null>();
  const where = (id: string) => (moved.has(id) ? moved.get(id) : ctx.holder(id));
  const contents = (place: string) => [
    ...ctx.children(place).filter((id) => !moved.has(id)),
    ...[...moved].filter(([, to]) => to === place).map(([id]) => id),
  ];
  const move = (id: string, to: string | null, hide?: boolean) => {
    moved.set(id, to);
    steps.push({ move: id, to });
    if (hide) steps.push({ hide: id });
  };
  const here = ctx.room();
  const lit = ctx.lit();
  let rm = ctx.rooms().find((room) => ctx.npcIn('thief', room)) ?? LAIR;
  let seen = !ctx.hidden('thief');
  let announced = Boolean(ctx.state.flags.thief_here);
  const hideThief = () => {
    steps.push({ npcState: 'thief', hidden: true });
    seen = false;
  };
  const recoverStiletto = () => {
    if (where('stiletto') === rm) move('stiletto', 'thief');
  };
  /** Treasures in `from` go to the thief (each at `chance`%, or all). */
  const rob = (from: string, chance?: number) => {
    let robbed = false;
    for (const id of contents(from)) {
      if (ctx.treasure(id) > 0 && (chance === undefined || prob(ctx, chance))) {
        move(id, 'thief', true);
        robbed = true;
      }
    }
    return robbed;
  };
  const stoleLight = () => steps.push({ script: 'thief_stole_light', arg: lit ? 'lit' : 'dark' });
  /** THIEF-VS-ADVENTURER. True: he stays with you this turn. */
  const versus = (): boolean => {
    if (here === LAIR) return false;
    if (!announced) {
      if (!seen && prob(ctx, 30)) {
        if (where('stiletto') === 'thief') {
          steps.push({ npcState: 'thief', hidden: false }, { set: 'thief_here' },
            'Someone carrying a large bag is casually leaning against one of the walls here. He does not speak, but it is clear from his aspect that the bag will be taken only over his dead body.');
          return true;
        }
        return false;
      }
      const fighting = Boolean(ctx.npc('thief')?.fighting);
      if (seen && fighting && !winning(ctx)) {
        steps.push('Your opponent, determining discretion to be the better part of valor, decides to terminate this little contretemps. With a rueful nod of his head, he steps backward into the gloom and disappears.',
          { npcState: 'thief', fighting: false });
        hideThief();
        recoverStiletto();
        return true;
      }
      if (seen && fighting && prob(ctx, 90)) return false;
      if (seen && prob(ctx, 30)) {
        steps.push('The holder of the large bag just left, looking disgusted. Fortunately, he took nothing.');
        hideThief();
        recoverStiletto();
        return true;
      }
      if (prob(ctx, 70)) return false;
      const robbed = rob(here, 100) ? 'room' : rob('player') ? 'player' : null;
      steps.push({ set: 'thief_here' });
      announced = true;
      if (robbed && !seen) {
        steps.push(`A seedy-looking individual with a large bag just wandered through the room. On the way through, he quietly abstracted some valuables from ${robbed === 'room' ? 'the room' : 'your possession'}, mumbling something about “Doing unto others before...”`);
        stoleLight();
        return false;
      }
      if (seen) {
        recoverStiletto();
        if (robbed) {
          steps.push(`The thief just left, still carrying his large bag. You may not have noticed that he ${robbed === 'player' ? 'robbed you blind first.' : 'appropriated the valuables in the room.'}`);
          stoleLight();
        } else steps.push('The thief, finding nothing of value, left disgusted.');
        hideThief();
        return true;
      }
      steps.push('A “lean and hungry” gentleman just wandered through, carrying a large bag. Finding nothing of value, he left disgruntled.');
      return true;
    }
    if (seen && prob(ctx, 30)) {
      const robbed = rob(here, 100) ? 'room' : rob('player') ? 'player' : null;
      if (robbed) {
        steps.push(`The thief just left, still carrying his large bag. You may not have noticed that he ${robbed === 'player' ? 'robbed you blind first.' : 'appropriated the valuables in the room.'}`);
        stoleLight();
      } else steps.push('The thief, finding nothing of value, left disgusted.');
      hideThief();
      recoverStiletto();
    }
    return false;
  };

  for (let pass = 0; pass < 2; pass++) {
    if (rm === LAIR && rm !== here) {
      if (seen) {
        recoverStiletto();
        hideThief();
        for (const id of contents(LAIR)) steps.push({ reveal: id });
      }
      // DEPOSIT-BOOTY: his treasures go into the lair, silently. The egg comes back open.
      for (const id of contents('thief')) {
        if (KEEPS.includes(id) || ctx.treasure(id) <= 0) continue;
        move(id, LAIR);
        if (id === 'egg') steps.push({ open: 'egg' }, { set: 'egg_solved' });
      }
    } else if (rm === here && ctx.world.rooms[rm]?.dark && !ctx.npcIn('troll', here)) {
      if (versus()) return steps;
    } else {
      if (seen) hideThief();
      if (ctx.visited(rm)) {
        rob(rm, 75);
        if (ctx.tags(rm).includes('maze') && ctx.tags(here).includes('maze')) {
          for (const id of contents(rm)) {
            if (!ctx.world.items[id]?.portable || !prob(ctx, 40)) continue;
            steps.push(`You hear, off in the distance, someone saying “My, I wonder what this fine ${ctx.world.items[id].name} is doing here.”`);
            if (prob(ctx, 60)) move(id, 'thief', true);
            break;
          }
        } else {
          for (const id of contents(rm)) {
            const item = ctx.world.items[id];
            if (!item?.portable || item.scenery || ctx.treasure(id) > 0) continue;
            if (id !== 'stiletto' && !prob(ctx, 10)) continue;
            move(id, 'thief', true);
            if (rm === here) steps.push(`You suddenly notice that the ${item.name} vanished.`);
            break;
          }
        }
      }
    }
    if (pass === 1 || seen) break;
    // Move on: the next room in Zork's order that isn't sacred.
    recoverStiletto();
    const rooms = ctx.rooms();
    let next = rooms.indexOf(rm);
    do next = (next + 1) % rooms.length; while (ctx.tags(rooms[next]).includes('sacred'));
    rm = rooms[next];
    steps.push({ moveNpc: 'thief', to: rm }, { npcState: 'thief', fighting: false, hidden: true }, { clear: 'thief_here' });
    seen = false;
    announced = false;
  }
  // DROP-JUNK: worthless things fall out of his bag.
  if (rm !== LAIR) {
    let said = false;
    for (const id of contents('thief')) {
      if (KEEPS.includes(id) || ctx.treasure(id) > 0 || !prob(ctx, 30)) continue;
      move(id, rm);
      steps.push({ reveal: id });
      if (rm === here && !said) {
        steps.push('The robber, rummaging through his bag, dropped a few items he found valueless.');
        said = true;
      }
    }
  }
  return steps;
}

/** Zork's WINNING?: is the thief getting the better of you? */
function winning(ctx: ScriptContext): boolean {
  const vs = ctx.npc('thief')?.strength ?? 5;
  const ps = vs - ctx.playerStrength();
  const chance = ps > 3 ? 90 : ps > 0 ? 75 : ps === 0 ? 50 : vs > 1 ? 25 : 10;
  return prob(ctx, chance);
}

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
      npcs: ['thief'],
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
    treasure_room: {
      name: 'Treasure Room',
      description: 'This is a large room, whose east wall is solid granite. A number of discarded bags, which crumble at your touch, are scattered about on the floor. There is an exit down a staircase.',
      dark: true,
      exits: { down: 'cyclops_room' },
      items: ['chalice'],
      npcs: [],
      // Zork's VALUE 25; and TREASURE-ROOM-FCN: the thief rushes to his lair's defence.
      onEnter: [
        { if: '!flag:treasure_room_visited', then: 'treasure_room_points' },
        { if: 'alive:thief & awake:thief', then: 'thief_lair', repeat: true },
      ],
    },
    strange_passage: {
      name: 'Strange Passage',
      description: 'This is a long passage. To the west is one entrance. On the east there is an old wooden door, with a large opening in it (about cyclops sized).',
      dark: true,
      exits: { west: 'cyclops_room', in: 'cyclops_room', east: 'living_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    cyclops_room: {
      name: 'Cyclops Room',
      // CYCLOPS-ROOM-FCN's M-LOOK: his mood is the room.
      description: 'This room has an exit on the northwest, and a staircase leading up. A cyclops, who looks prepared to eat horses (much less mere adventurers), blocks the staircase. From his state of health, and the bloodstains on the walls, you gather that he is not very friendly, though he likes people.',
      descriptions: [
        { if: 'flag:magic_word', text: 'This room has an exit on the northwest, and a staircase leading up. The east wall, previously solid, now has a cyclops-sized opening in it.' },
        { if: 'flag:cyclops_asleep', text: 'This room has an exit on the northwest, and a staircase leading up. The cyclops is sleeping blissfully at the foot of the stairs.' },
        { if: 'var:cyclowrath>0', text: 'This room has an exit on the northwest, and a staircase leading up. The cyclops is standing in the corner, eyeing you closely. I don’t think he likes you very much. He looks extremely hungry, even for a cyclops.' },
        { if: 'var:cyclowrath<0', text: 'This room has an exit on the northwest, and a staircase leading up. The cyclops, having eaten the hot peppers, appears to be gasping. His enflamed tongue protrudes from his man-sized mouth.' },
      ],
      dark: true,
      exits: {
        northwest: 'maze_15',
        east: { to: 'strange_passage', denials: [{ if: '!flag:magic_word', text: 'The east wall is solid rock.' }] },
        up: { to: 'treasure_room', denials: [{ if: '!flag:cyclops_asleep & !flag:magic_word', text: 'The cyclops doesn’t look like he’ll let you past.' }] },
      },
      items: [],
      npcs: ['cyclops'],
      // M-ENTER: an angry or gasping cyclops picks up where he left off.
      onEnter: [{ if: '!var:cyclowrath=0 & alive:cyclops & !flag:cyclops_asleep', then: 'cyclops_wakes_up', repeat: true }],
      instead: { ulysses: [{ if: 'with:cyclops & !flag:cyclops_asleep', then: 'cyclops_flees' }] },
    },
    maze_15: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { west: 'maze_14', south: 'maze_7', southeast: 'cyclops_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_14: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { west: 'maze_15', northwest: 'maze_14', northeast: 'maze_7', south: 'maze_7' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_13: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { east: 'maze_9', down: 'maze_12', south: 'maze_10', west: 'maze_11' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    dead_end_4: {
      name: 'Dead End',
      description: 'You have come to a dead end in the maze.',
      dark: true,
      tags: ['maze'],
      exits: { south: 'maze_12' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_12: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { southwest: 'maze_11', east: 'maze_13', up: 'maze_9', north: 'dead_end_4', down: { to: 'maze_5', then: 'maze_diode' } },
      items: [],
      npcs: [],
      onEnter: [],
    },
    grating_room: {
      name: 'Grating Room',
      description: 'You are in a small room near the maze. There are twisty passages in the immediate vicinity. Above you is a grating locked with a skull-and-crossbones lock.',
      descriptions: [
        { if: 'open:grate', text: 'You are in a small room near the maze. There are twisty passages in the immediate vicinity. Above you is an open grating with sunlight pouring in.' },
        { if: '!locked:grate', text: 'You are in a small room near the maze. There are twisty passages in the immediate vicinity. Above you is a grating.' },
      ],
      dark: true,
      exits: {
        southwest: 'maze_11',
        up: { to: 'grating_clearing', door: 'grate' },
      },
      items: ['sunlight'],
      npcs: [],
      onEnter: [],
      scenery: ['grate'],
    },
    maze_11: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { northeast: 'grating_room', down: 'maze_10', northwest: 'maze_13', southwest: 'maze_12' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_10: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { east: 'maze_9', west: 'maze_13', up: 'maze_11' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_9: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { north: 'maze_6', east: 'maze_10', south: 'maze_13', west: 'maze_12', northwest: 'maze_9', down: { to: 'maze_11', then: 'maze_diode' } },
      items: [],
      npcs: [],
      onEnter: [],
    },
    dead_end_3: {
      name: 'Dead End',
      description: 'You have come to a dead end in the maze.',
      dark: true,
      tags: ['maze'],
      exits: { north: 'maze_8' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_8: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { northeast: 'maze_7', west: 'maze_8', southeast: 'dead_end_3' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_7: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { up: 'maze_14', west: 'maze_6', east: 'maze_8', south: 'maze_15', down: { to: 'dead_end_1', then: 'maze_diode' } },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_6: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { down: 'maze_5', east: 'maze_7', west: 'maze_6', up: 'maze_9' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    dead_end_2: {
      name: 'Dead End',
      description: 'You have come to a dead end in the maze.',
      dark: true,
      tags: ['maze'],
      exits: { west: 'maze_5' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_5: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike. A skeleton, probably the remains of a luckless adventurer, lies here.',
      dark: true,
      tags: ['maze'],
      exits: { east: 'dead_end_2', north: 'maze_3', southwest: 'maze_6' },
      items: ['bones', 'bag_of_coins', 'keys', 'burned_out_lantern', 'rusty_knife'],
      npcs: [],
      onEnter: [],
    },
    dead_end_1: {
      name: 'Dead End',
      description: 'You have come to a dead end in the maze.',
      dark: true,
      tags: ['maze'],
      exits: { south: 'maze_4' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_4: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { west: 'maze_3', north: 'maze_1', east: 'dead_end_1' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_3: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { west: 'maze_2', north: 'maze_4', up: 'maze_5' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_2: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { south: 'maze_1', east: 'maze_3', down: { to: 'maze_4', then: 'maze_diode' } },
      items: [],
      npcs: [],
      onEnter: [],
    },
    maze_1: {
      name: 'Maze',
      description: 'This is part of a maze of twisty little passages, all alike.',
      dark: true,
      tags: ['maze'],
      exits: { east: 'troll_room', north: 'maze_1', south: 'maze_2', west: 'maze_4' },
      items: [],
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
    gallery: {
      name: 'Gallery',
      description:
        'This is an art gallery. Most of the paintings have been stolen by vandals with exceptional taste. The vandals left through either the north or west exits.',
      exits: { west: 'east_of_chasm', north: 'studio' },
      items: ['painting'],
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
    troll_room: {
      name: 'The Troll Room',
      description:
        'This is a small room with passages to the east and south and a forbidding hole leading west. Bloodstains and deep scratches (perhaps made by an axe) mar the walls.',
      dark: true,
      exits: {
        south: 'cellar',
        east: { to: 'ew_passage', denials: [{ if: 'awake:troll', text: 'The troll fends you off with a menacing gesture.' }] },
        west: { to: 'maze_1', denials: [{ if: 'awake:troll', text: 'The troll fends you off with a menacing gesture.' }] },
      },
      items: [],
      npcs: ['troll'],
      onEnter: [],
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
    living_room: {
      tags: ['sacred'],
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
    attic: {
      tags: ['sacred'],
      name: 'Attic',
      description: 'This is the attic. The only exit is a stairway leading down.',
      dark: true,
      exits: { down: 'kitchen' },
      items: ['attic_table', 'rope'],
      npcs: [],
      onEnter: [],
    },
    kitchen: {
      tags: ['sacred'],
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
    clearing: {
      tags: ['sacred'],
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
    grating_clearing: {
      tags: ['sacred'],
      name: 'Clearing',
      description: CLEARING,
      descriptions: [{ if: 'flag:grate_revealed', text: `${CLEARING} There is a grating securely fastened into the ground.` }],
      exits: {
        north: { denial: 'The forest becomes impenetrable to the north.' },
        east: 'forest_2',
        west: 'forest_1',
        south: 'path',
        down: { to: 'grating_room', if: 'flag:grate_revealed', door: 'grate' },
      },
      items: ['leaves'],
      npcs: [],
      onEnter: [],
      scenery: ['white_house', 'grate'],
    },
    up_a_tree: {
      tags: ['sacred'],
      name: 'Up a Tree',
      description:
        'You are about 10 feet above the ground nestled among some large branches. The nearest branch above you is above your reach.',
      exits: { down: 'path', up: { denial: 'You cannot climb any higher.' } },
      items: ['nest'],
      npcs: [],
      onEnter: [],
      scenery: inForest,
    },
    path: {
      tags: ['sacred'],
      name: 'Forest Path',
      description:
        'This is a path winding through a dimly lit forest. The path heads north-south here. One particularly large tree with some low branches stands at the edge of the path.',
      exits: { up: 'up_a_tree', north: 'grating_clearing', east: 'forest_2', south: 'north_of_house', west: 'forest_1' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: inForest,
    },
    forest_3: {
      tags: ['sacred'],
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
    forest_2: {
      tags: ['sacred'],
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
    forest_1: {
      tags: ['sacred'],
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
    east_of_house: {
      tags: ['sacred'],
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
    south_of_house: {
      tags: ['sacred'],
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
    north_of_house: {
      tags: ['sacred'],
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
    west_of_house: {
      tags: ['sacred'],
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
    sunlight: {
      name: 'sunlight',
      aliases: ['daylight', 'sun'],
      description: 'Sunlight pours in through the open grating.',
      portable: false,
      tags: [],
      scenery: true,
      light: true,
    },
    bones: {
      name: 'skeleton',
      aliases: ['bones', 'body', 'remains'],
      description: 'There’s nothing special about the skeleton.',
      portable: false,
      tags: [],
      scenery: true,
      // SKELETON: disturbing the remains brings the ghost.
      instead: {
        take: [{ then: 'ghost_curse' }],
        move: [{ then: 'ghost_curse' }],
        smash: [{ then: 'ghost_curse' }],
        attack: [{ then: 'ghost_curse' }],
      },
    },
    burned_out_lantern: {
      name: 'burned-out lantern',
      aliases: ['lantern', 'lamp', 'rusty lantern', 'dead lantern', 'useless lantern'],
      description: 'There’s nothing special about the burned-out lantern.',
      initialDescription: 'The deceased adventurer’s useless lantern is here.',
      portable: true,
      size: 20,
      tags: [],
    },
    rusty_knife: {
      name: 'rusty knife',
      aliases: ['knife', 'knives'],
      description: 'There’s nothing special about the rusty knife.',
      initialDescription: 'Beside the skeleton is a rusty knife.',
      portable: true,
      size: 20,
      weapon: true,
      tags: [],
      // RUSTY-KNIFE-FCN: the sword knows it; and it turns on whoever fights with it.
      instead: {
        take: [{ if: 'has:sword', say: ['As you touch the rusty knife, your sword gives a single pulse of blinding blue light.'], continue: true }],
        attack: [{ then: 'rusty_knife_kills' }],
      },
    },
    keys: {
      name: 'skeleton key',
      aliases: ['key'],
      description: 'There’s nothing special about the skeleton key.',
      portable: true,
      size: 10,
      tags: [],
    },
    bag_of_coins: {
      name: 'leather bag of coins',
      aliases: ['bag', 'coins', 'bag of coins', 'leather bag', 'old bag'],
      description: 'There’s nothing special about the leather bag of coins.',
      roomDescription: 'An old leather bag, bulging with coins, is here.',
      portable: true,
      size: 15,
      treasure: 5,
      tags: [],
      after: { take: [{ if: '!flag:took_coins', then: 'took_coins' }] },
    },
    chalice: {
      name: 'chalice',
      aliases: ['cup', 'silver chalice', 'silver'],
      description: 'There’s nothing special about the chalice.',
      roomDescription: 'There is a silver chalice, intricately engraved, here.',
      portable: true,
      size: 10,
      treasure: 5,
      tags: [],
      container: { weight: 5 },
      after: { take: [{ if: '!flag:took_chalice', then: 'took_chalice' }] },
      // CHALICE-FCN: not while its owner is fighting for it.
      instead: { take: [{ if: 'inside:chalice:treasure_room & seen:thief & fighting:thief', say: ['You’d be stabbed in the back first.'] }] },
    },
    stiletto: {
      name: 'stiletto',
      aliases: ['vicious stiletto'],
      description: 'There’s nothing special about the stiletto.',
      portable: true,
      size: 10,
      weapon: true,
      tags: [],
    },
    large_bag: {
      name: 'large bag',
      aliases: ['bag', 'thiefs bag'],
      description: 'There’s nothing special about the large bag.',
      portable: false,
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
      treasure: 6,
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
      treasure: 5,
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
      treasure: 4,
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
      container: { openable: true, locked: true, key: 'keys', opened: 'The grating opens.', closed: 'The grating is closed.' },
      // GRATE-FUNCTION: the lock is reachable only from below; opening lets daylight in.
      instead: {
        open: [
          { if: '!flag:grate_revealed & in:grating_clearing', say: ['You can’t see any grating here!'] },
          { if: 'locked:grate', say: ['The grating is locked.'] },
          { if: '!open:grate', then: 'grate_opens' },
        ],
        close: [{ if: 'open:grate', then: 'grate_closes' }],
        unlock: [
          { if: 'in:grating_clearing', with: 'keys', say: ['You can’t reach the lock from here.'] },
          { with: 'keys', then: 'grate_unlocked' },
        ],
        lock: [{ if: 'in:grating_clearing', say: ['You can’t lock it from this side.'] }],
        examine: [{ if: '!flag:grate_revealed', say: ['You can’t see any grating here!'] }],
      },
    },
  },

  npcs: {
    thief: {
      name: 'thief',
      aliases: ['robber', 'man', 'person', 'suspicious man', 'seedy man', 'shady man'],
      description: 'There is a suspicious-looking individual, holding a bag, leaning against one wall. He is armed with a vicious-looking stiletto.',
      descriptions: [{ if: '!awake:thief', text: 'There is a suspicious-looking individual lying unconscious on the ground.' }],
      hidden: true,
      holds: ['stiletto', 'large_bag'],
      refuseOrder: 'The thief is a strong, silent type.',
      combat: {
        strength: 5,
        weapon: 'stiletto',
        fears: { item: 'knife', by: 1 },
        firstStrike: 20,
        onBusy: 'thief_busy',
        onDeath: 'thief_dies',
        onUnconscious: 'thief_out',
        onWake: 'thief_wakes',
        messages: {
          missed: [
            'The thief stabs nonchalantly with his stiletto and misses.',
            'You dodge as the thief comes in low.',
            'You parry a lightning thrust, and the thief salutes you with a grim nod.',
            'The thief tries to sneak past your guard, but you twist away.',
          ],
          unconscious: ['Shifting in the midst of a thrust, the thief knocks you unconscious with the haft of his stiletto.', 'The thief knocks you out.'],
          killed: [
            'Finishing you off, the thief inserts his blade into your heart.',
            'The thief comes in from the side, feints, and inserts the blade into your ribs.',
            'The thief bows formally, raises his stiletto, and with a wry grin, ends the battle and your life.',
          ],
          lightWound: [
            'A quick thrust pinks your left arm, and blood starts to trickle down.',
            'The thief draws blood, raking his stiletto across your arm.',
            'The stiletto flashes faster than you can follow, and blood wells from your leg.',
            'The thief slowly approaches, strikes like a snake, and leaves you wounded.',
          ],
          seriousWound: [
            'The thief strikes like a snake! The resulting wound is serious.',
            'The thief stabs a deep cut in your upper arm.',
            'The stiletto touches your forehead, and the blood obscures your vision.',
            'The thief strikes at your wrist, and suddenly your grip is slippery with blood.',
          ],
          stagger: [
            'The butt of his stiletto cracks you on the skull, and you stagger back.',
            'The thief rams the haft of his blade into your stomach, leaving you out of breath.',
            'The thief attacks, and you fall back desperately.',
          ],
          loseWeapon: [
            'A long, theatrical slash. You catch it on your {weapon}, but the thief twists his knife, and the {weapon} goes flying.',
            'The thief neatly flips your {weapon} out of your hands, and it drops to the floor.',
            'You parry a low thrust, and your {weapon} slips out of your hand.',
          ],
        },
      },
      instead: {
        throw: [{ if: '!fighting:thief', with: 'knife', then: 'thief_knife' }, { then: 'thief_gift' }],
        give: [{ then: 'thief_gift' }],
        take: [{ say: ['Once you got him, what would you do with him?'] }],
        examine: [
          {
            say: [
              'The thief is a slippery character with beady eyes that flit back and forth. He carries, along with an unmistakable arrogance, a large bag over his shoulder and a vicious stiletto, whose blade is aimed menacingly in your direction. I’d watch out if I were you.',
            ],
          },
        ],
        listen: [{ say: ['The thief says nothing, as you have not been formally introduced.'] }],
      },
    },
    cyclops: {
      name: 'cyclops',
      description: 'A hungry cyclops is standing at the foot of the stairs.',
      descriptions: [{ if: 'flag:cyclops_asleep', text: 'The cyclops is sleeping like a baby, albeit a very ugly one.' }],
      // NDESCBIT: his room describes him.
      scenery: true,
      refuseOrder: 'The cyclops prefers eating to making conversation.',
      instead: {
        give: [{ then: 'cyclops_gift' }],
        throw: [{ if: '!flag:cyclops_asleep', then: 'cyclops_shrugs' }],
        attack: [{ if: 'flag:cyclops_asleep', then: 'cyclops_woken' }, { then: 'cyclops_shrugs' }],
        smash: [{ if: 'flag:cyclops_asleep', then: 'cyclops_woken' }, { then: 'cyclops_dodges' }],
        take: [{ say: ['The cyclops doesn’t take kindly to being grabbed.'] }],
        listen: [{ say: ['You can hear his stomach rumbling.'] }],
        order: [{ if: 'flag:cyclops_asleep', say: ['No use talking to him. He’s fast asleep.'] }],
      },
    },
    troll: {
      name: 'troll',
      description: 'A nasty-looking troll, brandishing a bloody axe, blocks all passages out of the room.',
      descriptions: [
        { if: '!awake:troll', text: 'An unconscious troll is sprawled on the floor. All passages out of the room are open.' },
        { if: 'var:troll_ldesc=1', text: 'A pathetically babbling troll is here.' },
        { if: 'var:troll_ldesc=2', text: 'A troll is here.' },
      ],
      holds: ['axe'],
      refuseOrder: 'The troll isn’t much of a conversationalist.',
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
    cyclops: { default: 'The cyclops prefers eating to making conversation.', 'flag:cyclops_asleep': 'No use talking to him. He’s fast asleep.' },
    troll: { default: 'The troll isn’t much of a conversationalist.' },
    thief: { default: 'The thief is a strong, silent type.' },
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
    // I-CYCLOPS: each turn with you he grows angrier (or more parched), and past 5 he eats you.
    cyclops_turn: (ctx) => {
      if (ctx.state.flags.cyclops_asleep || !ctx.npcIn('cyclops', ctx.room())) return ctx.npcIn('cyclops', ctx.room()) ? [] : [{ clear: 'cyclops_daemon' }];
      const wrath = ctx.state.vars?.cyclowrath ?? 0;
      if (Math.abs(wrath) > 5) {
        return [
          { clear: 'cyclops_daemon' },
          { die: 'The cyclops, tired of all of your games and trickery, grabs you firmly. As he licks his chops, he says “Mmm. Just like Mom used to make ’em.” It’s nice to be appreciated.' },
        ];
      }
      const next = wrath < 0 ? wrath - 1 : wrath + 1;
      const mad = [
        'The cyclops seems somewhat agitated.',
        'The cyclops appears to be getting more agitated.',
        'The cyclops is moving about the room, looking for something.',
        'The cyclops was looking for salt and pepper. No doubt they are condiments for his upcoming snack.',
        'The cyclops is moving toward you in an unfriendly manner.',
        'You have two choices: 1. Leave  2. Become dinner.',
      ];
      return [{ setVar: 'cyclowrath', to: next }, mad[Math.abs(next) - 1]];
    },
    // CYCLOPS-FCN's GIVE: the lunch makes him thirsty; then a drink puts him to sleep.
    cyclops_gift: (ctx) => {
      const item = ctx.command?.target;
      const words = ctx.command?.words?.target ?? '';
      const wrath = ctx.state.vars?.cyclowrath ?? 0;
      const isWater = item === 'water' || (item === 'bottle' && ctx.holder('water') === 'bottle') || /water/.test(words);
      if (item === 'lunch') {
        if (wrath < 0) return [{ set: 'cyclops_daemon' }];
        return [
          { move: 'lunch', to: null },
          'The cyclops says “Mmm Mmm. I love hot peppers! But oh, could I use a drink. Perhaps I could drink the blood of that thing.”  From the gleam in his eye, it could be surmised that you are “that thing”.',
          { setVar: 'cyclowrath', to: Math.min(-1, -wrath) },
          { set: 'cyclops_daemon' },
        ];
      }
      if (isWater) {
        if (wrath >= 0) return ['The cyclops apparently is not thirsty and refuses your generous offer.'];
        return [
          { move: 'water', to: null },
          { move: 'bottle', to: 'here' },
          { open: 'bottle' },
          { set: 'cyclops_asleep' },
          'The cyclops takes the bottle, checks that it’s open, and drinks the water. A moment later, he lets out a yawn that nearly blows you over, and then falls fast asleep (what did you put in that drink, anyway?).',
        ];
      }
      if (item === 'garlic') return ['The cyclops may be hungry, but there is a limit.'];
      return ['The cyclops is not so stupid as to eat THAT!'];
    },
    // THROW or ATTACK: a shrug, and his patience starts to run out.
    cyclops_shrugs: (ctx) => {
      const thrown = ctx.command?.verb === 'throw' ? ctx.command.target : undefined;
      return [
        { set: 'cyclops_daemon' },
        'The cyclops shrugs but otherwise ignores your pitiful attempt.',
        ...(thrown ? [{ move: thrown, to: 'here' } as EventStep] : []),
      ];
    },
    // Woken by violence: back on his feet, as angry as before.
    cyclops_woken: (ctx) => [
      'The cyclops yawns and stares at the thing that woke him up.',
      { clear: 'cyclops_asleep' },
      { setVar: 'cyclowrath', to: Math.abs(ctx.state.vars?.cyclowrath ?? 0) },
      { set: 'cyclops_daemon' },
    ],
    // GRATE-FUNCTION's OPEN: daylight below, and the leaves fall on your head the first time.
    grate_opens: (ctx) => {
      const below = ctx.room() !== 'grating_clearing';
      const steps: EventStep[] = [{ open: 'grate' }, { switch: 'sunlight', on: true }, below ? 'The grating opens to reveal trees above you.' : 'The grating opens.'];
      if (below && !ctx.state.flags.grate_revealed) {
        steps.push('A pile of leaves falls onto your head and to the ground.', { set: 'grate_revealed' }, { move: 'leaves', to: 'grating_room' });
      }
      return steps;
    },
    // SKELETON: the ghost banishes the treasures here and in your hands to the Land of the Living Dead.
    ghost_curse: (ctx) => {
      const here = ctx.children(ctx.room()).filter((id) => ctx.treasure(id) > 0);
      const carried = ctx.children('player').filter((id) => ctx.treasure(id) > 0);
      return [
        'A ghost appears in the room and is appalled at your desecration of the remains of a fellow adventurer. He casts a curse on your valuables and banishes them to the Land of the Living Dead. The ghost leaves, muttering obscenities.',
        ...[...here, ...carried].map((id): EventStep => ({ move: id, to: null })),
      ];
    },
    chimney_climbed: (ctx) => (ctx.state.itemState.trap_door?.open ? [] : [{ clear: 'trap_door_barred' }]),
    thief_turn: thiefTurn,
    thief_stole_light: (ctx) => (ctx.arg === 'lit' && !ctx.lit() ? ['The thief seems to have left you in the dark.'] : []),
    // TREASURE-ROOM-FCN: he rushes in, fights, and his treasures vanish.
    thief_lair: (ctx) => [
      ...(ctx.npcIn('thief', 'treasure_room')
        ? []
        : ['You hear a scream of anguish as you violate the robber’s hideaway. Using passages unknown to you, he rushes to its defense.', { moveNpc: 'thief', to: 'treasure_room' } as EventStep]),
      { npcState: 'thief', fighting: true, hidden: false },
      'The thief gestures mysteriously, and the treasures in the room suddenly vanish.',
      ...ctx.children('treasure_room').filter((id) => id !== 'chalice').map((id): EventStep => ({ hide: id })),
    ],
    // F-BUSY?: he picks his stiletto back up.
    thief_busy: (ctx) => {
      const room = ctx.rooms().find((r) => ctx.npcIn('thief', r));
      if (!room || ctx.holder('stiletto') !== room) return [];
      return [{ move: 'stiletto', to: 'thief' }, ...(room === ctx.room() ? ['The robber, somewhat surprised at this turn of events, nimbly retrieves his stiletto.'] : [])];
    },
    // F-CONSCIOUS.
    thief_wakes: (ctx) => {
      const room = ctx.rooms().find((r) => ctx.npcIn('thief', r));
      return [
        ...(room === ctx.room()
          ? [{ npcState: 'thief', fighting: true } as EventStep, 'The robber revives, briefly feigning continued unconsciousness, and, when he sees his moment, scrambles away from you.']
          : []),
        ...(room && ctx.holder('stiletto') === room ? [{ move: 'stiletto', to: 'thief' } as EventStep] : []),
      ];
    },
    // F-DEAD: his stiletto and booty drop; in his lair, his magic fails.
    thief_dies: (ctx) => {
      const here = ctx.room();
      const steps: EventStep[] = [{ move: 'stiletto', to: 'here' }, { reveal: 'stiletto' }];
      const booty = ctx.children('thief').filter((id) => !['stiletto', 'large_bag'].includes(id) && ctx.treasure(id) > 0);
      for (const id of booty) steps.push({ move: id, to: 'here' }, { reveal: id });
      if (here === 'treasure_room') {
        const hidden = ctx.children('treasure_room').filter((id) => id !== 'chalice' && ctx.state.itemState[id]?.hidden);
        if (hidden.length > 0) steps.push('As the thief dies, the power of his magic decreases, and his treasures reappear:');
        for (const id of hidden) steps.push({ reveal: id }, `  A ${ctx.world.items[id].name}`);
        steps.push('The chalice is now safe to take.');
      } else if (booty.length > 0) steps.push('His booty remains.');
      return steps;
    },
    // Throwing the knife at him.
    thief_knife: (ctx) => {
      const steps: EventStep[] = [{ move: 'knife', to: 'here' }];
      if (prob(ctx, 10)) {
        const loot = ctx.children('thief').filter((id) => !['stiletto', 'large_bag'].includes(id));
        for (const id of loot) steps.push({ move: id, to: 'here' }, { reveal: id });
        steps.push(`You evidently frightened the robber, though you didn’t hit him. He flees${loot.length ? ', but the contents of his bag fall on the floor.' : '.'}`, { npcState: 'thief', hidden: true });
      } else {
        steps.push('You missed. The thief makes no attempt to take the knife, though it would be a fine addition to the collection in his bag. He does seem angered by your attempt.', { npcState: 'thief', fighting: true });
      }
      return steps;
    },
    // A gift: a treasure stops him in his tracks; anything else goes in the bag.
    thief_gift: (ctx) => {
      const item = ctx.command?.target;
      if (!item || item === 'thief') return [];
      const strength = ctx.npc('thief')?.strength ?? 5;
      const steps: EventStep[] = strength < 0 ? [{ npcState: 'thief', strength: -strength }, 'Your proposed victim suddenly recovers consciousness.'] : [];
      steps.push({ move: item, to: 'thief' }, { hide: item });
      const name = ctx.world.items[item]?.name ?? item;
      if (ctx.treasure(item) > 0) steps.push({ npcState: 'thief', fighting: false }, `The thief is taken aback by your unexpected generosity, but accepts the ${name} and stops to admire its beauty.`);
      else steps.push(`The thief places the ${name} in his bag and thanks you politely.`);
      return steps;
    },
    // AWAKEN: a knocked-out troll comes round when you meddle with him.
    troll_wake_if_out: (ctx) => {
      const strength = ctx.npc('troll')?.strength ?? 0;
      return strength < 0 ? [{ npcState: 'troll', strength: -strength }, { run: 'troll_wakes' }] : [];
    },
    // I-SWORD: the sword glows near living monsters, brightly beside one.
    sword_glow: (ctx) => {
      // INFESTED?: a living, visible character in the room.
      const infested = (room: string) =>
        Object.keys(ctx.world.npcs).some((id) => ctx.npcIn(id, room) && ctx.npc(id)?.strength !== 0 && !ctx.hidden(id));
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
    ulysses: { words: ['ulysses', 'odysseus'], target: 'none', reply: 'Wasn’t he a sailor?' },
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
    { flag: 'treasure_room_visited', points: 25 },
    { flag: 'took_coins', points: 10 },
    { flag: 'took_chalice', points: 10 },
    { if: 'inside:bag_of_coins:trophy_case', points: 5 },
    { if: 'inside:chalice:trophy_case', points: 5 },
    { if: 'inside:egg:trophy_case', points: 5 },
    { if: 'inside:canary:trophy_case', points: 4 },
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

  vars: { lamp_fuel: 185, sword_glow: 0, troll_ldesc: 0, cyclowrath: 0 },

  // Zork's LAMP-TABLE: warnings after 100, 170 and 185 lit turns; out on the next.
  daemons: [
    // I-CYCLOPS: queued during play, so it's the newest interrupt and runs first.
    { if: 'flag:cyclops_daemon', then: [{ script: 'cyclops_turn' }] },
    { if: 'on:lamp', then: [{ add: 'lamp_fuel', by: -1 }] },
    { if: 'on:lamp & var:lamp_fuel=85 & here:lamp', then: ['The lamp appears a bit dimmer.'] },
    { if: 'on:lamp & var:lamp_fuel=15 & here:lamp', then: ['The lamp is definitely dimmer now.'] },
    { if: 'on:lamp & var:lamp_fuel=0 & here:lamp', then: ['The lamp is nearly out.'] },
    { if: 'on:lamp & var:lamp_fuel<0', then: 'lamp_dies' },
    // I-THIEF: GO queues it after the sword and before the lantern, so it runs between them.
    { if: 'alive:thief & awake:thief', then: [{ script: 'thief_turn' }] },
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
    thief_lair: [{ script: 'thief_lair' }],
    thief_busy: [{ script: 'thief_busy' }],
    thief_dies: [{ script: 'thief_dies' }],
    thief_out: [{ move: 'stiletto', to: 'here' }, { clear: 'thief_here' }],
    thief_wakes: [{ script: 'thief_wakes' }],
    thief_knife: [{ script: 'thief_knife' }],
    thief_gift: [{ script: 'thief_gift' }],
    cyclops_wakes_up: [{ set: 'cyclops_daemon' }],
    cyclops_gift: [{ script: 'cyclops_gift' }],
    cyclops_shrugs: [{ script: 'cyclops_shrugs' }],
    cyclops_dodges: [{ set: 'cyclops_daemon' }, '“Do you think I’m as stupid as my father was?”, he says, dodging.'],
    cyclops_woken: [{ script: 'cyclops_woken' }],
    cyclops_turn: [{ script: 'cyclops_turn' }],
    cyclops_flees: [
      { set: 'magic_word' },
      { clear: 'cyclops_daemon' },
      'The cyclops, hearing the name of his father’s deadly nemesis, flees the room by knocking down the wall on the east of the room.',
      { moveNpc: 'cyclops', to: null },
    ],
    maze_diode: ['You won’t be able to get back up to the tunnel you are going through when it gets to the next room.'],
    grate_unlocked: [{ unlock: 'grate' }, 'The grate is unlocked.'],
    grate_opens: [{ script: 'grate_opens' }],
    grate_closes: [{ close: 'grate' }, { switch: 'sunlight', on: false }, 'The grating is closed.'],
    ghost_curse: [{ script: 'ghost_curse' }],
    rusty_knife_kills: [
      { move: 'rusty_knife', to: null },
      { die: 'As the knife approaches its victim, your mind is submerged by an overmastering will. Slowly, your hand turns, until the rusty blade is an inch from your neck. The knife seems to sing as it savagely slits your throat.' },
    ],
    took_coins: [{ set: 'took_coins' }],
    took_chalice: [{ set: 'took_chalice' }],
    treasure_room_points: [{ set: 'treasure_room_visited' }],
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
