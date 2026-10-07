import { exitTarget } from '@/engine/describe';
import { moveItem, PLAYER } from '@/engine/model';
import type { ScriptContext } from '@/engine/scripts';
import type { GameState } from '@/types/game';
import type { EventStep, World } from '@/types/world';

/**
 * Zork II's balloon, as a native slice (engine parity 6a, Task 11): the volcano's floor, its air
 * rooms and its two ledges, the wicker basket and its receptacle, burning fuel to rise, the
 * three-turn I-BALLOON clock that moves it up and down, landing, tying up and the balloon going
 * on without you. Text from Infocom's story file (Release 63) and its source
 * (historicalsource/zork2, MIT License, Copyright (c) 2025 Microsoft);
 * tests/worlds/zork2-slices.test.ts plays it against the story file. Only what the slice needs.
 */

const DIRS: Record<string, string> = { n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest' };

/** RISE-AND-SHINE's and DECLINE-AND-FALL's tables (Zork's LKP: the entry after the balloon's place). */
const UPS: Record<string, string> = { vair_1: 'vair_2', vair_2: 'vair_3', vair_3: 'vair_4' };
const FLOATS: Record<string, string> = { ledge_1: 'vair_2', vair_2: 'ledge_2', ledge_2: 'vair_4' };
const DOWNS: Record<string, string> = { vair_4: 'vair_3', vair_3: 'vair_2', vair_2: 'vair_1' };
/** Where PUT-BALLOON lets you watch it go (the player's room, wherever the balloon is). */
const WATCHING = ['ledge_1', 'ledge_2', 'volcano_bottom'];

/**
 * QUEUE I-BALLOON 3 from a command: Zork's clock counts it down that same turn, the engine's from
 * the next, so 2; from inside I-BALLOON itself, 3 (the clock has passed its slot this turn).
 */
const REQUEUE: EventStep = { schedule: 'balloon', in: 2 };

/** The direction GO was given, spelled out (LAND is one of Zork's directions). */
function typedDirection(ctx: ScriptContext): string {
  if (ctx.command?.verb === 'land') return 'land';
  const word = (ctx.command?.words?.target ?? '').toLowerCase().trim();
  return DIRS[word] ?? word;
}

/** What's burning in the receptacle (BINF-FLAG), by name. */
function fuel(ctx: ScriptContext): string | undefined {
  const id = ctx.children('receptacle')[0];
  return id ? ctx.world.items[id].name : undefined;
}

/** The balloon's place (BLOC). */
function bloc(ctx: ScriptContext): string {
  return String(ctx.holder('balloon'));
}

/** PUT-BALLOON: the balloon moves on without you (and you watch, from a ledge or the floor). */
function putBalloon(ctx: ScriptContext, there: string, how: string): EventStep[] {
  return [...(WATCHING.includes(ctx.room()) ? [`You watch as the balloon slowly ${how}`] : []), { moveVehicle: 'balloon', to: there }];
}

export const balloonWorld: World = {
  style: 'infocom',
  startRoom: 'volcano_bottom',
  flagLabels: {},
  dialogue: {},
  wait: { turns: 3 },
  idle: 'Time passes...',
  vars: { match_count: 6 },

  verbs: {
    // LAND is a direction in Zork; on foot, nowhere has one.
    land: { words: ['land'], target: 'none', reply: 'You can’t go that way.' },
    tie: { words: ['tie', 'fasten'], target: 'required', indirect: ['to'], reply: 'You can’t tie that to that.' },
    untie: { words: ['untie', 'unfasten'], target: 'required', indirect: ['from'], reply: 'This cannot be tied, so it cannot be untied!' },
  },

  rooms: {
    volcano_bottom: {
      name: 'Volcano Bottom',
      description: 'You are at the bottom of a large dormant volcano. High above you\nlight enters from the cone of the volcano. The only exit is to the north.',
      exits: { north: 'lava_room' },
      items: ['balloon'],
      npcs: [],
      onEnter: [],
    },
    lava_room: {
      name: 'Lava Room',
      description: 'This is a small room, whose walls are formed by an old lava flow.\nThere are exits here to the east and the south.',
      exits: { south: 'volcano_bottom' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    vair_1: {
      name: 'Volcano Core',
      description: 'You are about one hundred feet above the bottom of the volcano. The\ntop of the volcano is clearly visible here.',
      exits: {},
      items: [],
      npcs: [],
      onEnter: [],
      air: true,
    },
    vair_2: {
      name: 'Volcano Near Small Ledge',
      description: 'You are about two hundred feet above the volcano floor. Looming\nabove is the rim of the volcano. There is a small ledge on the west\nside.',
      exits: { west: 'ledge_1', land: 'ledge_1' },
      items: [],
      npcs: [],
      onEnter: [],
      air: true,
    },
    vair_3: {
      name: 'Volcano by Viewing Ledge',
      description:
        'You are high above the floor of the volcano. The rim of the volcano\nlooks very narrow and you are very near it. To the\neast is what appears to be a viewing ledge, too thin to land on.',
      exits: {},
      items: [],
      npcs: [],
      onEnter: [],
      air: true,
    },
    vair_4: {
      name: 'Volcano Near Wide Ledge',
      description: 'You are near the rim of the volcano. Above you it is open to the sky.\nTo the west, there is a place to land on a wide ledge.',
      exits: { land: 'ledge_2', west: 'ledge_2' },
      items: [],
      npcs: [],
      onEnter: [],
      air: true,
    },
    ledge_1: {
      name: 'Narrow Ledge',
      description:
        'You are on a narrow ledge within an old dormant volcano. This ledge is\nabout halfway between the floor below and the rim above. There is an exit\nto the south.',
      exits: { down: { denial: 'I wouldn’t jump from here.' }, west: { to: 'volcano_bottom', if: 'flag:gnome_door' }, south: 'library' },
      items: ['zorkmid', 'hook_1'],
      npcs: [],
      onEnter: [],
    },
    library: {
      name: 'Library',
      description:
        'This must have been a large library, probably for the royal family. All\nof the shelves have been gnawed to pieces by unfriendly gnomes. To the\nnorth is an exit.',
      exits: { north: 'ledge_1', out: 'ledge_1' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    ledge_2: {
      name: 'Wide Ledge',
      description: '',
      // LEDGE-FCN's M-LOOK (which also keeps the basket's own M-LOOK from following it).
      descriptionScript: 'wideLedge',
      exits: { down: { denial: 'It’s a long way down.' }, west: { to: 'volcano_bottom', if: 'flag:gnome_door' }, south: 'safe_room' },
      items: ['hook_2'],
      npcs: [],
      onEnter: [],
    },
    safe_room: {
      name: 'Dusty Room',
      description: 'You are in a dusty old room which is featureless, except\nfor an exit on the north side.',
      exits: { north: 'ledge_2' },
      items: [],
      npcs: [],
      onEnter: [],
    },
  },

  items: {
    // BALLOON: the wicker basket, a vehicle of the air (VTYPE NONLANDBIT).
    balloon: {
      name: 'basket',
      aliases: ['balloon', 'basket', 'wicker basket'],
      description: 'There’s nothing special about the basket.',
      // BALLOON-FCN's M-OBJDESC.
      roomDescriptionScript: 'balloonObjdesc',
      portable: false,
      size: 70,
      container: { open: true, weight: 100 },
      contains: ['receptacle', 'wire', 'cloth_bag'],
      // BALLOON-FCN's M-LOOK, after the room's description, as you look around aboard.
      vehicle: { travels: 'air', descriptionScript: 'balloonLook' },
      tags: [],
      // BALLOON-FCN's M-BEG: walking (or LANDing) is steering, or isn't.
      instead: {
        go: [{ if: 'flag:balloon_tied', then: 'balloon_tied_walk' }, { then: 'balloon_walk' }],
        land: [{ if: 'flag:balloon_tied', then: 'balloon_tied_walk' }, { then: 'balloon_walk' }],
      },
    },
    receptacle: {
      name: 'receptacle',
      aliases: ['receptacle', 'metal receptacle'],
      description: 'The receptacle is closed.',
      scenery: true,
      portable: false,
      container: { openable: true, weight: 6 },
      tags: [],
      // BCONTENTS, and BALLOON-FCN's M-BEG OPEN with something burning inside.
      instead: {
        examine: [{ if: 'open:receptacle', say: ['The receptacle is open.'] }, { say: ['The receptacle is closed.'] }],
        take: [{ say: ['The receptacle is an integral part of the basket and cannot\nbe removed.'] }],
        open: [{ if: 'aboard:balloon & flag:balloon_inflated & inside:newspaper:receptacle', then: 'receptacle_reveals' }],
      },
      // M-BEG PUT: what's put in from aboard isn't listed (NDESCBIT).
      after: { put: [{ as: 'indirect', if: 'aboard:balloon', then: 'fuel_tucked' }] },
    },
    wire: {
      name: 'braided wire',
      aliases: ['wire', 'rope', 'braided wire'],
      description: 'The braided wire is part of the basket. It may be manipulated\nwithin the basket but cannot be removed.',
      scenery: true,
      portable: false,
      tags: [],
      // WIRE-FCN.
      instead: {
        take: [{ say: ['The braided wire is an integral part of the basket and cannot\nbe removed. The wire might possibly be tied, though.'] }],
        examine: [{ say: ['The braided wire is part of the basket. It may be manipulated\nwithin the basket but cannot be removed.'] }],
        tie: [
          { as: 'target', with: 'hook_1', then: 'tie_hook_1' },
          { as: 'target', with: 'hook_2', then: 'tie_hook_2' },
        ],
        untie: [{ as: 'target', if: 'flag:balloon_tied', then: 'balloon_untied' }, { as: 'target', say: ['The wire is not tied to anything.'] }],
      },
    },
    cloth_bag: {
      name: 'cloth bag',
      aliases: ['bag', 'cloth bag'],
      description: 'The cloth bag is part of the basket. It may be manipulated\nwithin the basket but cannot be removed.',
      scenery: true,
      portable: false,
      tags: [],
      // BCONTENTS.
      instead: {
        take: [{ say: ['The cloth bag is an integral part of the basket and cannot\nbe removed.'] }],
        examine: [{ say: ['The cloth bag is part of the basket. It may be manipulated\nwithin the basket but cannot be removed.'] }],
        open: [{ say: ['The bag is enormous. The concept of opening it here is ludicrous.'] }],
      },
    },
    label: {
      name: 'blue label',
      aliases: ['label', 'blue label'],
      description: 'There’s nothing special about the blue label.',
      roomDescription: 'There is a blue label here.',
      portable: true,
      burnable: true,
      size: 1,
      text: '\n !! FROBOZZ MAGIC BALLOON COMPANY !!\n\nHello, Aviator!\n\nTo land your balloon, say LAND\nOtherwise, you’re on your own!\n\nNo warranty expressed or implied.',
      tags: [],
    },
    newspaper: {
      name: 'newspaper',
      aliases: ['paper', 'newspaper', 'news paper'],
      description: 'There’s nothing special about the newspaper.',
      portable: true,
      burnable: true,
      tags: [],
      instead: {
        // V-BURN's Zork II branch: in the receptacle, BALLOON-BURN (PRE-BURN wants a flame first).
        burn: [{ as: 'target', with: 'match', if: 'inside:newspaper:receptacle & on:match', then: 'balloon_burn' }],
        // BALLOON-FCN's M-BEG TAKE.
        take: [{ if: 'aboard:balloon & flag:balloon_inflated & inside:newspaper:receptacle', say: ['You don’t really want to hold a burning newspaper.'] }],
      },
    },
    match: {
      name: 'matchbook',
      aliases: ['match', 'matches', 'matchbook'],
      description: 'No match is burning.',
      roomDescription: 'There is a matchbook saying “Visit ZORK I” here.',
      portable: true,
      size: 2,
      switchable: true,
      flaming: true,
      light: true,
      tags: [],
      // MATCH-FCN.
      instead: {
        turn_on: [{ as: 'target', then: 'strike_match' }],
        burn: [{ as: 'target', then: 'strike_match' }],
      },
    },
    hook_1: {
      name: 'hook',
      aliases: ['hook', 'small hook'],
      description: 'There’s nothing special about the hook.',
      roomDescription: 'There is a small hook attached to the rock here.',
      portable: false,
      tags: [],
    },
    hook_2: {
      name: 'hook',
      aliases: ['hook', 'small hook'],
      description: 'There’s nothing special about the hook.',
      roomDescription: 'There is a small hook attached to the rock here.',
      portable: false,
      tags: [],
    },
    // DEAD-BALLOON: what lands when the fuel has burned out.
    dead_balloon: {
      name: 'broken balloon',
      aliases: ['balloon', 'basket', 'broken balloon'],
      description: 'There’s nothing special about the broken balloon.',
      roomDescription: 'There is a balloon here, broken into pieces.',
      portable: false,
      size: 40,
      tags: [],
    },
    zorkmid: {
      name: 'priceless zorkmid',
      aliases: ['coin', 'zorkmid', 'gold', 'gold zorkmid'],
      description: 'There’s nothing special about the priceless zorkmid.',
      initialDescription: 'On the floor is a priceless gold zorkmid (a valuable collector’s item).',
      roomDescription: 'There is an engraved zorkmid here.',
      portable: true,
      size: 10,
      treasure: 20,
      tags: [],
    },
  },

  npcs: {},

  events: {
    balloon: [{ script: 'iBalloon' }],
    balloon_burn: [{ script: 'balloonBurn' }],
    burnup: [{ script: 'iBurnup' }],
    balloon_walk: [{ script: 'balloonWalk' }],
    balloon_tied_walk: [{ script: 'balloonTiedWalk' }],
    fuel_tucked: [{ script: 'fuelTucked' }],
    receptacle_reveals: ['Opening it reveals a burning newspaper.', { open: 'receptacle' }],
    // WIRE-FCN: tied, the hook drops out of the room's list and the clock stops.
    tie_hook_1: [{ set: 'balloon_tied' }, { unlist: 'hook_1' }, { cancel: 'balloon' }, 'The balloon is fastened to the hook.'],
    tie_hook_2: [{ set: 'balloon_tied' }, { unlist: 'hook_2' }, { cancel: 'balloon' }, 'The balloon is fastened to the hook.'],
    balloon_untied: [REQUEUE, { relist: 'hook_1' }, { relist: 'hook_2' }, { clear: 'balloon_tied' }, 'The wire falls off of the hook.'],
    strike_match: [{ script: 'strikeMatch' }],
    match_out: ['The match has gone out.', { switch: 'match', on: false }],
  },

  scripts: {
    // BALLOON-FCN's M-LOOK.
    balloonLook: (ctx) => {
      let s: string;
      if (ctx.test('flag:balloon_inflated')) {
        s = 'The cloth bag is inflated and ';
        s += ctx.test('open:receptacle') ? `there is a ${fuel(ctx)} burning in the receptacle.` : 'some smoke is leaking out of the closed receptacle.';
      } else {
        s = 'The cloth bag is draped over the side\nof the basket. Directly in the middle of the basket is a metal receptacle\nwhich is ';
        if (ctx.test('open:receptacle')) {
          s += 'open';
          const rc = fuel(ctx);
          if (rc) s += `. A ${rc} is nestled inside`;
        } else s += 'closed';
        s += '.';
      }
      s += ctx.test('flag:balloon_tied') ? ' The balloon is tied to a hook by the braided wire.' : ' A braided wire is dangling over the side of the basket.';
      return [{ say: s }];
    },
    // BALLOON-FCN's M-OBJDESC.
    balloonObjdesc: (ctx) => {
      let s = 'There is a large and extremely heavy wicker basket here. An\nenormous cloth bag ';
      if (ctx.test('flag:balloon_inflated')) {
        s += 'attached to the basket is inflated. A metal receptacle is fastened to\nthe center of the basket. ';
        s += ctx.test('open:receptacle') ? `In it is a burning ${fuel(ctx)}` : 'Some smoke leaks out around its closed lid';
      } else {
        s += 'is draped over the side and is firmly attached to the basket. A metal\nreceptacle is fastened to the center of the basket';
      }
      s += ctx.test('flag:balloon_tied') ? '. A piece of wire tied to a hook holds the balloon in place.' : '. Dangling from the basket is a piece of braided wire.';
      return [{ say: s }];
    },
    // LEDGE-FCN's M-LOOK.
    wideLedge: (ctx) => [
      {
        say: `You are on a wide ledge high in the volcano. The rim of the volcano is\nabout 200 feet above and there is a precipitous drop to the bottom.${ctx.test('flag:safe_munged') ? ' The way to the south is blocked by rubble.' : ' There is a small door to the south.'}`,
      },
    ],
    // M-BEG WALK while tied: any way there is, you're held; any other, you can't steer that way.
    balloonTiedWalk: (ctx) => [typedDirection(ctx) in ctx.world.rooms[ctx.room()].exits ? 'You are tied to the ledge.' : 'You can’t control the balloon this way.'],
    // M-BEG WALK: a way there is, the clock starts over and the move goes on (GOTO's own refusals
    // and “The balloon lands.” included); any other, you can't steer that way.
    balloonWalk: (ctx) => {
      const exit = ctx.world.rooms[ctx.room()].exits[typedDirection(ctx)];
      if (exit === undefined) return ['You can’t control the balloon this way.'];
      const to = exitTarget(exit);
      if (!to) return [REQUEUE, typeof exit === 'string' ? 'You can’t go that way.' : (exit.denial ?? 'You can’t go that way.')];
      if (typeof exit !== 'string' && exit.if && !ctx.test(exit.if)) return [REQUEUE, exit.denial ?? 'You can’t go that way.'];
      const landing = ctx.world.rooms[ctx.room()].air && !ctx.world.rooms[to].air;
      return [REQUEUE, ...(landing ? ['The balloon lands.'] : []), { go: to }];
    },
    // BALLOON-FCN's M-BEG PUT into the receptacle: unlisted from then on.
    fuelTucked: (ctx) => (ctx.command?.target ? [{ unlist: ctx.command.target }] : []),
    // BALLOON-BURN.
    balloonBurn: (ctx) => {
      const id = ctx.command?.target ?? 'newspaper';
      const steps: EventStep[] = [`The ${ctx.world.items[id].name} burns inside the receptacle.`, { schedule: 'burnup', in: (ctx.world.items[id].size ?? 5) * 20 - 1 }];
      if (ctx.test('flag:balloon_inflated')) return steps;
      steps.push('The cloth bag inflates as it fills with hot air.');
      if (!ctx.test('flag:label_dropped')) steps.push('A small label drops from the bag into the basket.', { move: 'label', to: 'balloon' });
      return [...steps, { set: 'label_dropped' }, { set: 'balloon_inflated' }, REQUEUE];
    },
    // I-BURNUP.
    iBurnup: (ctx) => {
      const id = ctx.children('receptacle')[0];
      const steps: EventStep[] = [];
      if (id && ctx.room() === bloc(ctx)) steps.push(`The ${ctx.world.items[id].name} has now burned out, and the cloth bag starts to deflate.`);
      if (id) steps.push({ move: id, to: null });
      return [...steps, { clear: 'balloon_inflated' }];
    },
    // I-BALLOON: up while the fuel burns in the open receptacle (or off a ledge you're on), else down.
    iBalloon: (ctx) => {
      const aboard = ctx.aboard() === 'balloon';
      const at = bloc(ctx);
      const steps: EventStep[] = [{ schedule: 'balloon', in: 3 }];
      const rising = (ctx.test('open:receptacle') && ctx.test('flag:balloon_inflated')) || ctx.room() === 'ledge_1' || ctx.room() === 'ledge_2';
      if (rising) {
        // RISE-AND-SHINE.
        if (at === 'vair_4') {
          steps.push({ cancel: 'burnup' }, { cancel: 'balloon' }, { move: 'balloon', to: null });
          if (aboard) {
            steps.push({
              die: 'The balloon floats majestically out of the volcano, revealing a\nbreathtaking view of a wooded river valley surrounded by impassable\nmountains. In a clearing stands a white house. You drift into high winds,\nwhich carry you towards the snow-capped peaks. Oh, no! You crash into the\njagged cliffs of the Flathead Mountains!',
            });
          } else if (WATCHING.includes(ctx.room())) steps.push('You watch the balloon drift out over the rim and away on the wind.');
          return steps;
        }
        if (UPS[at]) return [...steps, ...(aboard ? ['The balloon ascends.', '', { moveVehicle: 'balloon', to: UPS[at] }] : putBalloon(ctx, UPS[at], 'ascends.'))];
        if (FLOATS[at]) {
          if (aboard) return [...steps, 'The balloon leaves the ledge.', '', { moveVehicle: 'balloon', to: FLOATS[at] }];
          return [...steps, ...putBalloon(ctx, FLOATS[at], 'floats away. It seems to be ascending, due to its light load.'), { open: 'receptacle' }];
        }
        return [...steps, ...(aboard ? ['The balloon rises slowly from the ground.', '', { moveVehicle: 'balloon', to: 'vair_1' }] : putBalloon(ctx, 'vair_1', 'lifts off.'))];
      }
      // DECLINE-AND-FALL: down to the floor, where it lands (GOTO's “The balloon lands.” too)
      // while the fuel burns, and breaks, putting you out, once it's burned out.
      if (at === 'vair_1') {
        if (!aboard) return [...steps, ...putBalloon(ctx, 'volcano_bottom', 'lands.')];
        if (ctx.test('flag:balloon_inflated')) return [...steps, 'The balloon has landed.', '', 'The balloon lands.', { moveVehicle: 'balloon', to: 'volcano_bottom' }];
        return [
          { move: 'balloon', to: null },
          { move: 'dead_balloon', to: 'volcano_bottom' },
          { disembark: true },
          'You have landed, but the balloon did not survive.',
          '',
          { go: 'volcano_bottom' },
        ];
      }
      if (DOWNS[at]) return [...steps, ...(aboard ? ['The balloon descends.', '', { moveVehicle: 'balloon', to: DOWNS[at] }] : putBalloon(ctx, DOWNS[at], 'descends.'))];
      return steps;
    },
    // MATCH-FCN: I-MATCH 2 from a command is 1 here.
    strikeMatch: (ctx) => {
      if (ctx.command?.target !== 'match') return [];
      const count = Math.max((ctx.state.vars?.match_count ?? 0) - 1, 0);
      const steps: EventStep[] = [{ setVar: 'match_count', to: count }];
      if (count <= 0) return [...steps, 'I’m afraid you have run out of matches.'];
      return [...steps, { switch: 'match', on: true }, { schedule: 'match_out', in: 1 }, 'One of the matches starts to burn.'];
    },
  },
};

/** At the Volcano Bottom, the ice melted by the dragon, carrying the matchbook and the newspaper from the Gazebo. */
export function buildVolcanoBottom(state: GameState): void {
  state.currentRoom = 'volcano_bottom';
  state.visited = ['volcano_bottom'];
  for (const id of ['match', 'newspaper']) {
    moveItem(state, id, PLAYER);
    state.itemState[id] = { ...state.itemState[id], moved: true };
  }
}
