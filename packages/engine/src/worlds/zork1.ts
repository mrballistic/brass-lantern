import type { ScriptContext } from '../engine/scripts.ts';
import type { EventStep, World } from '../types/world.ts';

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
// The Maintenance Room's flood, by half-levels (Zork's DROWNINGS).
const DROWNINGS = ['up to your ankles.', 'up to your shin.', 'up to your knees.', 'up to your hips.', 'up to your waist.', 'up to your chest.', 'up to your neck.', 'over your head.', 'high in your lungs.'];
/**
 * Zork's PICK-ONE: a random entry not yet used, until all have been (the order is
 * kept in vars `<key>_1..n`, the count in `<key>`). Returns the steps that save it.
 */
function pickOne(ctx: ScriptContext, key: string, list: string[]): [EventStep[], string] {
  const v = ctx.state.vars ?? {};
  const order = list.map((_, i) => v[`${key}_${i + 1}`] ?? i);
  const count = v[key] ?? 0;
  const pick = count + ctx.roll(list.length - count) - 1;
  const chosen = order[pick];
  [order[pick], order[count]] = [order[count], chosen];
  const next = count + 1 === list.length ? 0 : count + 1;
  return [[...order.map((o, i): EventStep => ({ setVar: `${key}_${i + 1}`, to: o })), { setVar: key, to: next }], list[chosen]];
}
/** CANDLES-FCN: lighting the candles with something. */
function lightWith(ctx: ScriptContext, tool: string): EventStep[] {
  const lit = Boolean(ctx.state.itemState.candles?.on);
  if (tool === 'match' && ctx.state.itemState.match?.on) return lit ? ['The candles are already lit.'] : [{ switch: 'candles', on: true }, 'The candles are lit.'];
  if (tool === 'torch') return lit ? ['You realize, just in time, that the candles are already lighted.'] : [{ move: 'candles', to: null }, 'The heat from the torch is so intense that the candles are vaporized.'];
  return ['You have to light them with something that’s burning, you know.'];
}
/** DEAD-FUNCTION: a spirit's limits, before the parser's own verbs. */
function deadFunction(ctx: ScriptContext): EventStep[] | undefined {
  // The line as typed, or a command already parsed (AGAIN, the intent server's reading).
  const a = ctx.action ?? ctx.parse(ctx.line ?? '');
  if (!a) return;
  const verb = a.action;
  if (['go', 'verbose', 'brief', 'superbrief', 'version', 'save', 'restore', 'load', 'quit', 'restart', 'undo', 'again', 'oops', 'unknown', 'capture'].includes(verb)) return;
  if (['attack', 'smash'].includes(verb)) return ['All such attacks are vain in your condition.'];
  if (['open', 'close', 'eat', 'drink', 'inflate', 'deflate', 'turn', 'burn', 'tie', 'untie', 'rub'].includes(verb)) return ['Even such an action is beyond your capabilities.'];
  if (verb === 'wait') return ['Might as well. You’ve got an eternity.'];
  if (verb === 'turn_on') return ['You need no light to guide you.'];
  if (verb === 'score') return ['You’re dead! How can you think of your score?'];
  if (verb === 'take') return ['Your hand passes through its object.'];
  if (['drop', 'throw', 'inventory'].includes(verb)) return ['You have no possessions.'];
  if (verb === 'diagnose') return ['You are dead.'];
  if (verb === 'look') {
    const lit = !ctx.world.rooms[ctx.room()]?.dark;
    return ['The room looks strange and unearthly and objects appear indistinct.', ...(lit ? [] : ['Although there is no light, the room seems dimly illuminated.']), '', { look: true }];
  }
  if (verb === 'pray') {
    if (ctx.room() !== 'south_temple') return ['Your prayers are not heard.'];
    return [
      { clear: 'dead' },
      'From the distance the sound of a lone trumpet is heard. The room becomes very bright and you feel disembodied. In a moment, the brightness fades and you find yourself rising as if from a long sleep, deep in the woods. In the distance you can faintly hear a songbird and the sounds of the forest.',
      '',
      { go: 'forest_1' },
    ];
  }
  return ['You can’t even do that.'];
}

const WEAPONS = ['sceptre', 'knife', 'sword', 'rusty_knife', 'axe', 'stiletto'];
/** Rooms the boat floats in, and what LAUNCH calls them (RBOAT-FUNCTION). */
const WATERS: Record<string, string> = { river_1: 'river', river_2: 'river', river_3: 'river', river_4: 'river', reservoir: 'reservoir', in_stream: 'stream' };
const DIRS: Record<string, string> = { n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest' };

/** IBOAT-FUNCTION: the pile becomes the magic boat. */
function inflateBoat(ctx: ScriptContext): EventStep[] {
  return [
    'The boat inflates and appears seaworthy.',
    ...(ctx.state.itemState.boat_label?.moved ? [] : ['A tan label is lying inside the boat.']),
    { clear: 'deflate' },
    { move: 'inflatable_boat', to: null },
    { move: 'inflated_boat', to: 'here' },
  ];
}

/** RBOAT-FUNCTION's M-BEG: steering, LAUNCH, and sharp things aboard. */
function boatBeg(ctx: ScriptContext): EventStep[] | undefined {
  const a = ctx.action ?? ctx.parse(ctx.line ?? '');
  if (!a) return;
  const here = ctx.room();
  if (a.action === 'go') {
    const dir = DIRS[a.target ?? ''] ?? a.target ?? '';
    if (['land', 'east', 'west'].includes(dir)) return;
    if (here === 'reservoir' && ['north', 'south'].includes(dir)) return;
    if (here === 'in_stream' && dir === 'south') return;
    return ['Read the label for the boat’s instructions.'];
  }
  if (a.action === 'launch') {
    if (WATERS[here]) return ['(magic boat)', `You are on the ${WATERS[here]}, or have you forgotten?`];
    return launchFrom(ctx, here);
  }
  const word = (w?: string) => (w ?? '').toLowerCase().replace(/^the\s+/, '');
  const named = (w?: string) => WEAPONS.find((id) => ctx.carried(id) && (ctx.world.items[id].name === word(w) || (ctx.world.items[id].aliases ?? []).includes(word(w)) || id === w));
  const sharp =
    (a.action === 'drop' && named(a.target)) ||
    (a.action === 'put' && /boat|raft/.test(word(a.indirect)) && named(a.target)) ||
    (['attack', 'smash'].includes(a.action) && named(a.indirect));
  if (!sharp) return;
  const loot = ctx.children('inflated_boat').filter((id) => ctx.treasure(id) > 0);
  const steps: EventStep[] = [
    { disembark: true },
    { move: 'inflated_boat', to: null },
    { move: 'punctured_boat', to: 'here' },
    ...loot.map((id): EventStep => ({ move: id, to: 'here' })),
    `It seems that the ${ctx.world.items[sharp].name} didn’t agree with the boat, as evidenced by the loud hissing noise issuing therefrom. With a pathetic sputter, the boat deflates, leaving you without.`,
  ];
  if (ctx.water()) {
    steps.push('');
    steps.push({ die: here === 'reservoir' || here === 'in_stream' ? 'Another pathetic sputter, this time from you, heralds your drowning.' : 'In other words, fighting the fierce currents of the Frigid River. You manage to hold your own for a bit, but then you are carried over a waterfall and into some nasty rocks. Ouch!' });
  }
  return steps;
}

/** RIVER-LAUNCH: where LAUNCH takes the boat from each bank. */
const LAUNCHES: Record<string, string> = {
  dam_base: 'river_1',
  white_cliffs_north: 'river_3',
  white_cliffs_south: 'river_4',
  shore: 'river_5',
  sandy_beach: 'river_4',
  reservoir_south: 'reservoir',
  reservoir_north: 'reservoir',
  stream_view: 'in_stream',
};
/** RIVER-SPEEDS and RIVER-NEXT: turns between pulls of the current, and where it pulls you. */
const RIVER_SPEEDS: Record<string, number> = { river_1: 4, river_2: 4, river_3: 3, river_4: 2, river_5: 1 };
const RIVER_NEXT: Record<string, string> = { river_1: 'river_2', river_2: 'river_3', river_3: 'river_4', river_4: 'river_5' };

/** RBOAT-FUNCTION's LAUNCH, through GO-NEXT: into the water, and the current takes over on the river. */
function launchFrom(ctx: ScriptContext, here: string): EventStep[] {
  const to = LAUNCHES[here];
  if (!to) return ['(magic boat)', 'You can’t launch it here.'];
  if (!ctx.water(to)) return ['(magic boat)', 'You can’t go there in a magic boat.'];
  const speed = RIVER_SPEEDS[to];
  // A QUEUE from an action ticks this same turn: one less to wait, or now if that's none.
  const current: EventStep[] = speed === undefined ? [] : speed > 1 ? [{ schedule: 'river_current', in: speed - 1 }] : [{ run: 'river_current' }];
  return ['(magic boat)', { go: to }, ...current];
}

/** SAND-FUNCTION's BDIGS. */
const BDIGS = ['You seem to be digging a hole here.', 'The hole is getting deeper, but that’s about it.', 'You are surrounded by a wall of sand on all sides.'];
/** Things with Zork's TOOLBIT. */
/** V-LEAP: over a thing, or down where there's no safe way; rooms with their own JUMP rule answer for themselves. */
function vLeap(ctx: ScriptContext, target?: string): EventStep[] | undefined {
  const room = ctx.world.rooms[ctx.room()];
  if (target) {
    const word = target.toLowerCase().replace(/^the\s+/, '');
    const named = (id: string, names: string[]) => names.some((n) => n.toLowerCase() === word) || id === word;
    const npc = Object.keys(ctx.world.npcs).find((id) => ctx.npcIn(id, ctx.room()) && !ctx.npc(id)?.hidden && named(id, [ctx.world.npcs[id].name, ...(ctx.world.npcs[id].aliases ?? [])]));
    if (npc) return [`The ${ctx.world.npcs[npc].name} is too big to jump over.`];
    const thing = ctx.children(ctx.room()).find((id) => named(id, [ctx.world.items[id].name, ...(ctx.world.items[id].aliases ?? [])]));
    return thing ? undefined : ['That would be a good trick.'];
  }
  if (room.instead?.jump) return undefined;
  if (ctx.room() === 'up_a_tree') return [{ run: 'tree_leap' }];
  const down = room.exits.down;
  // A message-only way down (NEXIT; Zork's one conditional one, the chimney, is modelled that way): the leap kills (JUMPLOSS).
  if (down && typeof down !== 'string' && !down.to) return [{ run: 'jump_death' }];
  return undefined;
}

/** HACK-HACK: a verb's opening and one of HO-HUM's endings, picked at random. */
const hackHack = (opening: string) => [`${opening} the {target} doesn’t seem to work.`, `${opening} the {target} isn’t notably helpful.`, `${opening} the {target} has no effect.`];
/** V-SKIP's WHEEEEE. */
const WHEEEEE = ['Very good. Now you can go to the second grade.', 'Are you enjoying yourself?', 'Wheeeeeeeeee!!!!!', 'Do you expect me to applaud?'];

// Zork's TOOLBIT things (V-DIG's “slow and tedious”, the parser's guess of a missing tool).
const TOOLS = ['keys', 'pump', 'putty', 'rusty_knife', 'screwdriver', 'shovel', 'wrench'];
/** SAND-FUNCTION with a tool (DIG SAND [WITH …]). */
function digSand(ctx: ScriptContext, tool?: string): EventStep[] {
  if (tool !== 'shovel') return [vDig(ctx, tool)];
  const dig = (ctx.state.vars?.beach_dig ?? -1) + 1;
  if (dig > 3) {
    return [
      { setVar: 'beach_dig', to: -1 },
      ...(ctx.holder('scarab') === ctx.room() ? [{ hide: 'scarab' } as EventStep] : []),
      { die: 'The hole collapses, smothering you.' },
    ];
  }
  if (dig === 3) return [{ setVar: 'beach_dig', to: 3 }, ...(ctx.state.itemState.scarab?.hidden ? ['You can see a scarab here in the sand.', { reveal: 'scarab' } as EventStep] : [])];
  return [{ setVar: 'beach_dig', to: dig }, BDIGS[dig]];
}

/** The parser's GWIM: the one tool (TOOLBIT) held, if exactly one. */
function guessTool(ctx: ScriptContext): string | undefined {
  const held = TOOLS.filter((id) => ctx.carried(id));
  return held.length === 1 ? held[0] : undefined;
}

/** V-DIG: anything but the shovel in the sand. */
function vDig(ctx: ScriptContext, tool?: string): string {
  if (tool === 'shovel') return 'There’s no reason to be digging here.';
  if (!tool) return 'Digging with the pair of hands is slow and tedious.';
  const name = ctx.world.items[tool]?.name ?? tool;
  return TOOLS.includes(tool) ? `Digging with the ${name} is slow and tedious.` : `Digging with a ${name} is silly.`;
}
const NO_TREE = 'There is no tree here suitable for climbing.';
const BOARDED = 'The windows are all boarded.';

const KITCHEN =
  'You are in the kitchen of the white house. A table seems to have been used recently for the preparation of food. A passage leads to the west and a dark staircase can be seen leading upward. A dark chimney leads down and to the east is a small window which is ';
const BEHIND = 'You are behind the white house. A path leads into the forest to the east. In one corner of the house there is a small window which is ';
const LIVING =
  'You are in the living room. There is a doorway to the east, a wooden door with strange gothic lettering to the west, which appears to be nailed shut, a trophy case, ';
// LIVING-ROOM-FCN once the cyclops has fled (MAGIC-FLAG).
const LIVING_OPEN =
  'You are in the living room. There is a doorway to the east. To the west is a cyclops-shaped opening in an old wooden door, above which is some strange gothic lettering, a trophy case, ';
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
  /** INVISIBLE and SACREDBIT things are never taken (an echo can lift a SACREDBIT: `unsacred_<id>`). */
  const untouchable = (id: string) =>
    Boolean(ctx.state.itemState[id]?.hidden) || ((ctx.world.items[id]?.tags ?? []).includes('sacred') && !ctx.state.flags[`unsacred_${id}`]);
  /** Treasures in `from` go to the thief (each at `chance`%, or all). */
  const rob = (from: string, chance?: number) => {
    let robbed = false;
    for (const id of contents(from)) {
      if (untouchable(id)) continue;
      if (ctx.treasure(id) > 0 && (chance === undefined || prob(ctx, chance))) {
        // ROB: FSET TOUCHBIT, so it's listed plainly when it turns up again.
        move(id, 'thief', true);
        steps.push({ touch: id });
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
      // Only rooms you've seen; Zork clears a maze room's TOUCHBIT on every look (DESCRIBE-ROOM),
      // so he never robs the maze, and ROB-MAZE's distant voice is never heard.
      if (ctx.visited(rm) && !ctx.tags(rm).includes('maze')) {
        rob(rm, 75);
        for (const id of contents(rm)) {
          const item = ctx.world.items[id];
          if (!item?.portable || item.scenery || ctx.treasure(id) > 0 || untouchable(id)) continue;
          if (id !== 'stiletto' && !prob(ctx, 10)) continue;
          move(id, 'thief', true);
          if (rm === here) steps.push(`You suddenly notice that the ${item.name} vanished.`);
          break;
        }
      }
    }
    if (pass === 1 || seen) break;
    // Move on: the next room in Zork's order that isn't sacred.
    recoverStiletto();
    const rooms = ctx.rooms();
    let next = rooms.indexOf(rm);
    // Never into a sacred room, nor onto the water (Zork's thief walks RLANDBIT rooms only).
    do next = (next + 1) % rooms.length; while (ctx.tags(rooms[next]).includes('sacred') || ctx.water(rooms[next]));
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
    // Stage 5c: the coal mine, SLIDE-ROOM through MINE-ENTRANCE, in story order.
    slide_room: {
      name: 'Slide Room',
      description: 'This is a small chamber, which appears to have been part of a coal mine. On the south wall of the chamber the letters “Granite Wall” are etched in the rock. To the east is a long passage, and there is a steep metal slide twisting downward. To the north is a small opening.',
      dark: true,
      exits: { east: 'cold_passage', north: 'mine_entrance', down: 'cellar' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['slide'],
    },
    mine_4: {
      name: 'Coal Mine',
      description: 'This is a nondescript part of a coal mine.',
      dark: true,
      exits: { north: 'mine_3', west: 'mine_4', down: 'ladder_top' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    mine_3: {
      name: 'Coal Mine',
      description: 'This is a nondescript part of a coal mine.',
      dark: true,
      exits: { south: 'mine_3', southwest: 'mine_4', east: 'mine_2' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    mine_2: {
      name: 'Coal Mine',
      description: 'This is a nondescript part of a coal mine.',
      dark: true,
      exits: { north: 'mine_2', south: 'mine_1', southeast: 'mine_3' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    mine_1: {
      name: 'Coal Mine',
      description: 'This is a nondescript part of a coal mine.',
      dark: true,
      exits: { north: 'gas_room', east: 'mine_1', northeast: 'mine_2' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    // MACHINE-ROOM-FCN: the lid's state ends the description.
    machine_room: {
      name: 'Machine Room',
      description: 'This is a large, cold room whose sole exit is to the north. In one corner there is a machine which is reminiscent of a clothes dryer. On its face is a switch which is labelled “START”. The switch does not appear to be manipulable by any human hand (unless the fingers are about 1/16 by 1/4 inch). On the front of the machine is a large lid, which is closed.',
      descriptions: [{ if: 'open:machine', text: 'This is a large, cold room whose sole exit is to the north. In one corner there is a machine which is reminiscent of a clothes dryer. On its face is a switch which is labelled “START”. The switch does not appear to be manipulable by any human hand (unless the fingers are about 1/16 by 1/4 inch). On the front of the machine is a large lid, which is open.' }],
      dark: true,
      exits: { north: 'lower_shaft' },
      items: ['machine', 'machine_switch'],
      npcs: [],
      onEnter: [],
    },
    // NO-OBJS: only the empty-handed fit through; the first turn here with a light scores (LIGHT-SHAFT).
    lower_shaft: {
      name: 'Drafty Room',
      description: 'This is a small drafty room in which is the bottom of a long shaft. To the south is a passageway and to the east a very narrow passage. In the shaft can be seen a heavy iron chain.',
      dark: true,
      exits: {
        south: 'machine_room',
        out: { to: 'timber_room', if: 'heaviest<=4', denial: 'You cannot fit through this passage with that load.' },
        east: { to: 'timber_room', if: 'heaviest<=4', denial: 'You cannot fit through this passage with that load.' },
      },
      items: ['lowered_basket'],
      npcs: [],
      onEnter: [],
      onEnd: [{ if: 'lit:here & !flag:light_shaft', then: [{ set: 'light_shaft' }] }],
      scenery: ['chain'],
      tags: ['sacred'],
    },
    timber_room: {
      name: 'Timber Room',
      description: 'This is a long and narrow passage, which is cluttered with broken timbers. A wide passage comes from the east and turns at the west end of the room into a very narrow passageway. From the west comes a strong draft.',
      dark: true,
      exits: { east: 'ladder_bottom', west: { to: 'lower_shaft', if: 'heaviest<=4', denial: 'You cannot fit through this passage with that load.' } },
      items: ['timbers'],
      npcs: [],
      onEnter: [],
      tags: ['sacred'],
    },
    dead_end_5: {
      name: 'Dead End',
      description: 'You have come to a dead end in the mine.',
      dark: true,
      exits: { north: 'ladder_bottom' },
      items: ['coal'],
      npcs: [],
      onEnter: [],
    },
    ladder_bottom: {
      name: 'Ladder Bottom',
      description: 'This is a rather wide room. On one side is the bottom of a narrow wooden ladder. To the west and the south are passages leaving the room.',
      dark: true,
      exits: { south: 'dead_end_5', west: 'timber_room', up: 'ladder_top' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['ladder'],
    },
    ladder_top: {
      name: 'Ladder Top',
      description: 'This is a very small room. In the corner is a rickety wooden ladder, leading downward. It might be safe to descend. There is also a staircase leading upward.',
      dark: true,
      exits: { down: 'ladder_bottom', up: 'mine_4' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['ladder'],
    },
    // BOOM-ROOM: a flame here at the end of a turn ignites the coal gas.
    gas_room: {
      name: 'Gas Room',
      description: 'This is a small room which smells strongly of coal gas. There is a short climb up some stairs and a narrow tunnel leading east.',
      dark: true,
      exits: { up: 'smelly_room', east: 'mine_1' },
      items: ['bracelet'],
      npcs: [],
      onEnter: [],
      onEnd: [{ if: 'in:gas_room', then: [{ script: 'gas_check' }] }],
      scenery: ['coal_gas'],
      tags: ['sacred'],
    },
    smelly_room: {
      name: 'Smelly Room',
      description: 'This is a small nondescript room. However, from the direction of a small descending staircase a foul odor can be detected. To the south is a narrow tunnel.',
      dark: true,
      exits: { down: 'gas_room', south: 'shaft_room' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['coal_gas'],
    },
    shaft_room: {
      name: 'Shaft Room',
      description: 'This is a large room, in the middle of which is a small shaft descending through the floor into darkness below. To the west and the north are exits from this room. Constructed over the top of the shaft is a metal framework to which a heavy iron chain is attached.',
      dark: true,
      exits: { down: { denial: 'You wouldn’t fit and would die if you could.' }, west: 'bat_room', north: 'smelly_room' },
      items: ['raised_basket'],
      npcs: [],
      onEnter: [],
      scenery: ['chain'],
    },
    // BATS-ROOM: without the garlic, the bat carries you off (FLY-ME), unless you're a spirit.
    bat_room: {
      name: 'Bat Room',
      description: 'You are in a small room which has doors only to the east and south.',
      dark: true,
      exits: { south: 'squeeky_room', east: 'shaft_room' },
      items: ['jade'],
      npcs: ['bat'],
      onEnter: [{ if: '!has:garlic & !here:garlic & !flag:dead', then: 'bat_arrival', repeat: true }],
      tags: ['sacred'],
    },
    squeeky_room: {
      name: 'Squeaky Room',
      description: 'You are in a small room. Strange squeaky sounds may be heard coming from the passage at the north end. You may also escape to the east.',
      dark: true,
      exits: { north: 'bat_room', east: 'mine_entrance' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    mine_entrance: {
      name: 'Mine Entrance',
      description: 'You are standing at the entrance of what might have been a coal mine. The shaft enters the west wall, and there is another exit on the south end of the room.',
      dark: true,
      exits: { south: 'slide_room', in: 'squeeky_room', west: 'squeeky_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    // Stage 5b: the canyon and the rainbow. CANYON-VIEW through ARAGAIN-FALLS, in story order.
    canyon_view: {
      name: 'Canyon View',
      description: 'You are at the top of the Great Canyon on its west wall. From here there is a marvelous view of the canyon and parts of the Frigid River upstream. Across the canyon, the walls of the White Cliffs join the mighty ramparts of the Flathead Mountains to the east. Following the Canyon upstream to the north, Aragain Falls may be seen, complete with rainbow. The mighty Frigid River flows out from a great dark cavern. To the west and south can be seen an immense forest, stretching for miles around. A path leads northwest. It is possible to climb down into the canyon from here.',
      exits: { east: 'cliff_middle', down: 'cliff_middle', northwest: 'clearing', west: 'forest_3', south: { denial: 'Storm-tossed trees block your way.' } },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['climbable_cliff', 'rainbow'],
      tags: ['sacred'],
      // CANYON-VIEW-F.
      instead: { jump: [{ then: 'canyon_jump' }] },
    },
    cliff_middle: {
      name: 'Rocky Ledge',
      description: 'You are on a ledge about halfway up the wall of the river canyon. You can see from here that the main flow from Aragain Falls twists along a passage which it is impossible for you to enter. Below you is the canyon bottom. Above you is more cliff, which appears climbable.',
      exits: { up: 'canyon_view', down: 'canyon_bottom' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['climbable_cliff'],
      tags: ['sacred'],
    },
    canyon_bottom: {
      name: 'Canyon Bottom',
      description: 'You are beneath the walls of the river canyon which may be climbable here. The lesser part of the runoff of Aragain Falls flows by below. To the north is a narrow path.',
      exits: { up: 'cliff_middle', north: 'end_of_rainbow' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water', 'climbable_cliff'],
      tags: ['sacred'],
    },
    end_of_rainbow: {
      name: 'End of Rainbow',
      description: 'You are on a small, rocky beach on the continuation of the Frigid River past the Falls. The beach is narrow due to the presence of the White Cliffs. The river canyon opens here and sunlight shines in from above. A rainbow crosses over the falls to the east and a narrow path continues to the southwest.',
      exits: {
        up: { to: 'on_rainbow', if: 'flag:rainbow_flag' },
        northeast: { to: 'on_rainbow', if: 'flag:rainbow_flag' },
        east: { to: 'on_rainbow', if: 'flag:rainbow_flag' },
        southwest: 'canyon_bottom',
      },
      items: ['pot_of_gold'],
      npcs: [],
      onEnter: [],
      scenery: ['global_water', 'rainbow'],
    },
    on_rainbow: {
      name: 'On the Rainbow',
      description: 'You are on top of a rainbow (I bet you never thought you would walk on a rainbow), with a magnificent view of the Falls. The rainbow travels east-west here.',
      exits: { west: 'end_of_rainbow', east: 'aragain_falls' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['rainbow'],
      tags: ['sacred'],
    },
    aragain_falls: {
      name: 'Aragain Falls',
      // FALLS-ROOM's M-LOOK.
      description: 'You are at the top of Aragain Falls, an enormous waterfall with a drop of about 450 feet. The only path here is on the north end.\nA beautiful rainbow can be seen over the falls and to the west.',
      descriptions: [{ if: 'flag:rainbow_flag', text: 'You are at the top of Aragain Falls, an enormous waterfall with a drop of about 450 feet. The only path here is on the north end.\nA solid rainbow spans the falls.' }],
      exits: {
        west: { to: 'on_rainbow', if: 'flag:rainbow_flag' },
        up: { to: 'on_rainbow', if: 'flag:rainbow_flag' },
        down: { denial: 'It’s a long way...' },
        north: 'shore',
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water', 'rainbow'],
      tags: ['sacred'],
      instead: { jump: [{ then: 'jump_death' }] },
    },
    // Stage 5b: the east bank. SANDY-CAVE, SANDY-BEACH and SHORE, in story order.
    sandy_cave: {
      name: 'Sandy Cave',
      description: 'This is a sand-filled cave whose exit is to the southwest.',
      dark: true,
      exits: { southwest: 'sandy_beach' },
      items: ['scarab'],
      npcs: [],
      onEnter: [],
      scenery: ['sand'],
    },
    sandy_beach: {
      name: 'Sandy Beach',
      description: 'You are on a large sandy beach on the east shore of the river, which is flowing quickly by. A path runs beside the river to the south here, and a passage is partially buried in sand to the northeast.',
      dark: true,
      exits: { northeast: 'sandy_cave', south: 'shore' },
      items: ['shovel'],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
      tags: ['sacred'],
    },
    shore: {
      name: 'Shore',
      description: 'You are on the east shore of the river. The water here seems somewhat treacherous. A path travels from north to south here, the south end quickly turning around a sharp corner.',
      exits: { north: 'sandy_beach', south: 'aragain_falls' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
      tags: ['sacred'],
    },
    // Stage 5b: the Frigid River. RIVER-5 to RIVER-1, in story order (the White Cliffs beaches come between 4 and 3).
    river_5: {
      name: 'Frigid River',
      description: 'The sound of rushing water is nearly unbearable here. On the east shore is a large landing area.',
      water: true,
      exits: { up: { denial: 'You cannot go upstream due to strong currents.' }, east: 'shore', land: 'shore' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
      tags: ['sacred'],
    },
    river_4: {
      name: 'Frigid River',
      description: 'The river is running faster here and the sound ahead appears to be that of rushing water. On the east shore is a sandy beach. A small area of beach can also be seen below the cliffs on the west shore.',
      dark: true,
      water: true,
      exits: { up: { denial: 'You cannot go upstream due to strong currents.' }, down: 'river_5', land: { denial: 'You can land either to the east or the west.' }, west: 'white_cliffs_south', east: 'sandy_beach' },
      items: ['buoy'],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
      tags: ['sacred'],
    },
    // Stage 5b: the White Cliffs beaches. The narrow paths take you only without the inflated boat (WHITE-CLIFFS-FUNCTION).
    white_cliffs_south: {
      name: 'White Cliffs Beach',
      description: 'You are on a rocky, narrow strip of beach beside the Cliffs. A narrow path leads north along the shore.',
      dark: true,
      exits: { north: { to: 'white_cliffs_north', if: 'flag:deflate', denial: 'The path is too narrow.' } },
      items: [],
      npcs: [],
      onEnter: [],
      onEnd: [{ if: 'has:inflated_boat', then: [{ clear: 'deflate' }] }, { if: '!has:inflated_boat', then: [{ set: 'deflate' }] }],
      scenery: ['global_water', 'white_cliff'],
      tags: ['sacred'],
    },
    white_cliffs_north: {
      name: 'White Cliffs Beach',
      description: 'You are on a narrow strip of beach which runs along the base of the White Cliffs. There is a narrow path heading south along the Cliffs and a tight passage leading west into the cliffs themselves.',
      dark: true,
      exits: {
        south: { to: 'white_cliffs_south', if: 'flag:deflate', denial: 'The path is too narrow.' },
        west: { to: 'damp_cave', if: 'flag:deflate', denial: 'The path is too narrow.' },
      },
      items: [],
      npcs: [],
      onEnter: [],
      onEnd: [{ if: 'has:inflated_boat', then: [{ clear: 'deflate' }] }, { if: '!has:inflated_boat', then: [{ set: 'deflate' }] }],
      scenery: ['global_water', 'white_cliff'],
      tags: ['sacred'],
    },
    river_3: {
      name: 'Frigid River',
      description: 'The river descends here into a valley. There is a narrow beach on the west shore below the cliffs. In the distance a faint rumbling can be heard.',
      dark: true,
      water: true,
      exits: { up: { denial: 'You cannot go upstream due to strong currents.' }, down: 'river_4', land: 'white_cliffs_north', west: 'white_cliffs_north' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
      tags: ['sacred'],
    },
    river_2: {
      name: 'Frigid River',
      description: 'The river turns a corner here making it impossible to see the Dam. The White Cliffs loom on the east bank and large rocks prevent landing on the west.',
      dark: true,
      water: true,
      exits: { up: { denial: 'You cannot go upstream due to strong currents.' }, down: 'river_3', land: { denial: 'There is no safe landing spot here.' }, east: { denial: 'The White Cliffs prevent your landing here.' }, west: { denial: 'Just in time you steer away from the rocks.' } },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
      tags: ['sacred'],
    },
    river_1: {
      name: 'Frigid River',
      description: 'You are on the Frigid River in the vicinity of the Dam. The river flows quietly here. There is a landing on the west shore.',
      water: true,
      exits: { up: { denial: 'You cannot go upstream due to strong currents.' }, west: 'dam_base', land: 'dam_base', down: 'river_2', east: { denial: 'The White Cliffs prevent your landing here.' } },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
      tags: ['sacred'],
    },
    // Stage 5a: the dam. DAM-BASE through DEEP-CANYON, in story order.
    dam_base: {
      name: 'Dam Base',
      description: 'You are at the base of Flood Control Dam #3, which looms above you and to the north. The river Frigid is flowing by here. Along the river are the White Cliffs which seem to form giant walls stretching from north to south along the shores of the river as it winds its way downstream.',
      exits: { north: 'dam_room', up: 'dam_room' },
      items: ['inflatable_boat'],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
      tags: ['sacred'],
    },
    maintenance_room: {
      name: 'Maintenance Room',
      description: 'This is what appears to have been the maintenance room for Flood Control Dam #3. Apparently, this room has been ransacked recently, for most of the valuable equipment is gone. On the wall in front of you is a group of buttons colored blue, yellow, brown, and red. There are doorways to the west and south.',
      dark: true,
      exits: { south: 'dam_lobby', west: 'dam_lobby' },
      // MUNG-ROOM: once flooded, it can't be entered.
      requires: '!flag:maint_flooded',
      denial: 'The room is full of water and cannot be entered.',
      items: ['tool_chest', 'screwdriver', 'tube', 'wrench', 'maintenance_lights'],
      npcs: [],
      onEnter: [],
      scenery: ['yellow_button', 'brown_button', 'red_button', 'blue_button', 'leak'],
    },
    dam_lobby: {
      name: 'Dam Lobby',
      description: 'This room appears to have been the waiting room for groups touring the dam. There are open doorways here to the north and east marked “Private”, and there is a path leading south over the top of the dam.',
      exits: { south: 'dam_room', north: 'maintenance_room', east: 'maintenance_room' },
      items: ['match', 'guide'],
      npcs: [],
      onEnter: [],
    },
    dam_room: {
      name: 'Dam',
      // DAM-ROOM-FCN's M-LOOK: the water and the bubble.
      description: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe sluice gates on the dam are closed. Behind the dam, there can be seen a wide reservoir. Water is pouring over the top of the now abandoned dam.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble.',
      descriptions: [
        { if: 'flag:low_tide & flag:gates_open & flag:gate_flag', text: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe water level behind the dam is low: The sluice gates have been opened. Water rushes through the dam and downstream.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble which is glowing serenely.' },
        { if: 'flag:low_tide & flag:gates_open & !flag:gate_flag', text: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe water level behind the dam is low: The sluice gates have been opened. Water rushes through the dam and downstream.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble.' },
        { if: 'flag:gates_open & flag:gate_flag', text: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe sluice gates are open, and water rushes through the dam. The water level behind the dam is still high.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble which is glowing serenely.' },
        { if: 'flag:gates_open & !flag:gate_flag', text: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe sluice gates are open, and water rushes through the dam. The water level behind the dam is still high.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble.' },
        { if: 'flag:low_tide & flag:gate_flag', text: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe sluice gates are closed. The water level in the reservoir is quite low, but the level is rising quickly.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble which is glowing serenely.' },
        { if: 'flag:low_tide & !flag:gate_flag', text: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe sluice gates are closed. The water level in the reservoir is quite low, but the level is rising quickly.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble.' },
        { if: 'flag:gate_flag', text: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe sluice gates on the dam are closed. Behind the dam, there can be seen a wide reservoir. Water is pouring over the top of the now abandoned dam.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble which is glowing serenely.' },
        { if: '!flag:gate_flag', text: 'You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.\nThe sluice gates on the dam are closed. Behind the dam, there can be seen a wide reservoir. Water is pouring over the top of the now abandoned dam.\nThere is a control panel here, on which a large metal bolt is mounted. Directly above the bolt is a small green plastic bubble.' },
      ],
      exits: { south: 'deep_canyon', down: 'dam_base', east: 'dam_base', north: 'dam_lobby', west: 'reservoir_south' },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['bolt', 'bubble', 'dam', 'control_panel', 'global_water'],
    },
    // Stage 5a: the dome. TORCH-ROOM through ENGRAVINGS-CAVE, in story order (the temple and Hades come between).
    // Stage 5a: the temple. SOUTH-TEMPLE and NORTH-TEMPLE, in story order.
    south_temple: {
      name: 'Altar',
      description: 'This is the south end of a large temple. In front of you is what appears to be an altar. In one corner is a small hole in the floor which leads into darkness. You probably could not get back up it.',
      exits: {
        north: 'north_temple',
        // SOUTH-TEMPLE-FCN's COFFIN-CURE.
        down: { to: 'tiny_cave', if: '!has:coffin', denial: 'You haven’t a prayer of getting the coffin down there.' },
      },
      items: ['altar', 'candles'],
      npcs: [],
      onEnter: [],
      tags: ['sacred'],
      // V-PRAY: at the altar, back to the forest.
      // V-LEAP: the way down is shut while you hold the coffin (COFFIN-CURE), so a leap kills.
      instead: { pray: [{ then: 'prayer_answered' }], jump: [{ if: 'has:coffin', then: 'jump_death' }] },
    },
    north_temple: {
      name: 'Temple',
      description: 'This is the north end of a large temple. On the east wall is an ancient inscription, probably a prayer in a long-forgotten language. Below the prayer is a staircase leading down. The west wall is solid granite. The exit to the north end of the room is through huge marble pillars.',
      exits: { down: 'egypt_room', east: 'egypt_room', north: 'torch_room', out: 'torch_room', up: 'torch_room', south: 'south_temple' },
      items: ['bell', 'prayer'],
      npcs: [],
      onEnter: [],
      tags: ['sacred'],
    },
    torch_room: {
      name: 'Torch Room',
      description: 'This is a large room with a prominent doorway leading to a down staircase. Above you is a large dome. Up around the edge of the dome (20 feet up) is a wooden railing. In the center of the room sits a white marble pedestal.',
      // TORCH-ROOM-FCN's M-LOOK.
      descriptions: [{ if: 'flag:dome_flag', text: 'This is a large room with a prominent doorway leading to a down staircase. Above you is a large dome. Up around the edge of the dome (20 feet up) is a wooden railing. In the center of the room sits a white marble pedestal.\nA piece of rope descends from the railing above, ending some five feet above your head.' }],
      dark: true,
      exits: { up: { denial: 'You cannot reach the rope.' }, south: 'north_temple', down: 'north_temple' },
      items: ['pedestal'],
      npcs: [],
      onEnter: [],
    },
    dome_room: {
      name: 'Dome Room',
      description: 'You are at the periphery of a large dome, which forms the ceiling of another room below. Protecting you from a precipitous drop is a wooden railing which circles the dome.',
      // DOME-ROOM-FCN's M-LOOK.
      descriptions: [{ if: 'flag:dome_flag', text: 'You are at the periphery of a large dome, which forms the ceiling of another room below. Protecting you from a precipitous drop is a wooden railing which circles the dome.\nHanging down from the railing is a rope which ends about ten feet from the floor below.' }],
      instead: { jump: [{ if: '!flag:dome_flag', then: 'jump_death' }] },
      dark: true,
      exits: { west: 'engravings_cave', down: { to: 'torch_room', if: 'flag:dome_flag', denial: 'You cannot go down without fracturing many bones.' } },
      items: ['railing'],
      npcs: [],
      // DOME-ROOM-FCN's M-ENTER: a spirit is drawn over the railing.
      onEnter: [{ if: 'flag:dead', then: 'spirit_falls', repeat: true }],
    },
    egypt_room: {
      name: 'Egyptian Room',
      description: 'This is a room which looks like an Egyptian tomb. There is an ascending staircase to the west.',
      dark: true,
      exits: { west: 'north_temple', up: 'north_temple' },
      items: ['coffin'],
      npcs: [],
      onEnter: [],
    },
    engravings_cave: {
      name: 'Engravings Cave',
      description: 'You have entered a low cave with passages leading northwest and east.',
      dark: true,
      exits: { northwest: 'round_room', east: 'dome_room' },
      items: ['engravings'],
      npcs: [],
      onEnter: [],
    },
    // Stage 5a: Hades. LAND-OF-LIVING-DEAD and ENTRANCE-TO-HADES, in story order.
    land_of_living_dead: {
      name: 'Land of the Dead',
      description: 'You have entered the Land of the Living Dead. Thousands of lost souls can be heard weeping and moaning. In the corner are stacked the remains of dozens of previous adventurers less fortunate than yourself. A passage exits to the north.',
      exits: { out: 'entrance_to_hades', north: 'entrance_to_hades' },
      items: ['skull'],
      npcs: [],
      onEnter: [],
      scenery: ['bodies'],
    },
    entrance_to_hades: {
      name: 'Entrance to Hades',
      // LLD-ROOM's M-LOOK.
      description: 'You are outside a large gateway, on which is inscribed\n\n  Abandon every hope\nall ye who enter here!\n\nThe gate is open; through it you can see a desolation, with a pile of mangled bodies in one corner. Thousands of voices, lamenting some hideous fate, can be heard.\nThe way through the gate is barred by evil spirits, who jeer at your attempts to pass.',
      descriptions: [
        { if: 'flag:lld_flag', text: 'You are outside a large gateway, on which is inscribed\n\n  Abandon every hope\nall ye who enter here!\n\nThe gate is open; through it you can see a desolation, with a pile of mangled bodies in one corner. Thousands of voices, lamenting some hideous fate, can be heard.' },
        { if: 'flag:dead', text: 'You are outside a large gateway, on which is inscribed\n\n  Abandon every hope\nall ye who enter here!\n\nThe gate is open; through it you can see a desolation, with a pile of mangled bodies in one corner. Thousands of voices, lamenting some hideous fate, can be heard.' },
      ],
      exits: {
        up: 'tiny_cave',
        in: { to: 'land_of_living_dead', if: 'flag:lld_flag', denial: 'Some invisible force prevents you from passing through the gate.' },
        south: { to: 'land_of_living_dead', if: 'flag:lld_flag', denial: 'Some invisible force prevents you from passing through the gate.' },
      },
      items: [],
      npcs: ['ghosts'],
      onEnter: [],
      // LLD-ROOM's M-BEG for EXORCISE, before the ceremony.
      instead: {
        exorcise: [
          { if: '!flag:lld_flag & has:bell & has:book & has:candles', say: ['You must perform the ceremony.'] },
          { if: '!flag:lld_flag', say: ['You aren’t equipped for an exorcism.'] },
        ],
      },
      // LLD-ROOM's M-END: lit candles in hand while the bell's spell holds.
      onEnd: [{ if: 'flag:xb & has:candles & on:candles & !flag:xc', then: 'exorcism_flames' }],
      scenery: ['bodies'],
    },
    chasm_room: {
      name: 'Chasm',
      description: 'A chasm runs southwest to northeast and the path follows it. You are on the south side of the chasm, where a crack opens into a passage.',
      dark: true,
      exits: { northeast: 'reservoir_south', southwest: 'ew_passage', up: 'ew_passage', south: 'ns_passage', down: { denial: 'Are you out of your mind?' } },
      items: [],
      npcs: [],
      onEnter: [],
    },
    ns_passage: {
      name: 'North-South Passage',
      description: 'This is a high north-south passage, which forks to the northeast.',
      dark: true,
      exits: { north: 'chasm_room', northeast: 'deep_canyon', south: 'round_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    loud_room: {
      name: 'Loud Room',
      // LOUD-ROOM-FCN's M-LOOK.
      description: 'This is a large room with a ceiling which cannot be detected from the ground. There is a narrow passage from east to west and a stone stairway leading upward. The room is deafeningly loud with an undetermined rushing sound. The sound seems to reverberate from all of the walls, making it difficult even to think.',
      descriptions: [
        { if: 'flag:loud_flag', text: 'This is a large room with a ceiling which cannot be detected from the ground. There is a narrow passage from east to west and a stone stairway leading upward. The room is eerie in its quietness.' },
        { if: '!flag:gates_open & flag:low_tide', text: 'This is a large room with a ceiling which cannot be detected from the ground. There is a narrow passage from east to west and a stone stairway leading upward. The room is eerie in its quietness.' },
      ],
      dark: true,
      exits: { east: 'damp_cave', west: 'round_room', up: 'deep_canyon' },
      items: ['bar'],
      npcs: [],
      // LOUD-ROOM-FCN's M-ENTER while it roars: the rest of the line is lost in the noise.
      onEnter: [
        { if: 'flag:gates_open & flag:low_tide & !flag:loud_flag', then: 'loud_noise', repeat: true },
        { if: '!flag:gates_open & !flag:low_tide & !flag:loud_flag', then: 'loud_noise', repeat: true },
      ],
      // M-ENTER's loop: while it's loud, every line is heard as noise.
      capture: { if: '!flag:loud_flag', script: 'loud_room_capture' },
      // M-END: the gates open at high tide drive you out.
      onEnd: [{ if: 'flag:gates_open & !flag:low_tide', then: 'loud_room_ejects' }],
    },
    damp_cave: {
      name: 'Damp Cave',
      description: 'This cave has exits to the west and east, and narrows to a crack toward the south. The earth is particularly damp here.',
      dark: true,
      exits: { west: 'loud_room', east: 'white_cliffs_north', south: { denial: 'It is too narrow for most insects.' } },
      items: [],
      npcs: [],
      onEnter: [],
    },
    deep_canyon: {
      name: 'Deep Canyon',
      // DEEP-CANYON-F: the water below.
      description: 'You are on the south edge of a deep canyon. Passages lead off to the east, northwest and southwest. A stairway leads down. You can hear the sound of flowing water from below.',
      descriptions: [
        { if: 'flag:gates_open & !flag:low_tide', text: 'You are on the south edge of a deep canyon. Passages lead off to the east, northwest and southwest. A stairway leads down. You can hear a loud roaring sound, like that of rushing water, from below.' },
        { if: '!flag:gates_open & flag:low_tide', text: 'You are on the south edge of a deep canyon. Passages lead off to the east, northwest and southwest. A stairway leads down.' },
      ],
      dark: true,
      exits: { northwest: 'reservoir_south', east: 'dam_room', southwest: 'ns_passage', down: 'loud_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    round_room: {
      name: 'Round Room',
      description: 'This is a circular stone room with passages in all directions. Several of them have unfortunately been blocked by cave-ins.',
      dark: true,
      exits: {
        west: 'ew_passage',
        east: 'loud_room',
        north: 'ns_passage',
        south: 'narrow_passage',
        southeast: 'engravings_cave',
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
        down: 'chasm_room',
        north: 'chasm_room',
      },
      items: [],
      npcs: [],
      // Zork's VALUE 5.
      onEnter: [{ if: '!flag:ew_passage_visited', then: 'ew_passage_points' }],
    },
    // Stage 5a: the mirrors. ATLANTIS-ROOM through MIRROR-ROOM-1, in story order.
    atlantis_room: {
      name: 'Atlantis Room',
      description: 'This is an ancient room, long under water. There is an exit to the south and a staircase leading up.',
      dark: true,
      exits: { up: 'small_cave', south: 'reservoir_north' },
      items: ['trident'],
      npcs: [],
      onEnter: [],
    },
    twisting_passage: {
      name: 'Twisting Passage',
      description: 'This is a winding passage. It seems that there are only exits on the east and north.',
      dark: true,
      exits: { north: 'mirror_room_1', east: 'small_cave' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    winding_passage: {
      name: 'Winding Passage',
      description: 'This is a winding passage. It seems that there are only exits on the east and north.',
      dark: true,
      exits: { north: 'mirror_room_2', east: 'tiny_cave' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    narrow_passage: {
      name: 'Narrow Passage',
      description: 'This is a long and narrow corridor where a long north-south passageway briefly narrows even further.',
      dark: true,
      exits: { north: 'round_room', south: 'mirror_room_2' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    cold_passage: {
      name: 'Cold Passage',
      description: 'This is a cold and damp corridor where a long east-west passageway turns into a southward path.',
      dark: true,
      exits: { south: 'mirror_room_1', west: 'slide_room' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    tiny_cave: {
      name: 'Cave',
      description: 'This is a tiny cave with entrances west and north, and a dark, forbidding staircase leading down.',
      dark: true,
      exits: { north: 'mirror_room_2', west: 'winding_passage', down: 'entrance_to_hades' },
      items: [],
      npcs: [],
      onEnter: [],
      // CAVE2-ROOM's M-END: a gust may blow your candles out.
      onEnd: [{ if: 'has:candles & on:candles', then: [{ script: 'candle_gust' }] }],
    },
    small_cave: {
      name: 'Cave',
      description: 'This is a tiny cave with entrances west and north, and a staircase leading down.',
      dark: true,
      exits: { north: 'mirror_room_1', down: 'atlantis_room', south: 'atlantis_room', west: 'twisting_passage' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    mirror_room_2: {
      name: 'Mirror Room',
      description: 'You are in a large square room with tall ceilings. On the south wall is an enormous mirror which fills the entire wall. There are exits on the other three sides of the room.',
      descriptions: [{ if: 'flag:mirror_mung', text: 'You are in a large square room with tall ceilings. On the south wall is an enormous mirror which fills the entire wall. There are exits on the other three sides of the room.\nUnfortunately, the mirror has been destroyed by your recklessness.' }],
      exits: { west: 'winding_passage', north: 'narrow_passage', east: 'tiny_cave' },
      items: ['mirror_2'],
      npcs: [],
      onEnter: [],
    },
    mirror_room_1: {
      name: 'Mirror Room',
      description: 'You are in a large square room with tall ceilings. On the south wall is an enormous mirror which fills the entire wall. There are exits on the other three sides of the room.',
      descriptions: [{ if: 'flag:mirror_mung', text: 'You are in a large square room with tall ceilings. On the south wall is an enormous mirror which fills the entire wall. There are exits on the other three sides of the room.\nUnfortunately, the mirror has been destroyed by your recklessness.' }],
      dark: true,
      exits: { north: 'cold_passage', west: 'twisting_passage', east: 'small_cave' },
      items: ['mirror_1'],
      npcs: [],
      onEnter: [],
    },
    // Stage 5a: the reservoir. STREAM-VIEW through RESERVOIR-SOUTH, in story order.
    // Stage 5b: the Stream (IN-STREAM), water.
    in_stream: {
      name: 'Stream',
      description: 'You are on the gently flowing stream. The upstream route is too narrow to navigate, and the downstream route is invisible due to twisting walls. There is a narrow beach to land on.',
      dark: true,
      water: true,
      exits: {
        up: { denial: 'The channel is too narrow.' },
        west: { denial: 'The channel is too narrow.' },
        land: 'stream_view',
        down: 'reservoir',
        east: 'reservoir',
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
    },
    stream_view: {
      name: 'Stream View',
      description: 'You are standing on a path beside a gently flowing stream. The path follows the stream, which flows from west to east.',
      dark: true,
      exits: { east: 'reservoir_south', west: { denial: 'The stream emerges from a spot too small for you to enter.' } },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
    },
    reservoir_north: {
      name: 'Reservoir North',
      description: 'You are in a large cavernous room, north of a large lake.\nThere is a slimy stairway leaving the room to the north.',
      descriptions: [
        { if: 'flag:low_tide & flag:gates_open', text: 'You are in a large cavernous room, the south of which was formerly a lake. However, with the water level lowered, there is merely a wide stream running through there.\nThere is a slimy stairway leaving the room to the north.' },
        { if: 'flag:gates_open', text: 'You are in a large cavernous area. To the south is a wide lake, whose water level appears to be falling rapidly.\nThere is a slimy stairway leaving the room to the north.' },
        { if: 'flag:low_tide', text: 'You are in a cavernous area, to the south of which is a very wide stream. The level of the stream is rising rapidly, and it appears that before long it will be impossible to cross to the other side.\nThere is a slimy stairway leaving the room to the north.' },
      ],
      dark: true,
      exits: {
        north: 'atlantis_room',
        south: { to: 'reservoir', if: 'flag:low_tide', denial: 'You would drown.' },
      },
      items: ['pump'],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
    },
    reservoir: {
      name: 'Reservoir',
      description: 'You are on the lake. Beaches can be seen north and south. Upstream a small stream enters the lake through a narrow cleft in the rocks. The dam can be seen downstream.',
      descriptions: [{ if: 'flag:low_tide', text: 'You are on what used to be a large lake, but which is now a large mud pile. There are “shores” to the north and south.' }],
      dark: true,
      // NONLANDBIT until it drains.
      water: '!flag:low_tide',
      exits: {
        north: 'reservoir_north',
        south: 'reservoir_south',
        up: 'in_stream',
        west: 'in_stream',
        down: { denial: 'The dam blocks your way.' },
      },
      items: ['trunk'],
      npcs: [],
      onEnter: [],
      // RESERVOIR-FCN's M-END.
      onEnd: [{ if: '!flag:gates_open & flag:low_tide', then: ['You notice that the water level here is rising rapidly. The currents are also becoming stronger. Staying here seems quite perilous!'] }],
      scenery: ['global_water'],
    },
    reservoir_south: {
      name: 'Reservoir South',
      description: 'You are in a long room on the south shore of a large lake, far too deep and wide for crossing.\nThere is a path along the stream to the east or west, a steep pathway climbing southwest along the edge of a chasm, and a path leading into a canyon to the southeast.',
      descriptions: [
        { if: 'flag:low_tide & flag:gates_open', text: 'You are in a long room, to the north of which was formerly a lake. However, with the water level lowered, there is merely a wide stream running through the center of the room.\nThere is a path along the stream to the east or west, a steep pathway climbing southwest along the edge of a chasm, and a path leading into a canyon to the southeast.' },
        { if: 'flag:gates_open', text: 'You are in a long room. To the north is a large lake, too deep to cross. You notice, however, that the water level appears to be dropping at a rapid rate. Before long, it might be possible to cross to the other side from here.\nThere is a path along the stream to the east or west, a steep pathway climbing southwest along the edge of a chasm, and a path leading into a canyon to the southeast.' },
        { if: 'flag:low_tide', text: 'You are in a long room, to the north of which is a wide area which was formerly a reservoir, but now is merely a stream. You notice, however, that the level of the stream is rising quickly and that before long it will be impossible to cross here.\nThere is a path along the stream to the east or west, a steep pathway climbing southwest along the edge of a chasm, and a path leading into a canyon to the southeast.' },
      ],
      dark: true,
      exits: {
        southeast: 'deep_canyon',
        southwest: 'chasm_room',
        east: 'dam_room',
        west: 'stream_view',
        north: { to: 'reservoir', if: 'flag:low_tide', denial: 'You would drown.' },
      },
      items: [],
      npcs: [],
      onEnter: [],
      scenery: ['global_water'],
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
        // TROLL-FLAG: a spirit passes.
        east: { to: 'ew_passage', denials: [{ if: 'awake:troll & !flag:dead', text: 'The troll fends you off with a menacing gesture.' }] },
        west: { to: 'maze_1', denials: [{ if: 'awake:troll & !flag:dead', text: 'The troll fends you off with a menacing gesture.' }] },
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
      scenery: ['trap_door', 'slide'],
    },
    living_room: {
      tags: ['sacred'],
      name: 'Living Room',
      description: `${LIVING}and a large oriental rug in the center of the room.`,
      descriptions: [
        { if: 'flag:magic_word & flag:rug_moved & open:trap_door', text: `${LIVING_OPEN}and a rug lying beside an open trap door.` },
        { if: 'flag:magic_word & flag:rug_moved', text: `${LIVING_OPEN}and a closed trap door at your feet.` },
        { if: 'flag:magic_word', text: `${LIVING_OPEN}and a large oriental rug in the center of the room.` },
        { if: 'flag:rug_moved & open:trap_door', text: `${LIVING}and a rug lying beside an open trap door.` },
        { if: 'flag:rug_moved', text: `${LIVING}and a closed trap door at your feet.` },
      ],
      exits: {
        east: 'kitchen',
        west: { to: 'strange_passage', if: 'flag:magic_word', denial: 'The door is nailed shut.' },
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
        east: 'canyon_view',
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
    // Stage 5d: MOUNTAINS.
    mountains: {
      name: 'Forest',
      description: 'The forest thins out, revealing impassable mountains.',
      exits: {
        up: { denial: 'The mountains are impassable.' },
        north: 'forest_2',
        east: { denial: 'The mountains are impassable.' },
        south: 'forest_2',
        west: 'forest_2',
      },
      items: ['mountain_range'],
      npcs: [],
      onEnter: [],
      scenery: ['tree', 'white_house'],
      tags: ['sacred'],
    },
    forest_2: {
      tags: ['sacred'],
      name: 'Forest',
      description: 'This is a dimly lit forest, with large trees all around.',
      exits: {
        up: { denial: NO_TREE },
        north: { denial: 'The forest becomes impenetrable to the north.' },
        east: 'mountains',
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
    // Stage 5d: STONE-BARROW. Going in ends the game (STONE-BARROW-FCN).
    stone_barrow: {
      name: 'Stone Barrow',
      description: 'You are standing in front of a massive barrow of stone. In the east face is a huge stone door which is open. You cannot see into the dark of the tomb.',
      exits: {
        northeast: 'west_of_house',
        west: { to: 'stone_barrow', then: 'barrow_end' },
        in: { to: 'stone_barrow', then: 'barrow_end' },
      },
      items: ['barrow_door', 'barrow'],
      npcs: [],
      onEnter: [],
      tags: ['sacred'],
    },
    west_of_house: {
      tags: ['sacred'],
      name: 'West of House',
      description: 'You are standing in an open field west of a white house, with a boarded front door.',
      // WEST-HOUSE: once you've won, the secret path.
      descriptions: [{ if: 'flag:won', text: 'You are standing in an open field west of a white house, with a boarded front door. A secret path leads southwest into the forest.' }],
      exits: {
        north: 'north_of_house',
        south: 'south_of_house',
        northeast: 'north_of_house',
        southeast: 'south_of_house',
        west: 'forest_1',
        east: { denial: 'The door is boarded and you can’t remove the boards.' },
        southwest: { to: 'stone_barrow', if: 'flag:won' },
        in: { to: 'stone_barrow', if: 'flag:won' },
      },
      items: ['mailbox', 'front_door'],
      npcs: [],
      onEnter: [],
      scenery: [...outside, 'board'],
    },
  },

  items: {
    mirror_1: {
      name: 'mirror',
      aliases: ['reflection', 'enormous mirror', 'enormous'],
      description: 'There is an ugly person staring back at you.',
      portable: false,
      tags: [],
      scenery: true,
      // MIRROR-MIRROR.
      instead: {
        rub: [{ if: '!flag:mirror_mung', as: 'target', then: 'mirror_rub' }],
        examine: [{ if: 'flag:mirror_mung', say: ['The mirror is broken into many pieces.'] }],
        search: [{ if: 'flag:mirror_mung', say: ['The mirror is broken into many pieces.'] }, { say: ['There is an ugly person staring back at you.'] }],
        take: [{ say: ['The mirror is many times your size. Give up.'] }],
        smash: [{ if: 'flag:mirror_mung', say: ['Haven’t you done enough damage already?'] }, { then: 'mirror_breaks' }],
        attack: [{ if: 'flag:mirror_mung', say: ['Haven’t you done enough damage already?'] }, { then: 'mirror_breaks' }],
        throw: [{ as: 'indirect', if: 'flag:mirror_mung', say: ['Haven’t you done enough damage already?'] }, { as: 'indirect', then: 'mirror_breaks' }],
      },
    },
    mirror_2: {
      name: 'mirror',
      aliases: ['reflection', 'enormous mirror', 'enormous'],
      description: 'There is an ugly person staring back at you.',
      portable: false,
      tags: [],
      scenery: true,
      // MIRROR-MIRROR.
      instead: {
        rub: [{ if: '!flag:mirror_mung', as: 'target', then: 'mirror_rub' }],
        examine: [{ if: 'flag:mirror_mung', say: ['The mirror is broken into many pieces.'] }],
        search: [{ if: 'flag:mirror_mung', say: ['The mirror is broken into many pieces.'] }, { say: ['There is an ugly person staring back at you.'] }],
        take: [{ say: ['The mirror is many times your size. Give up.'] }],
        smash: [{ if: 'flag:mirror_mung', say: ['Haven’t you done enough damage already?'] }, { then: 'mirror_breaks' }],
        attack: [{ if: 'flag:mirror_mung', say: ['Haven’t you done enough damage already?'] }, { then: 'mirror_breaks' }],
        throw: [{ as: 'indirect', if: 'flag:mirror_mung', say: ['Haven’t you done enough damage already?'] }, { as: 'indirect', then: 'mirror_breaks' }],
      },
    },
    trident: {
      name: 'crystal trident',
      aliases: ['trident', 'fork', 'treasure', 'poseidon’s trident', 'crystal'],
      description: 'There’s nothing special about the crystal trident.',
      initialDescription: 'On the shore lies Poseidon’s own crystal trident.',
      portable: true,
      size: 20,
      treasure: 11,
      tags: [],
      after: { take: [{ if: '!flag:took_trident', then: 'took_trident' }] },
    },
    engravings: {
      name: 'wall with engravings',
      aliases: ['wall', 'engravings', 'inscription', 'old engravings', 'ancient engravings'],
      description: '',
      roomDescription: 'There are old engravings on the walls here.',
      portable: false,
      tags: ['sacred'],
      text: 'The engravings were incised in the living rock of the cave wall by an unknown hand. They depict, in symbolic form, the beliefs of the ancient Zorkers. Skillfully interwoven with the bas reliefs are excerpts illustrating the major religious tenets of that time. Unfortunately, a later age seems to have considered them blasphemous and just as skillfully excised them.',
    },
    railing: {
      name: 'wooden railing',
      aliases: ['railing', 'rail'],
      description: 'There’s nothing special about the wooden railing.',
      portable: false,
      tags: [],
      scenery: true,
    },
    pedestal: {
      name: 'pedestal',
      aliases: ['white pedestal', 'marble pedestal'],
      description: '',
      portable: false,
      tags: [],
      scenery: true,
      surface: true,
      container: { open: true, weight: 30 },
      contains: ['torch'],
      // DUMB-CONTAINER.
      instead: {
        examine: [{ say: ['It looks pretty much like a pedestal.'] }],
        open: [{ say: ['You can’t do that.'] }],
        close: [{ say: ['You can’t do that.'] }],
        search: [{ say: ['You can’t do that.'] }],
      },
    },
    torch: {
      name: 'torch',
      aliases: ['ivory torch', 'ivory', 'treasure', 'flaming torch'],
      description: 'The torch is burning.',
      initialDescription: 'Sitting on the pedestal is a flaming torch, made of ivory.',
      portable: true,
      size: 20,
      treasure: 6,
      tags: [],
      light: true,
      flaming: true,
      // TORCH-OBJECT: it won't go out.
      instead: { turn_off: [{ say: ['You nearly burn your hand trying to extinguish the flame.'] }] },
      after: { take: [{ if: '!flag:took_torch', then: 'took_torch' }] },
    },
    // Stage 5b: the rainbow and the canyon.
    pot_of_gold: {
      name: 'pot of gold',
      aliases: ['pot', 'gold', 'treasure', 'gold pot'],
      description: 'There’s nothing special about the pot of gold.',
      initialDescription: 'At the end of the rainbow is a pot of gold.',
      portable: true,
      size: 15,
      treasure: 10,
      tags: [],
      after: { take: [{ if: '!flag:took_pot', then: 'took_pot' }] },
    },
    // RAINBOW-FCN.
    rainbow: {
      name: 'rainbow',
      description: 'There’s nothing special about the rainbow.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { cross: [{ then: 'cross_rainbow' }], look_under: [{ say: ['The Frigid River flows under the rainbow.'] }] },
    },
    // CLIFF-OBJECT.
    climbable_cliff: {
      name: 'cliff',
      aliases: ['wall', 'walls', 'ledge', 'rocky cliff', 'sheer cliff'],
      description: 'There’s nothing special about the cliff.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { throw: [{ as: 'indirect', then: 'over_the_cliff' }], put: [{ as: 'indirect', then: 'over_the_cliff' }] },
    },
    // Stage 5d: the end.
    mountain_range: {
      name: 'mountain range',
      aliases: ['mountain', 'mountains', 'range', 'impassable mountains', 'flathead mountains'],
      description: 'There’s nothing special about the mountain range.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { climb: [{ say: ['Don’t you believe me? The mountains are impassable!'] }] },
    },
    map: {
      name: 'ancient map',
      aliases: ['map', 'parchment', 'antique map', 'old map', 'ancient parchment'],
      // Readable: EXAMINE shows its text.
      description: '',
      initialDescription: 'In the trophy case is an ancient parchment which appears to be a map.',
      text: 'The map shows a forest with three clearings. The largest clearing contains a house. Three paths leave the large clearing. One of these paths, leading southwest, is marked “To Stone Barrow”.',
      portable: true,
      size: 2,
      tags: [],
    },
    barrow_door: {
      name: 'stone door',
      aliases: ['door', 'huge door', 'stone door'],
      description: 'There’s nothing special about the stone door.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { open: [{ say: ['The door is too heavy.'] }], close: [{ say: ['The door is too heavy.'] }] },
    },
    barrow: {
      name: 'stone barrow',
      aliases: ['barrow', 'tomb', 'massive barrow', 'stone barrow'],
      description: 'There’s nothing special about the stone barrow.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { enter: [{ then: 'barrow_end' }] },
    },
    // Stage 5c: the coal mine.
    jade: {
      name: 'jade figurine',
      aliases: ['figurine', 'treasure', 'jade', 'exquisite figurine'],
      description: 'There’s nothing special about the jade figurine.',
      roomDescription: 'There is an exquisite jade figurine here.',
      portable: true,
      size: 10,
      treasure: 5,
      tags: [],
      after: { take: [{ if: '!flag:took_jade', then: 'took_jade' }] },
    },
    bracelet: {
      name: 'sapphire-encrusted bracelet',
      aliases: ['bracelet', 'jewel', 'sapphire', 'treasure', 'sapphire bracelet'],
      description: 'There’s nothing special about the sapphire-encrusted bracelet.',
      portable: true,
      size: 10,
      treasure: 5,
      tags: [],
      after: { take: [{ if: '!flag:took_bracelet', then: 'took_bracelet' }] },
    },
    coal: {
      name: 'small pile of coal',
      aliases: ['coal', 'pile', 'heap', 'small pile', 'pile of coal'],
      description: 'There’s nothing special about the small pile of coal.',
      portable: true,
      size: 20,
      burnable: true,
      tags: [],
    },
    ladder: {
      name: 'wooden ladder',
      aliases: ['ladder', 'wooden ladder', 'rickety ladder', 'narrow ladder'],
      description: 'There’s nothing special about the wooden ladder.',
      portable: false,
      tags: [],
      scenery: true,
    },
    // GAS-PSEUDO.
    coal_gas: {
      name: 'gas',
      aliases: ['gas', 'odor', 'coal gas'],
      description: 'There’s nothing special about the gas.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { smell: [{ say: ['It smells like coal gas in here.'] }], breathe: [{ say: ['There is too much gas to blow away.'] }] },
    },
    // SLIDE-FUNCTION: a local global of the Slide Room and the Cellar.
    slide: {
      name: 'chute',
      aliases: ['slide', 'ramp', 'chute', 'steep slide', 'metal slide', 'twisting slide'],
      description: 'There’s nothing special about the chute.',
      portable: false,
      tags: [],
      scenery: true,
      instead: {
        climb: [{ if: 'in:cellar', say: ['You try to ascend the ramp, but it is impossible, and you slide back down.'] }, { then: 'slide_down' }],
        enter: [{ if: 'in:cellar', say: ['You try to ascend the ramp, but it is impossible, and you slide back down.'] }, { then: 'slide_down' }],
        put: [{ as: 'indirect', then: 'slider' }],
      },
    },
    // BASKET-F: the basket at the top; the lowered basket stands for it at the other end.
    raised_basket: {
      name: 'basket',
      aliases: ['cage', 'dumbwaiter', 'basket'],
      description: 'There’s nothing special about the basket.',
      roomDescription: 'At the end of the chain is a basket.',
      portable: false,
      tags: [],
      container: { open: true, weight: 50 },
      instead: {
        take: [{ as: 'target', say: ['The cage is securely fastened to the iron chain.'] }],
        raise: [{ then: 'basket_raise' }],
        lower: [{ then: 'basket_lower' }],
      },
    },
    lowered_basket: {
      name: 'basket',
      aliases: ['cage', 'dumbwaiter', 'basket', 'lowered basket'],
      description: 'The basket is at the other end of the chain.',
      roomDescription: 'From the chain is suspended a basket.',
      portable: false,
      tags: [],
      instead: {
        raise: [{ then: 'basket_raise' }],
        lower: [{ then: 'basket_lower' }],
        // As the thing taken only: TAKE X FROM it meets PRE-TAKE first (“You already have that!”).
        take: [{ as: 'target', say: ['The basket is at the other end of the chain.'] }],
        search: [{ say: ['The basket is at the other end of the chain.'] }],
        smell: [{ say: ['The basket is at the other end of the chain.'] }],
        open: [{ say: ['The basket is at the other end of the chain.'] }],
        close: [{ say: ['The basket is at the other end of the chain.'] }],
        put: [{ say: ['The basket is at the other end of the chain.'] }],
      },
    },
    timbers: {
      name: 'broken timber',
      aliases: ['timbers', 'pile', 'timber', 'wooden timber', 'broken timbers'],
      description: 'There’s nothing special about the broken timber.',
      portable: true,
      size: 50,
      tags: [],
    },
    // MACHINE-F.
    machine: {
      name: 'machine',
      aliases: ['machine', 'pdp10', 'dryer', 'lid'],
      description: 'There’s nothing special about the machine.',
      portable: false,
      tags: [],
      scenery: true,
      container: { openable: true, open: false, weight: 50 },
      instead: {
        take: [{ as: 'target', say: ['It is far too large to carry.'] }],
        open: [{ as: 'target', then: 'machine_open' }],
        close: [{ as: 'target', then: 'machine_close' }],
        turn_on: [{ as: 'target', then: 'machine_on' }],
      },
    },
    // MSWITCH-FUNCTION.
    machine_switch: {
      name: 'switch',
      aliases: ['switch'],
      description: 'There’s nothing special about the switch.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { turn: [{ as: 'target', then: 'machine_switch' }] },
    },
    diamond: {
      name: 'huge diamond',
      aliases: ['diamond', 'treasure', 'huge diamond', 'enormous diamond'],
      description: 'There’s nothing special about the huge diamond.',
      roomDescription: 'There is an enormous diamond (perfectly cut) here.',
      portable: true,
      treasure: 10,
      tags: [],
      after: { take: [{ if: '!flag:took_diamond', then: 'took_diamond' }] },
    },
    // GUNK-FUNCTION: it crumbles at a touch.
    gunk: {
      name: 'small piece of vitreous slag',
      aliases: ['gunk', 'piece', 'slag', 'small piece', 'vitreous slag'],
      description: 'There’s nothing special about the small piece of vitreous slag.',
      portable: true,
      size: 10,
      tags: [],
      instead: {
        take: [{ then: 'gunk_crumbles' }],
        examine: [{ then: 'gunk_crumbles' }],
      },
    },
    // CHAIN-PSEUDO.
    chain: {
      name: 'chain',
      aliases: ['chain', 'iron chain', 'heavy chain'],
      description: 'The chain secures a basket within the shaft.',
      portable: false,
      tags: [],
      scenery: true,
      instead: {
        take: [{ say: ['The chain is secure.'] }],
        move: [{ say: ['The chain is secure.'] }],
        raise: [{ say: ['Perhaps you should do that to the basket.'] }],
        lower: [{ say: ['Perhaps you should do that to the basket.'] }],
      },
    },
    // Stage 5b: the banks.
    shovel: {
      name: 'shovel',
      aliases: ['tool', 'tools'],
      description: 'There’s nothing special about the shovel.',
      portable: true,
      size: 15,
      tags: [],
    },
    scarab: {
      name: 'beautiful jeweled scarab',
      aliases: ['scarab', 'bug', 'beetle', 'treasure', 'jeweled scarab', 'carved scarab'],
      description: 'There’s nothing special about the beautiful jeweled scarab.',
      portable: true,
      size: 8,
      treasure: 5,
      tags: [],
      after: { take: [{ if: '!flag:took_scarab', then: 'took_scarab' }] },
    },
    // SAND-FUNCTION.
    sand: {
      name: 'sand',
      description: 'There’s nothing special about the sand.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { dig: [{ as: 'target', then: 'dig_sand' }] },
    },
    // WCLIF-OBJECT.
    white_cliff: {
      name: 'white cliffs',
      aliases: ['cliff', 'cliffs', 'white cliff'],
      description: 'There’s nothing special about the white cliffs.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { climb: [{ say: ['The cliff is too steep for climbing.'] }] },
    },
    // Stage 5a: the temple and Hades.
    altar: {
      name: 'altar',
      description: '',
      portable: false,
      tags: [],
      scenery: true,
      surface: true,
      container: { open: true, weight: 50 },
      contains: ['book'],
    },
    prayer: {
      name: 'prayer',
      aliases: ['inscription', 'ancient prayer', 'old prayer'],
      description: '',
      portable: false,
      tags: ['sacred'],
      scenery: true,
      text: 'The prayer is inscribed in an ancient script, rarely used today. It seems to be a philippic against small insects, absent-mindedness, and the picking up and dropping of small objects. The final verse consigns trespassers to the land of the dead. All evidence indicates that the beliefs of the ancient Zorkers were obscure.',
    },
    bell: {
      name: 'brass bell',
      aliases: ['bell', 'small bell'],
      description: 'There’s nothing special about the brass bell.',
      portable: true,
      tags: [],
      // BELL-F, and LLD-ROOM's M-BEG.
      instead: { ring: [{ if: 'in:entrance_to_hades & !flag:lld_flag', then: 'bell_rung' }, { say: ['Ding, dong.'] }] },
    },
    hot_bell: {
      name: 'red hot brass bell',
      aliases: ['bell', 'hot bell', 'red hot bell', 'brass bell', 'small bell'],
      description: 'There’s nothing special about the red hot brass bell.',
      roomDescription: 'On the ground is a red hot bell.',
      portable: false,
      refusal: 'The bell is very hot and cannot be taken.',
      tags: [],
      // HOT-BELL-F.
      instead: {
        take: [{ say: ['The bell is very hot and cannot be taken.'] }],
        rub: [{ as: 'target', then: 'hot_bell_touched' }],
        ring: [{ as: 'target', then: 'hot_bell_touched' }],
        pour: [{ as: 'indirect', then: 'hot_bell_cooled' }],
      },
    },
    candles: {
      name: 'pair of candles',
      aliases: ['candles', 'pair', 'burning candles', 'candle'],
      description: 'The candles are out.',
      initialDescription: 'On the two ends of the altar are burning candles.',
      portable: true,
      size: 10,
      tags: [],
      light: true,
      flaming: true,
      // CANDLES-FCN.
      instead: {
        turn_on: [{ as: 'target', then: 'candles_lit' }],
        burn: [{ as: 'target', then: 'candles_lit' }],
        turn_off: [{ then: 'candles_out' }],
        count: [{ say: ['Let’s see, how many objects in a pair? Don’t tell me, I’ll get it.'] }],
        examine: [{ if: 'on:candles', then: 'candles_examined_lit' }, { then: 'candles_examined' }],
      },
      after: { take: [{ if: '!flag:candles_touched', then: 'candles_touched' }] },
    },
    book: {
      name: 'black book',
      aliases: ['book', 'prayer book', 'page', 'books', 'large book'],
      description: '',
      initialDescription: 'On the altar is a large black book, open to page 569.',
      portable: true,
      burnable: true,
      size: 10,
      tags: [],
      text: 'Commandment #12592\n\nOh ye who go about saying unto each:  “Hello sailor”:\nDost thou know the magnitude of thy sin before the gods?\nYea, verily, thou shalt be ground between two stones.\nShall the angry gods cast thy body into the whirlpool?\nSurely, thy eye shall be put out with a sharp stick!\nEven unto the ends of the earth shalt thou wander and\nUnto the land of the dead shalt thou be sent at last.\nSurely thou shalt repent of thy cunning.',
      // BLACK-BOOK, and LLD-ROOM's M-BEG.
      instead: {
        read: [{ if: 'in:entrance_to_hades & flag:xc & !flag:lld_flag', then: 'exorcism_done' }],
        open: [{ say: ['The book is already open to page 569.'] }],
        close: [{ say: ['As hard as you try, the book cannot be closed.'] }],
        turn: [{ say: ['Beside page 569, there is only one other page with any legible printing on it. Most of it is unreadable, but the subject seems to be the banishment of evil. Apparently, certain noises, lights, and prayers are efficacious in this regard.'] }],
        burn: [{ as: 'target', then: 'book_burns' }],
      },
    },
    coffin: {
      name: 'gold coffin',
      aliases: ['coffin', 'casket', 'treasure', 'solid coffin', 'gold casket'],
      description: '',
      roomDescription: 'The solid-gold coffin used for the burial of Ramses II is here.',
      portable: true,
      size: 55,
      treasure: 15,
      // RANDOMIZE-OBJECTS: carried at a death, it goes back.
      home: 'egypt_room',
      tags: ['sacred'],
      container: { openable: true, weight: 35 },
      contains: ['sceptre'],
      after: { take: [{ if: '!flag:took_coffin', then: 'took_coffin' }] },
    },
    sceptre: {
      name: 'sceptre',
      aliases: ['scepter', 'treasure', 'egyptian sceptre', 'ancient sceptre'],
      description: 'There’s nothing special about the sceptre.',
      initialDescription: 'A sceptre, possibly that of ancient Egypt itself, is in the coffin. The sceptre is ornamented with colored enamel, and tapers to a sharp point.',
      roomDescription: 'An ornamented sceptre, tapering to a sharp point, is here.',
      portable: true,
      size: 3,
      treasure: 6,
      weapon: true,
      tags: [],
      // SCEPTRE-FUNCTION.
      instead: { wave: [{ as: 'target', then: 'sceptre_waved' }], raise: [{ as: 'target', then: 'sceptre_waved' }] },
      after: { take: [{ if: '!flag:took_sceptre', then: 'took_sceptre' }] },
    },
    skull: {
      name: 'crystal skull',
      aliases: ['skull', 'head', 'treasure', 'crystal'],
      description: 'There’s nothing special about the crystal skull.',
      initialDescription: 'Lying in one corner of the room is a beautifully carved crystal skull. It appears to be grinning at you rather nastily.',
      portable: true,
      treasure: 10,
      tags: [],
      after: { take: [{ if: '!flag:took_skull', then: 'took_skull' }] },
    },
    bodies: {
      name: 'pile of bodies',
      aliases: ['bodies', 'body', 'remains', 'pile', 'mangled bodies'],
      description: 'There’s nothing special about the pile of bodies.',
      portable: false,
      tags: [],
      scenery: true,
      // BODY-FUNCTION.
      instead: {
        take: [{ say: ['A force keeps you from taking the bodies.'] }],
        smash: [{ then: 'bodies_defiled' }],
        attack: [{ then: 'bodies_defiled' }],
        burn: [{ as: 'target', then: 'bodies_defiled' }],
      },
    },
    // Stage 5a: the dam and the reservoir.
    bar: {
      name: 'platinum bar',
      aliases: ['bar', 'platinum', 'treasure', 'large bar', 'platinum bar'],
      description: 'There’s nothing special about the platinum bar.',
      roomDescription: 'On the ground is a large platinum bar.',
      portable: true,
      size: 20,
      treasure: 5,
      // SACREDBIT until the echo clears it.
      tags: ['sacred'],
      after: { take: [{ if: '!flag:took_bar', then: 'took_bar' }] },
    },
    global_water: {
      name: 'water',
      aliases: ['quantity', 'lake', 'reservoir', 'stream', 'river'],
      description: 'There’s nothing special about the water.',
      portable: false,
      tags: [],
      scenery: true,
      // WATER-F: taking it is filling the bottle.
      instead: { take: [{ then: 'fill_bottle' }] },
    },
    bolt: {
      name: 'bolt',
      aliases: ['nut', 'metal bolt', 'large bolt'],
      description: 'There’s nothing special about the bolt.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { turn: [{ then: 'bolt_turn' }], take: [{ say: ['It is an integral part of the control panel.'] }] },
    },
    bubble: {
      name: 'green bubble',
      aliases: ['bubble', 'small bubble', 'plastic bubble', 'green plastic bubble'],
      description: 'There’s nothing special about the green bubble.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { take: [{ say: ['It is an integral part of the control panel.'] }] },
    },
    dam: {
      name: 'dam',
      aliases: ['gate', 'gates', 'fcd#3'],
      description: 'There’s nothing special about the dam.',
      portable: false,
      tags: [],
      scenery: true,
      instead: {
        open: [{ say: ['Sounds reasonable, but this isn’t how.'] }],
        close: [{ say: ['Sounds reasonable, but this isn’t how.'] }],
        plug: [{ as: 'target', then: 'dam_plug' }],
      },
    },
    control_panel: {
      name: 'control panel',
      aliases: ['panel'],
      description: 'There’s nothing special about the control panel.',
      portable: false,
      tags: [],
      scenery: true,
    },
    tool_chest: {
      name: 'group of tool chests',
      aliases: ['chest', 'chests', 'group', 'toolchests', 'tool chests', 'tool chest'],
      description: 'The chests are all empty.',
      portable: false,
      tags: ['sacred'],
      container: { open: true },
      instead: {
        take: [{ then: 'chests_crumble' }],
        open: [{ then: 'chests_crumble' }],
        put: [{ then: 'chests_crumble' }],
      },
    },
    yellow_button: {
      name: 'yellow button',
      aliases: ['button', 'switch', 'buttons', 'yellow switch'],
      description: 'There’s nothing special about the yellow button.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { use: [{ then: 'gate_flag_on' }], read: [{ say: ['They’re greek to you.'] }] },
    },
    brown_button: {
      name: 'brown button',
      aliases: ['button', 'switch', 'buttons', 'brown switch'],
      description: 'There’s nothing special about the brown button.',
      portable: false,
      tags: [],
      scenery: true,
      instead: { use: [{ then: 'gate_flag_off' }], read: [{ say: ['They’re greek to you.'] }] },
    },
    red_button: {
      name: 'red button',
      aliases: ['button', 'switch', 'buttons', 'red switch'],
      description: 'There’s nothing special about the red button.',
      portable: false,
      tags: [],
      scenery: true,
      instead: {
        use: [{ if: 'on:maintenance_lights', then: 'lights_off' }, { then: 'lights_on' }],
        read: [{ say: ['They’re greek to you.'] }],
      },
    },
    blue_button: {
      name: 'blue button',
      aliases: ['button', 'switch', 'buttons', 'blue switch'],
      description: 'There’s nothing special about the blue button.',
      portable: false,
      tags: [],
      scenery: true,
      instead: {
        use: [{ if: 'var:water_level=0', then: 'leak_starts' }, { say: ['The blue button appears to be jammed.'] }],
        read: [{ say: ['They’re greek to you.'] }],
      },
    },
    // The Maintenance Room's own lights (its ONBIT), switched by the red button.
    maintenance_lights: {
      name: 'ceiling lights',
      description: 'There’s nothing special about the ceiling lights.',
      portable: false,
      tags: [],
      scenery: true,
      switchable: true,
      light: true,
    },
    leak: {
      name: 'leak',
      aliases: ['drip', 'pipe'],
      description: 'There’s nothing special about the leak.',
      portable: false,
      tags: [],
      scenery: true,
      // LEAK-FUNCTION: only while the water's rising.
      instead: {
        put: [{ if: 'var:water_level>0', with: 'putty', then: 'leak_fixed' }],
        plug: [{ if: 'var:water_level>0', with: 'putty', then: 'leak_fixed' }, { if: 'var:water_level>0', as: 'target', then: 'with_tell' }],
      },
    },
    tube: {
      name: 'tube',
      aliases: ['tooth', 'paste', 'toothpaste', 'tube of toothpaste'],
      description: '',
      roomDescription: 'There is an object which looks like a tube of toothpaste here.',
      portable: true,
      size: 5,
      tags: [],
      text: '---> Frobozz Magic Gunk Company <---\n  All-Purpose Gunk',
      container: { openable: true, weight: 7 },
      contains: ['putty'],
      instead: { squeeze: [{ then: 'squeeze_tube' }], put: [{ as: 'indirect', say: ['The tube refuses to accept anything.'] }] },
    },
    putty: {
      name: 'viscous material',
      aliases: ['material', 'gunk', 'viscous gunk'],
      description: 'There’s nothing special about the viscous material.',
      portable: true,
      size: 6,
      tags: [],
      // PUTTY-FCN: PUT (in), not PUT ON.
      instead: { put: [{ if: '!var:water_level>0', as: 'target', prep: 'in', say: ['The all-purpose gunk isn’t a lubricant.'] }] },
    },
    screwdriver: {
      name: 'screwdriver',
      aliases: ['tool', 'tools', 'driver', 'screw driver'],
      description: 'There’s nothing special about the screwdriver.',
      portable: true,
      tags: [],
    },
    wrench: {
      name: 'wrench',
      aliases: ['tool', 'tools'],
      description: 'There’s nothing special about the wrench.',
      portable: true,
      size: 10,
      tags: [],
    },
    match: {
      name: 'matchbook',
      aliases: ['match', 'matches', 'match book'],
      description: 'The matchbook isn’t very interesting, except for what’s written on it.',
      roomDescription: 'There is a matchbook whose cover says “Visit Beautiful FCD#3” here.',
      portable: true,
      size: 2,
      tags: [],
      switchable: true,
      flaming: true,
      light: true,
      text: '\n(Close cover before striking)\n\nYOU too can make BIG MONEY in the exciting field of PAPER SHUFFLING!\n\nMr. Anderson of Muddle, Mass. says: “Before I took this course I was a lowly bit twiddler. Now with what I learned at GUE Tech I feel really important and can obfuscate and confuse with the best.”\n\nDr. Blank had this to say: “Ten short days ago all I could look forward to was a dead-end job as a doctor. Now I have a promising future and make really big Zorkmids.”\n\nGUE Tech can’t promise these fantastic results to everyone. But when you earn your degree from GUE Tech, your future will be brighter.',
      // MATCH-FUNCTION.
      instead: {
        turn_on: [{ as: 'target', then: 'strike_match' }],
        burn: [{ as: 'target', then: 'strike_match' }],
        turn_off: [{ if: 'on:match', then: 'match_out_now' }],
        count: [{ then: 'count_matches' }],
        open: [{ then: 'count_matches' }],
        examine: [{ if: 'on:match', say: ['The match is burning.'] }],
      },
    },
    guide: {
      name: 'tour guidebook',
      aliases: ['guide', 'book', 'books', 'guidebook', 'guidebooks', 'tour guide'],
      description: '',
      initialDescription: 'Some guidebooks entitled “Flood Control Dam #3” are on the reception desk.',
      portable: true,
      burnable: true,
      tags: [],
      text: '“\tFlood Control Dam #3\n\nFCD#3 was constructed in year 783 of the Great Underground Empire to harness the mighty Frigid River. This work was supported by a grant of 37 million zorkmids from your omnipotent local tyrant Lord Dimwit Flathead the Excessive. This impressive structure is composed of 370,000 cubic feet of concrete, is 256 feet tall at the center, and 193 feet wide at the top. The lake created behind the dam has a volume of 1.7 billion cubic feet, an area of 12 million square feet, and a shore line of 36 thousand feet.\n\nThe construction of FCD#3 took 112 days from ground breaking to the dedication. It required a work force of 384 slaves, 34 slave drivers, 12 engineers, 2 turtle doves, and a partridge in a pear tree. The work was managed by a command team composed of 2345 bureaucrats, 2347 secretaries (at least two of whom could type), 12,256 paper shufflers, 52,469 rubber stampers, 245,193 red tape processors, and nearly one million dead trees.\n\nWe will now point out some of the more interesting features of FCD#3 as we conduct you on a guided tour of the facilities:\n\n        1) You start your tour here in the Dam Lobby. You will notice on your right that....',
    },
    trunk: {
      name: 'trunk of jewels',
      aliases: ['trunk', 'chest', 'jewels', 'treasure', 'old trunk'],
      description: 'There’s nothing special about the trunk of jewels.',
      initialDescription: 'Lying half buried in the mud is an old trunk, bulging with jewels.',
      roomDescription: 'There is an old trunk here, bulging with assorted jewels.',
      portable: true,
      size: 35,
      treasure: 5,
      tags: [],
      after: { take: [{ if: '!flag:took_trunk', then: 'took_trunk' }] },
    },
    pump: {
      name: 'hand-held air pump',
      aliases: ['pump', 'air-pump', 'air pump', 'tool', 'tools', 'small pump', 'hand-held pump'],
      description: 'There’s nothing special about the hand-held air pump.',
      portable: true,
      tags: [],
    },
    // The buoy on River 4 (TREASURE-INSIDE: opening it scores the emerald).
    buoy: {
      name: 'red buoy',
      aliases: ['buoy'],
      description: '',
      initialDescription: 'There is a red buoy here (probably a warning).',
      portable: true,
      size: 10,
      tags: [],
      container: { openable: true, weight: 20 },
      contains: ['emerald'],
      after: { open: [{ if: '!flag:took_emerald', then: 'took_emerald' }] },
    },
    emerald: {
      name: 'large emerald',
      aliases: ['emerald', 'treasure'],
      description: 'There’s nothing special about the large emerald.',
      portable: true,
      treasure: 10,
      tags: [],
    },
    // The boat (IBOAT-FUNCTION): a pile of plastic until it's inflated.
    inflatable_boat: {
      name: 'pile of plastic',
      aliases: ['boat', 'pile', 'plastic', 'valve', 'plastic pile'],
      description: 'There’s nothing special about the pile of plastic.',
      roomDescription: 'There is a folded pile of plastic here which has a small valve attached.',
      portable: true,
      size: 20,
      burnable: true,
      tags: [],
      instead: {
        inflate: [{ as: 'target', then: 'boat_inflate' }],
        pump: [{ as: 'target', then: 'boat_pump' }],
        breathe: [{ as: 'target', say: ['You don’t have enough lung power to inflate it.'] }],
      },
    },
    // RBOAT-FUNCTION: the magic boat, a vehicle for water.
    inflated_boat: {
      name: 'magic boat',
      aliases: ['boat', 'raft', 'plastic boat', 'seaworthy boat'],
      description: '',
      portable: true,
      size: 20,
      burnable: true,
      tags: [],
      vehicle: { travels: 'water' },
      container: { open: true, weight: 100 },
      contains: ['boat_label'],
      instead: {
        board: [
          { if: 'has:sceptre & !aboard', then: 'boat_punctured_boarding' },
          { if: 'has:knife & !aboard', then: 'boat_punctured_boarding' },
          { if: 'has:sword & !aboard', then: 'boat_punctured_boarding' },
          { if: 'has:rusty_knife & !aboard', then: 'boat_punctured_boarding' },
          { if: 'has:axe & !aboard', then: 'boat_punctured_boarding' },
          { if: 'has:stiletto & !aboard', then: 'boat_punctured_boarding' },
        ],
        inflate: [{ as: 'target', say: ['Inflating it further would probably burst it.'] }],
        pump: [{ as: 'target', if: 'has:pump', say: ['Inflating it further would probably burst it.'] }],
        breathe: [{ as: 'target', say: ['Inflating it further would probably burst it.'] }],
        deflate: [
          { as: 'target', if: 'aboard:inflated_boat', say: ['You can’t deflate the boat while you’re in it.'] },
          { as: 'target', then: 'boat_deflate' },
        ],
      },
    },
    // DBOAT-FUNCTION.
    punctured_boat: {
      name: 'punctured boat',
      aliases: ['boat', 'pile', 'plastic', 'punctured pile'],
      description: 'There’s nothing special about the punctured boat.',
      portable: true,
      size: 20,
      burnable: true,
      tags: [],
      instead: {
        put: [{ as: 'indirect', with: 'putty', then: 'boat_repaired' }],
        plug: [{ as: 'target', with: 'putty', then: 'boat_repaired' }, { as: 'target', then: 'with_tell' }],
        inflate: [{ as: 'target', say: ['No chance. Some moron punctured it.'] }],
        pump: [{ as: 'target', say: ['No chance. Some moron punctured it.'] }],
      },
    },
    boat_label: {
      name: 'tan label',
      aliases: ['label', 'fineprint', 'print', 'fine print'],
      description: '',
      portable: true,
      size: 2,
      burnable: true,
      tags: [],
      text: '  !!!!FROBOZZ MAGIC BOAT COMPANY!!!!\n\nHello, Sailor!\n\nInstructions for use:\n\n   To get into a body of water, say “Launch”.\n   To get to shore, say “Land” or the direction in which you want to maneuver the boat.\n\nWarranty:\n\n  This boat is guaranteed against all defects for a period of 76 milliseconds from date of purchase or until first used, whichever comes first.\n\nWarning:\n   This boat is made of thin plastic.\n   Good Luck!',
    },
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
      // WHITE-HOUSE-F's THROUGH.
      instead: {
        enter: [
          { if: 'in:east_of_house & open:kitchen_window', then: 'into_kitchen' },
          { if: 'in:east_of_house', say: ['The window is closed.'] },
          { say: ['I can’t see how to get in from here.'] },
        ],
      },
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
      // V-CLIMB-UP: no way up or down here, and it's no use (except on the Forest Path, below the tree).
      climbRefusal: { if: '!in:path', text: 'There are no climbable trees here.' },
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
      // EXAMINE lists what's in it, or says it's empty.
      description: '',
      initialDescription: 'A bottle is sitting on the table.',
      portable: true,
      tags: [],
      container: { openable: true, transparent: true, weight: 4 },
      contains: ['water'],
      // PRE-FILL: from the water here, if there is any.
      instead: { fill: [{ if: 'here:global_water', then: 'fill_bottle' }, { say: ['There is nothing to fill it with.'] }] },
    },
    water: {
      name: 'quantity of water',
      aliases: ['water', 'liquid', 'h2o'],
      description: 'There’s nothing special about the quantity of water.',
      portable: true,
      size: 4,
      tags: [],
      // WATER-F: POUR is DROP, and TAKE fills the bottle.
      instead: {
        take: [{ then: 'fill_bottle' }],
        pour: [
          { if: 'inside:water:bottle & !open:bottle', say: ['The bottle is closed.'] },
          { then: 'water_spills' },
        ],
      },
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
      tags: ['sacred'],
      // ROPE-FUNCTION.
      instead: {
        tie: [
          { if: '!in:dome_room', as: 'target', then: 'rope_tie_elsewhere' },
          { if: 'flag:dome_flag', as: 'target', with: 'railing', say: ['The rope is already tied to it.'] },
          { as: 'target', with: 'railing', then: 'rope_tied' },
        ],
        untie: [{ if: 'flag:dome_flag & in:dome_room', then: 'rope_untied' }, { say: ['It is not tied to anything.'] }],
        drop: [{ if: 'in:dome_room & !flag:dome_flag', then: 'rope_drops' }],
        take: [{ if: 'flag:dome_flag & in:dome_room', say: ['The rope is tied to the railing.'] }],
      },
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
      contains: ['map'],
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
        // V-THROUGH: its exit is a routine, not a door, so Zork doesn't walk through it.
        enter: [{ if: 'flag:rug_moved', say: ['You hit your head against the trap door as you attempt this feat.'] }],
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
      instead: { wind: [{ as: 'target', then: 'canary_wind' }] },
      after: { take: [{ if: '!flag:took_canary', then: 'took_canary' }] },
    },
    // CANARY-OBJECT's songbird drops it in the forest.
    bauble: {
      name: 'beautiful brass bauble',
      aliases: ['bauble', 'treasure', 'brass bauble', 'beautiful bauble'],
      description: 'There’s nothing special about the beautiful brass bauble.',
      portable: true,
      treasure: 1,
      tags: [],
      after: { take: [{ if: '!flag:took_bauble', then: 'took_bauble' }] },
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
    // GHOSTS-F: the spirits barring Hades.
    ghosts: {
      name: 'number of ghosts',
      aliases: ['ghosts', 'spirits', 'fiends', 'force', 'evil spirits', 'invisible force'],
      description: 'You seem unable to interact with these spirits.',
      scenery: true,
      refuseOrder: 'The spirits jeer loudly and ignore you.',
      instead: {
        attack: [{ say: ['How can you attack a spirit with material objects?'] }],
        smash: [{ say: ['How can you attack a spirit with material objects?'] }],
        take: [{ say: ['You seem unable to interact with these spirits.'] }],
        give: [{ say: ['You seem unable to interact with these spirits.'] }],
        throw: [{ say: ['You seem unable to interact with these spirits.'] }],
      },
    },
    thief: {
      name: 'thief',
      aliases: ['robber', 'man', 'person', 'suspicious man', 'seedy man', 'shady man'],
      // His LDESC; once he has been knocked out and come round, ROBBER-C-DESC.
      description: 'There is a suspicious-looking individual, holding a large bag, leaning against one wall. He is armed with a deadly stiletto.',
      descriptions: [
        { if: '!awake:thief', text: 'There is a suspicious-looking individual lying unconscious on the ground.' },
        { if: 'flag:thief_revived', text: 'There is a suspicious-looking individual, holding a bag, leaning against one wall. He is armed with a vicious-looking stiletto.' },
      ],
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
    // BAT-F and BAT-D: the vampire bat on the ceiling.
    bat: {
      name: 'bat',
      aliases: ['bat', 'vampire', 'vampire bat', 'deranged bat'],
      description: 'A large vampire bat, hanging from the ceiling, swoops down at you!',
      descriptions: [{ if: 'has:garlic', text: 'In the corner of the room on the ceiling is a large vampire bat who is obviously deranged and holding his nose.' }, { if: 'here:garlic', text: 'In the corner of the room on the ceiling is a large vampire bat who is obviously deranged and holding his nose.' }],
      instead: {
        // BAT-F's TELL: FWEEP 6, and V-TELL's pause when nothing follows.
        talk: [{ say: ['    Fweep!', '    Fweep!', '    Fweep!', '    Fweep!', '    Fweep!', 'The bat pauses for a moment, perhaps thinking that you should reread the manual.'] }],
        order: [{ say: ['    Fweep!', '    Fweep!', '    Fweep!', '    Fweep!', '    Fweep!'] }],
        take: [{ if: 'has:garlic', say: ['You can’t reach him; he’s on the ceiling.'] }, { if: 'here:garlic', say: ['You can’t reach him; he’s on the ceiling.'] }, { then: 'bat_flight' }],
        attack: [{ if: 'has:garlic', say: ['You can’t reach him; he’s on the ceiling.'] }, { if: 'here:garlic', say: ['You can’t reach him; he’s on the ceiling.'] }, { then: 'bat_flight' }],
        smash: [{ if: 'has:garlic', say: ['You can’t reach him; he’s on the ceiling.'] }, { if: 'here:garlic', say: ['You can’t reach him; he’s on the ceiling.'] }, { then: 'bat_flight' }],
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
    ghosts: { default: 'The spirits jeer loudly and ignore you.' },
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
    // IBOAT-FUNCTION's INFLATE.
    boat_inflate: (ctx) => {
      if (ctx.holder('inflatable_boat') !== ctx.room()) return ['The boat must be on the ground to be inflated.'];
      const tool = ctx.command?.indirect;
      if (tool === 'pump') return inflateBoat(ctx);
      if (!tool) {
        // The parser's GWIM: the one tool (TOOLBIT) held, “(with the hand-held air pump)”.
        const guessed = guessTool(ctx);
        if (guessed) {
          const name = ctx.world.items[guessed].name;
          return [`(with the ${name})`, ...(guessed === 'pump' ? inflateBoat(ctx) : [`With a ${name}? Surely you jest!`])];
        }
        return ['You don’t have enough lung power to inflate it.'];
      }
      return [`With a ${ctx.world.items[tool]?.name ?? tool}? Surely you jest!`];
    },
    // V-PUMP: PUMP UP the boat with the pump in hand.
    boat_pump: (ctx) => {
      const tool = ctx.command?.indirect;
      if (tool && tool !== 'pump') return [`Pump it up with a ${ctx.world.items[tool]?.name ?? tool}?`];
      if (!ctx.carried('pump')) return ['It’s really not clear how.'];
      if (ctx.holder('inflatable_boat') !== ctx.room()) return ['The boat must be on the ground to be inflated.'];
      return inflateBoat(ctx);
    },
    // FIX-BOAT: the pile comes back where the punctured boat was.
    boat_repaired: (ctx) => [{ move: 'inflatable_boat', to: ctx.holder('punctured_boat') as string }, { move: 'punctured_boat', to: null }],
    // The world's M-BEG: a spirit's limits (DEAD-FUNCTION), and the boat's (RBOAT-FUNCTION) while aboard.
    world_beg: (ctx) => {
      if (ctx.state.flags.dead) return deadFunction(ctx);
      if (ctx.aboard() === 'inflated_boat') return boatBeg(ctx);
      const a = ctx.action ?? ctx.parse(ctx.line ?? '');
      if (a?.action === 'jump') return vLeap(ctx, a.target);
      // LUNGS, one of Zork's global objects: INFLATE … WITH LUNGS is V-BREATHE.
      if (a?.action === 'inflate' && /^(?:the\s+)?(?:lungs|air|mouth|breath)$/i.test(a.indirect ?? '')) {
        const boat = ['inflatable_boat', 'inflated_boat', 'punctured_boat'].find((id) => ctx.here(id) && (ctx.world.items[id].aliases ?? []).concat(ctx.world.items[id].name).some((w) => w === (a.target ?? '').toLowerCase().replace(/^the\s+/, '')));
        if (boat === 'inflatable_boat') return ['You don’t have enough lung power to inflate it.'];
        if (boat === 'inflated_boat') return ['Inflating it further would probably burst it.'];
        if (boat === 'punctured_boat') return ['No chance. Some moron punctured it.'];
        return ['How can you inflate that?'];
      }
      // V-LAUNCH, the parser having guessed the boat.
      if (a?.action === 'launch' && !a.target && ctx.here('inflated_boat')) return ['(magic boat)', 'You can’t launch that by saying “launch”!'];
      return;
    },
    // SCEPTRE-FUNCTION: the rainbow made solid, or not; anywhere else, colours.
    sceptre_waved: (ctx) => {
      const here = ctx.room();
      if (here === 'aragain_falls' || here === 'end_of_rainbow') {
        if (!ctx.state.flags.rainbow_flag) {
          const pot = here === 'end_of_rainbow' && ctx.holder('pot_of_gold') === 'end_of_rainbow';
          return [
            { reveal: 'pot_of_gold' },
            'Suddenly, the rainbow appears to become solid and, I venture, walkable (I think the giveaway was the stairs and bannister).',
            ...(pot ? ['A shimmering pot of gold appears at the end of the rainbow.'] : []),
            { set: 'rainbow_flag' },
          ];
        }
        // ROB ON-RAINBOW WALL: treasures left on the rainbow are gone.
        const lost = ctx.children('on_rainbow').filter((id) => ctx.treasure(id) > 0 && !(ctx.world.items[id].tags ?? []).includes('sacred'));
        return [...lost.map((id): EventStep => ({ move: id, to: null })), 'The rainbow seems to have become somewhat run-of-the-mill.', { clear: 'rainbow_flag' }];
      }
      if (here === 'on_rainbow') return [{ clear: 'rainbow_flag' }, { die: 'The structural integrity of the rainbow is severely compromised, leaving you hanging in midair, supported only by water vapor. Bye.' }];
      return ['A dazzling display of color briefly emanates from the sceptre.'];
    },
    // RAINBOW-FCN's CROSS.
    cross_rainbow: (ctx) => {
      const here = ctx.room();
      if (here === 'canyon_view') return ['From here?!?'];
      if (!ctx.state.flags.rainbow_flag) return ['Can you walk on water vapor?'];
      if (here === 'aragain_falls') return [{ go: 'end_of_rainbow' }];
      if (here === 'end_of_rainbow') return [{ go: 'aragain_falls' }];
      return ['You’ll have to say which way...'];
    },
    // CLIFF-OBJECT: thrown off the cliff, it's gone.
    over_the_cliff: (ctx) => {
      const it = ctx.command?.target;
      if (!it || !ctx.world.items[it]) return [];
      return [{ move: it, to: null }, `The ${ctx.world.items[it].name} tumbles into the river and is seen no more.`];
    },
    // SAND-FUNCTION and V-DIG: four digs with the shovel find the scarab, a fifth buries you.
    dig_sand: (ctx) => {
      // The parser guesses the one tool you hold: “(with the shovel)”.
      const guessed = ctx.command?.indirect ? undefined : guessTool(ctx);
      const note: EventStep[] = guessed ? [`(with the ${ctx.world.items[guessed].name})`] : [];
      return [...note, ...digSand(ctx, ctx.command?.indirect ?? guessed)];
    },
    // I-RIVER: the current carries the boat down, and over the falls from the last stretch.
    river_current: (ctx) => {
      const here = ctx.room();
      if (RIVER_SPEEDS[here] === undefined) return [];
      const next = RIVER_NEXT[here];
      if (!next) return [{ die: 'Unfortunately, the magic boat doesn’t provide protection from the rocks and boulders one meets at the bottom of waterfalls. Including this one.' }];
      return ['The flow of the river carries you downstream.', '', { go: next }, { schedule: 'river_current', in: RIVER_SPEEDS[next] }];
    },
    // CANDLES-FCN's LAMP-ON and BURN.
    light_candles: (ctx) => {
      if (ctx.state.flags.candles_burnt) return ['Alas, there’s not much left of the candles. Certainly not enough to burn.'];
      const tool = ctx.command?.indirect;
      const matchLit = Boolean(ctx.state.itemState.match?.on);
      if (!tool) {
        if (!matchLit) return ['You should say what to light them with.'];
        return ['(with the match)', ...lightWith(ctx, 'match')];
      }
      return lightWith(ctx, tool);
    },
    // CANDLES-FCN's LAMP-OFF.
    candles_out: (ctx) => {
      if (!ctx.state.itemState.candles?.on) return ['The candles are not lighted.'];
      const dark = !ctx.world.rooms[ctx.room()]?.dark ? false : !['lamp', 'torch', 'match'].some((id) => ctx.state.itemState[id]?.on && ctx.here(id));
      return [{ switch: 'candles', on: false }, { noDarkLine: true }, `The flame is extinguished.${dark ? ' It’s really dark in here....' : ''}`];
    },
    // CAVE2-ROOM: ZPROB 50 (worse odds once your luck is gone).
    candle_gust: (ctx) => {
      if (ctx.roll(ctx.state.flags.unlucky ? 300 : 100) >= 50) return [];
      const dark = !['lamp', 'torch', 'match'].some((id) => ctx.state.itemState[id]?.on && ctx.here(id));
      return [{ switch: 'candles', on: false }, { noDarkLine: true }, 'A gust of wind blows out your candles!', ...(dark ? ['It is now completely dark.'] : [])];
    },
    // HOT-BELL-F: RUB, or RING WITH something.
    hot_bell_touched: (ctx) => {
      const tool = ctx.command?.indirect;
      // With no tool there's no HANDS to blame: RUB finds it too intense.
      if (!tool) return [ctx.command?.verb === 'ring' ? 'The bell is too hot to reach.' : 'The heat from the bell is too intense.'];
      const item = ctx.world.items[tool];
      if (item?.burnable) return [`The ${item.name} burns and is consumed.`, { move: tool, to: null }];
      return ['The heat from the bell is too intense.'];
    },
    // LOUD-ROOM-FCN's loop: the first word (after GO or SAY) decides; anything else echoes.
    loud_room_capture: (ctx) => {
      // The loop reads raw input; a command that arrived already parsed isn't for it.
      if (ctx.line === undefined) return;
      const flags = ctx.state.flags;
      // Only while it's loud: gates and tide both one way or both the other.
      if (Boolean(flags.gates_open) !== Boolean(flags.low_tide)) return;
      const words = (ctx.line ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return ['I beg your pardon?', { free: true }];
      let word = words[0];
      if (['go', 'walk', 'run'].includes(word)) word = words[1] ?? '';
      else if (word === 'say') word = words[2] ?? '';
      if (['save', 'restore', 'q', 'quit'].includes(word)) return;
      const exits: Record<string, string> = { w: 'round_room', west: 'round_room', e: 'damp_cave', east: 'damp_cave', u: 'deep_canyon', up: 'deep_canyon' };
      if (exits[word]) return [{ go: exits[word] }, { free: true }];
      if (word === 'bug') return ['That’s only your opinion.', { free: true }];
      // The loop ends, and the arrival it interrupted describes the room.
      if (word === 'echo') return [{ set: 'loud_flag' }, { set: 'unsacred_bar' }, 'The acoustics of the room change subtly.', { go: 'loud_room' }, { free: true }];
      const last = words[words.length - 1];
      return [`${last} ${last} ...`, { free: true }];
    },
    // CANARY-OBJECT: wound in the forest, the songbird brings the bauble (once).
    canary_wind: (ctx) => {
      const here = ctx.room();
      if (ctx.state.flags.sing_song || !['forest_1', 'forest_2', 'forest_3', 'path', 'up_a_tree'].includes(here)) {
        return ['The canary chirps blithely, if somewhat tinnily, for a short time.'];
      }
      return [
        'The canary chirps, slightly off-key, an aria from a forgotten opera. From out of the greenery flies a lovely songbird. It perches on a limb just over your head and opens its beak to sing. As it does so a beautiful brass bauble drops from its mouth, bounces off the top of your head, and lands glimmering in the grass. As the canary winds down, the songbird flies away.',
        { set: 'sing_song' },
        { move: 'bauble', to: here === 'up_a_tree' ? 'path' : here },
      ];
    },
    // BASKET-F: RAISE and LOWER swap the basket and its stand-in; contents ride along.
    basket: (ctx) => {
      const raise = ctx.arg === 'raise';
      const top = !ctx.state.flags.cage_bottom;
      if (raise === top) {
        const [steps, line] = pickOne(ctx, 'dummy', ['Look around.', 'Too late for that.', 'Have your eyes checked.']);
        return [...steps, line];
      }
      if (raise) return [{ move: 'raised_basket', to: 'shaft_room' }, { move: 'lowered_basket', to: 'lower_shaft' }, { clear: 'cage_bottom' }, 'The basket is raised to the top of the shaft.'];
      // A light riding in the basket goes with it; the engine says “It is now pitch black.”
      return [{ move: 'raised_basket', to: 'lower_shaft' }, { move: 'lowered_basket', to: 'shaft_room' }, 'The basket is lowered to the bottom of the shaft.', { set: 'cage_bottom' }];
    },
    // MACHINE-F's OPEN and CLOSE.
    machine_lid: (ctx) => {
      const open = Boolean(ctx.state.itemState.machine?.open);
      if (ctx.arg === 'close') {
        if (open) return [{ close: 'machine' }, 'The lid closes.'];
      } else if (!open) {
        const inside = ctx.children('machine');
        if (!inside.length) return [{ open: 'machine' }, 'The lid opens.'];
        const names = inside.map((id) => `${/^[aeiou]/i.test(ctx.world.items[id].name) ? 'an' : 'a'} ${ctx.world.items[id].name}`);
        return [{ open: 'machine' }, `The lid opens, revealing ${names.join(', ')}.`];
      }
      const [steps, line] = pickOne(ctx, 'dummy', ['Look around.', 'Too late for that.', 'Have your eyes checked.']);
      return [...steps, line];
    },
    // MSWITCH-FUNCTION: coal becomes a diamond; anything else, slag.
    machine_switch: (ctx) => {
      const tool = ctx.command?.indirect;
      if (!tool) return ['It’s not clear how to turn it on with your bare hands.'];
      if (tool !== 'screwdriver') return [`It seems that a ${ctx.world.items[tool]?.name ?? tool} won’t do.`];
      if (ctx.state.itemState.machine?.open) return ['The machine doesn’t seem to want to do anything.'];
      const inside = ctx.children('machine');
      const made: EventStep[] = inside.includes('coal')
        ? [{ move: 'coal', to: null }, { move: 'diamond', to: 'machine' }]
        : [...inside.map((id): EventStep => ({ move: id, to: null })), { move: 'gunk', to: 'machine' }];
      return ['The machine comes to life (figuratively) with a dazzling display of colored lights and bizarre noises. After a few moments, the excitement abates.', ...made];
    },
    // BOOM-ROOM's M-END: a flame held here ignites the gas, more pointedly if you just lit it.
    gas_check: (ctx) => {
      const flames = ['candles', 'torch', 'match'];
      if (!flames.some((id) => ctx.carried(id) && ctx.state.itemState[id]?.on)) return;
      const c = ctx.command;
      const lit = c && ['turn_on', 'burn'].includes(c.verb) && c.target && flames.includes(c.target) ? c.target : undefined;
      return [
        lit
          ? `How sad for an aspiring adventurer to light a ${ctx.world.items[lit].name} in a room which reeks of gas. Fortunately, there is justice in the world.`
          : 'Oh dear. It appears that the smell coming from this room was coal gas. I would have thought twice about carrying flaming objects in here.',
        { die: '\n      ** BOOOOOOOOOOOM **' },
      ];
    },
    // FLY-ME: the bat drops you in a random part of the mine (PICK-ONE over BAT-DROPS).
    bat_flight: (ctx) => {
      const [steps, room] = pickOne(ctx, 'bat_drops', ['mine_1', 'mine_2', 'mine_3', 'mine_4', 'ladder_top', 'ladder_bottom', 'squeeky_room', 'mine_entrance']);
      return ['    Fweep!', '    Fweep!', '    Fweep!', 'The bat grabs you by the scruff of your neck and lifts you away....', '', ...steps, { go: room }];
    },
    // SLIDER: things put in the slide end up in the Cellar.
    slider: (ctx) => {
      const id = ctx.command?.target;
      if (!id) return;
      if (!ctx.world.items[id]?.portable) {
        const [steps, line] = pickOne(ctx, 'yuks', ['A valiant attempt.', 'You can’t be serious.', 'An interesting idea...', 'What a concept!']);
        return [...steps, line];
      }
      return [`The ${ctx.world.items[id].name} falls into the slide and is gone.`, { move: id, to: 'cellar' }];
    },
    // PICK-ONE over LOUD-RUNS.
    loud_run: (ctx) => {
      const [steps, room] = pickOne(ctx, 'loud_runs', ['damp_cave', 'round_room', 'deep_canyon']);
      return [...steps, { go: room }];
    },
    // V-LEAP where there's no way down: PICK-ONE over JUMPLOSS.
    jump_loss: (ctx) => {
      const [steps, line] = pickOne(ctx, 'jumploss', ['You should have looked before you leaped.', 'In the movies, your life would be passing before your eyes.', 'Geronimo...']);
      return [...steps, { die: line }];
    },
    // MIRROR-MIRROR: the two rooms swap everything in them, and you're in the other one.
    mirror_rub: (ctx) => {
      const tool = ctx.command?.indirect;
      if (tool) return [`You feel a faint tingling transmitted through the ${ctx.world.items[tool]?.name ?? tool}.`];
      const here = ctx.room();
      const there = here === 'mirror_room_2' ? 'mirror_room_1' : 'mirror_room_2';
      const steps: EventStep[] = [];
      for (const id of ctx.children(here)) steps.push({ move: id, to: there });
      for (const id of ctx.children(there)) steps.push({ move: id, to: here });
      for (const id of Object.keys(ctx.world.npcs)) {
        if (ctx.npcIn(id, here)) steps.push({ moveNpc: id, to: there });
        else if (ctx.npcIn(id, there)) steps.push({ moveNpc: id, to: here });
      }
      return [...steps, { go: there, quiet: true }, 'There is a rumble from deep within the earth and the room shakes.'];
    },
    // BOLT-F: TURN BOLT WITH WRENCH, while the yellow button's gate flag is set.
    bolt_turn: (ctx) => {
      const tool = ctx.command?.indirect;
      if (tool !== 'wrench') return [`The bolt won’t turn using the ${tool ? ctx.world.items[tool]?.name : 'nothing'}.`];
      if (!ctx.state.flags.gate_flag) return ['The bolt won’t turn with your best effort.'];
      if (ctx.state.flags.gates_open)
        return [
          { unvisit: 'reservoir_south' },
          { clear: 'gates_open' },
          { unvisit: 'loud_room' },
          'The sluice gates close and water starts to collect behind the dam.',
          { schedule: 'reservoir_fills', in: 7 },
          { cancel: 'reservoir_empties' },
        ];
      return [
        { unvisit: 'reservoir_south' },
        { set: 'gates_open' },
        'The sluice gates open and water pours through the dam.',
        { schedule: 'reservoir_empties', in: 7 },
        { cancel: 'reservoir_fills' },
      ];
    },
    // DAM-FUNCTION's PLUG.
    dam_plug: (ctx) => [`With a ${ctx.world.items[ctx.command?.indirect ?? '']?.name ?? 'thing'}? Do you know how big this dam is? You could only stop a tiny leak with that.`],
    // WITH-TELL.
    with_tell: (ctx) => [`With a ${ctx.world.items[ctx.command?.indirect ?? '']?.name ?? 'thing'}?`],
    // TUBE-FUNCTION's SQUEEZE.
    squeeze_tube: (ctx) => {
      const open = ctx.state.itemState.tube?.open;
      if (open && ctx.holder('putty') === 'tube') return [{ move: 'putty', to: 'player' }, 'The viscous material oozes into your hand.'];
      return [open ? 'The tube is apparently empty.' : 'The tube is closed.'];
    },
    // I-MAINT-ROOM, every turn while the leak runs.
    maint_rising: (ctx) => {
      const level = ctx.state.vars?.water_level ?? 0;
      const here = ctx.room() === 'maintenance_room';
      const steps: EventStep[] = [];
      if (here) steps.push(`The water level here is now ${DROWNINGS[Math.floor(level / 2)]}`);
      steps.push({ setVar: 'water_level', to: level + 1 });
      if (level + 1 >= 14) {
        steps.push({ set: 'maint_flooded' }, { clear: 'leaking' });
        if (here) steps.push({ die: 'I’m afraid you have done drowned yourself.' });
      } else if (ctx.aboard() === 'inflated_boat' && ['maintenance_room', 'dam_room', 'dam_lobby'].includes(ctx.room())) {
        steps.push({ die: 'The rising water carries the boat over the dam, down the river, and over the falls. Tsk, tsk.' });
      }
      return steps;
    },
    // MATCH-FUNCTION's LAMP-ON and BURN.
    strike_match: (ctx) => {
      if (ctx.command?.target !== 'match') return [];
      const count = Math.max((ctx.state.vars?.match_count ?? 0) - 1, 0);
      const steps: EventStep[] = [{ setVar: 'match_count', to: count }];
      if (count <= 0) return [...steps, 'I’m afraid that you have run out of matches.'];
      return [...steps, { switch: 'match', on: true }, { schedule: 'match_out', in: 1 }, 'One of the matches starts to burn.'];
    },
    // MATCH-FUNCTION's COUNT.
    count_matches: (ctx) => {
      const n = (ctx.state.vars?.match_count ?? 0) - 1;
      return [`You have ${n > 0 ? n : 'no'} match${n === 1 ? '' : 'es'}.`];
    },
    // WATER-F's FILL: PUT WATER IN BOTTLE.
    fill_bottle: (ctx) => {
      if (!ctx.carried('bottle')) return [ctx.holder('water') === 'bottle' && ctx.command?.target === 'water' ? 'It’s in the bottle. Perhaps you should take that instead.' : 'The water slips through your fingers.'];
      if (!ctx.state.itemState.bottle?.open) return ['The bottle is closed.'];
      if (ctx.children('bottle').length > 0) return ['The water slips through your fingers.'];
      return [{ move: 'water', to: 'bottle' }, 'The bottle is now full of water.'];
    },
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
    thief_stole_light: (ctx) => (ctx.arg === 'lit' && !ctx.lit() ? ['The thief seems to have left you in the dark.', { noDarkLine: true }] : []),
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
        // ROBBER-C-DESC from now on, seen or not.
        { set: 'thief_revived' },
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
      const steps: EventStep[] = strength < 0 ? [{ npcState: 'thief', strength: -strength }, { set: 'thief_revived' }, 'Your proposed victim suddenly recovers consciousness.'] : [];
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
    squeeze: { words: ['squeeze'], target: 'required', reply: 'How singularly useless.' },
    // V-WIND.
    wind: { words: ['wind up', 'wind'], target: 'required', reply: 'You cannot wind up a {target}.' },
    // V-SMELL.
    smell: { words: ['smell', 'sniff'], target: 'required', reply: 'It smells like a {target}.' },
    fill: { words: ['fill'], target: 'required', indirect: ['with'] },
    rub: { words: ['rub', 'touch', 'feel', 'pat', 'pet'], target: 'required', indirect: ['with'], reply: 'Fiddling with that doesn’t seem to work.' },
    tie: { words: ['tie', 'fasten', 'secure'], target: 'required', indirect: ['to'], reply: 'You can’t tie that to that.' },
    untie: { words: ['untie', 'unfasten', 'unhook'], target: 'required', indirect: ['from'], reply: 'This cannot be tied, so it cannot be untied!' },
    // V-LEAP (its room checks are in the world capture); otherwise V-SKIP.
    jump: { words: ['jump over', 'jump across', 'jump', 'leap', 'dive'], target: 'optional', reply: WHEEEEE },
    // V-SKIP.
    skip: { words: ['skip', 'hop'], target: 'none', reply: WHEEEEE },
    // V-EXORCISE.
    exorcise: { words: ['exorcise', 'banish', 'cast out', 'drive out', 'begone'], target: 'required', reply: 'What a bizarre concept!' },
    inflate: { words: ['inflate', 'blow up'], target: 'required', indirect: ['with'], reply: 'How can you inflate that?' },
    deflate: { words: ['deflate'], target: 'required', reply: 'Come on, now!' },
    pump: { words: ['pump up', 'pump'], target: 'required', indirect: ['with'], reply: 'It’s really not clear how.' },
    breathe: { words: ['blow in', 'blow into', 'breathe in', 'breathe into'], target: 'required', reply: 'You don’t have enough lung power to inflate it.' },
    launch: { words: ['launch'], target: 'optional', reply: 'You can’t launch that by saying “launch”!' },
    land: { words: ['land'], target: 'none', go: true },
    wave: { words: ['wave', 'brandish'], target: 'required', reply: hackHack('Waving') },
    // V-KICK.
    kick: { words: ['kick', 'taunt'], target: 'required', reply: hackHack('Kicking') },
    // V-RAISE and V-LOWER (HACK-HACK's line, fixed, as WAVE's is).
    raise: { words: ['raise', 'lift', 'raise up'], target: 'required', reply: hackHack('Playing in this way with') },
    lower: { words: ['lower'], target: 'required', reply: hackHack('Playing in this way with') },
    cross: { words: ['cross', 'ford'], target: 'required', reply: 'You can’t cross that!' },
    look_under: { words: ['look under'], target: 'required', reply: 'There is nothing but dust there.' },
    dig: { words: ['dig in', 'dig'], target: 'required', indirect: ['with'], reply: 'Digging with the pair of hands is slow and tedious.' },
    ring: { words: ['ring', 'peal'], target: 'required', indirect: ['with'], reply: 'How, exactly, can you ring that?' },
    pour: { words: ['pour', 'spill'], target: 'required', indirect: ['on', 'in', 'from'], held: true },
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
    { flag: 'took_trunk', points: 15 },
    { flag: 'took_emerald', points: 5 },
    { flag: 'took_scarab', points: 5 },
    { flag: 'took_pot', points: 10 },
    { if: 'inside:pot_of_gold:trophy_case', points: 10 },
    { if: 'inside:scarab:trophy_case', points: 5 },
    { if: 'inside:emerald:trophy_case', points: 10 },
    // Stage 5c: the coal mine. LIGHT-SHAFT is 13 for the first lit turn in the Lower Shaft.
    { flag: 'took_canary', points: 6 },
    { flag: 'took_bauble', points: 1 },
    { if: 'inside:bauble:trophy_case', points: 1 },
    { flag: 'took_jade', points: 5 },
    { if: 'inside:jade:trophy_case', points: 5 },
    { flag: 'took_bracelet', points: 5 },
    { if: 'inside:bracelet:trophy_case', points: 5 },
    { flag: 'took_diamond', points: 10 },
    { if: 'inside:diamond:trophy_case', points: 10 },
    { flag: 'light_shaft', points: 13 },
    { flag: 'took_bar', points: 10 },
    { if: 'inside:bar:trophy_case', points: 5 },
    { flag: 'took_trident', points: 4 },
    { if: 'inside:trident:trophy_case', points: 11 },
    { flag: 'took_torch', points: 14 },
    { if: 'inside:torch:trophy_case', points: 6 },
    { flag: 'took_coffin', points: 10 },
    { if: 'inside:coffin:trophy_case', points: 15 },
    { flag: 'took_sceptre', points: 4 },
    { if: 'inside:sceptre:trophy_case', points: 6 },
    { flag: 'took_skull', points: 10 },
    { if: 'inside:skull:trophy_case', points: 10 },
    { if: 'inside:trunk:trophy_case', points: 5 },
    // Treasures count while they're in the trophy case.
    { if: 'inside:painting:trophy_case', points: 6 },
  ],
  maxScore: 350,
  // DEAD-FUNCTION: what a spirit can and can't do.
  capture: { script: 'world_beg' },
  // V-WAIT: three turns of the clock, or fewer if something happens.
  wait: { turns: 3 },
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

  vars: { beach_dig: -1, candle_life: 75, water_level: 0, match_count: 6, lamp_fuel: 385, sword_glow: 0, troll_ldesc: 0, cyclowrath: 0 },

  // Zork's LAMP-TABLE: warnings after 100, 170 and 185 lit turns; out on the next.
  daemons: [
    // SCORE-UPD: at 350, the whisper, the map, and West of House's secret path.
    { if: 'score>=350 & !flag:won', then: 'won' },
    // I-MAINT-ROOM.
    { if: 'flag:leaking', then: [{ script: 'maint_rising' }] },
    // I-CYCLOPS: queued during play, so it's the newest interrupt and runs first.
    { if: 'flag:cyclops_daemon', then: [{ script: 'cyclops_turn' }] },
    { if: 'on:lamp', then: [{ add: 'lamp_fuel', by: -1 }] },
    // I-LANTERN and LAMP-TABLE: 200 turns of light, then 100, 70 and 15.
    { if: 'on:lamp & var:lamp_fuel=185 & here:lamp', then: ['The lamp appears a bit dimmer.'] },
    { if: 'on:lamp & var:lamp_fuel=85 & here:lamp', then: ['The lamp is definitely dimmer now.'] },
    { if: 'on:lamp & var:lamp_fuel=15 & here:lamp', then: ['The lamp is nearly out.'] },
    { if: 'on:lamp & var:lamp_fuel=0', then: 'lamp_dies' },
    // I-CANDLES and CANDLE-TABLE: 40 turns once touched, then 20, 10 and 5, while lit.
    { if: 'on:candles & flag:candles_touched', then: [{ add: 'candle_life', by: -1 }] },
    { if: 'on:candles & flag:candles_touched & var:candle_life=35 & here:candles', then: ['The candles grow shorter.'] },
    { if: 'on:candles & flag:candles_touched & var:candle_life=15 & here:candles', then: ['The candles are becoming quite short.'] },
    { if: 'on:candles & flag:candles_touched & var:candle_life=5 & here:candles', then: ['The candles won’t last long now.'] },
    { if: 'on:candles & flag:candles_touched & var:candle_life=0', then: 'candles_burn_out' },
    // I-THIEF: GO queues it after the sword and before the lantern, so it runs between them.
    { if: 'alive:thief & awake:thief', then: [{ script: 'thief_turn' }] },
    // I-SWORD, which runs after the lantern and before the fight.
    { if: 'has:sword', then: [{ script: 'sword_glow' }] },
  ],

  darkness: {
    // ALWAYS-LIT, for a spirit.
    litIf: 'flag:dead',
    look: 'It is pitch black. You are likely to be eaten by a grue.',
    arrive: 'You have moved into a dark place.',
    tooDark: 'It’s too dark to see!',
    blunder: [{ chance: 80, then: [{ die: GRUE }], else: ['You can’t go that way.'] }],
    // GOTO, from one unlit room into another (PROB 80).
    stumble: {
      chance: 80,
      then: [{ die: 'Oh, no! A lurking grue slithered into the room and devoured you!' }],
      aboard: [{ die: 'Oh, no! A lurking grue slithered into the magic boat and devoured you!' }],
    },
  },

  // STONE-BARROW-FCN, then FINISH: the score and Zork's last question.
  endings: {
    barrow: {
      lines: [
        'Inside the Barrow',
        'As you enter the barrow, the door closes inexorably behind you. Around you it is dark, but ahead is an enormous cavern, brightly lit. Through its center runs a wide stream. Spanning the stream is a small wooden footbridge, and beyond a path leads into a dark tunnel. Above the bridge, floating in the air, is a large sign. It reads:  All ye who stand before this bridge have completed a great and perilous adventure which has tested your wit and courage. You have mastered the first part of the ZORK trilogy. Those who pass over this bridge must be prepared to undertake an even greater adventure that will severely test your skill and bravery!',
        '',
        'The ZORK trilogy continues with “ZORK II: The Wizard of Frobozz” and is completed in “ZORK III: The Dungeon Master.”',
      ],
      score: true,
      footer: ['', 'Would you like to restart the game from the beginning, restore a saved game position, or end this session of the game?', '(Type RESTART, RESTORE, or QUIT):'],
    },
  },

  death: {
    message: [{ if: 'flag:unlucky', text: 'Bad luck, huh?' }, '', '****  You have died  ****', ''],
    penalty: -10,
    lives: 2,
    respawn: 'forest_1',
    // JIGS-UP clears the trap door's TOUCHBIT: it slams again next time.
    then: 'death_resets',
    resurrection: [
      'Now, let’s take a look here... Well, you probably deserve another chance. I can’t quite fix you up completely, but you can’t have everything.',
    ],
    // RANDOMIZE-OBJECTS: treasures into the dark, the rest above ground.
    treasures: 'dark',
    scatter: ['canyon_view', 'west_of_house', 'north_of_house', 'south_of_house', 'east_of_house', 'forest_1', 'forest_2', 'forest_3', 'path', 'clearing', 'grating_clearing'],
    // JIGS-UP: once you've seen the Altar, you wake as a spirit before the gates of Hell.
    variants: [
      {
        if: 'visited:south_temple',
        resurrection: ['As you take your last breath, you feel relieved of your burdens. The feeling passes as you find yourself before the gates of Hell, where the spirits jeer at you and deny you entry. Your senses are disturbed. The objects in the dungeon appear indistinct, bleached of color, even unreal.', ''],
        respawn: 'entrance_to_hades',
        // DEAD is set before the GOTO, so Hades is described as a spirit sees it.
        before: 'ghost_begins',
      },
    ],
    instead: [
      {
        if: 'flag:dead',
        lines: ['', 'It takes a talented person to be killed while already dead. YOU are such a talent. Unfortunately, it takes a talented person to deal with it. I am not such a talent. Sorry.'],
      },
    ],
    final: [
      'You clearly are a suicidal maniac. We don’t allow psychotics in the cave, since they may harm other adventurers. Your remains will be installed in the Land of the Living Dead, where your fellow adventurers may gloat over them.',
    ],
  },

  quit: 'There is no quitting yet. Type EJECT to leave, or RESTART to begin again.',
  idle: 'Time passes...',

  events: {
    // BUTTON-F.
    gate_flag_on: [{ unvisit: 'dam_room' }, { set: 'gate_flag' }, 'Click.'],
    gate_flag_off: [{ unvisit: 'dam_room' }, { clear: 'gate_flag' }, 'Click.'],
    lights_on: [{ switch: 'maintenance_lights', on: true }, 'The lights within the room come on.'],
    lights_off: [{ switch: 'maintenance_lights', on: false }, 'The lights within the room shut off.'],
    leak_starts: [
      { reveal: 'leak' },
      'There is a rumbling sound and a stream of water appears to burst from the east wall of the room (apparently, a leak has occurred in a pipe).',
      { setVar: 'water_level', to: 1 },
      { set: 'leaking' },
    ],
    // FIX-MAINT-LEAK.
    leak_fixed: [{ setVar: 'water_level', to: -1 }, { clear: 'leaking' }, 'By some miracle of Zorkian technology, you have managed to stop the leak in the dam.'],
    // TOOL-CHEST-FCN.
    chests_crumble: [{ move: 'tool_chest', to: null }, 'The chests are so rusty and corroded that they crumble when you touch them.'],
    // I-MATCH.
    match_out: ['The match has gone out.', { switch: 'match', on: false }],
    match_out_now: ['The match is out.', { switch: 'match', on: false }, { cancel: 'match_out' }],
    // I-REMPTY.
    reservoir_empties: [
      { unvisit: 'deep_canyon' },
      { unvisit: 'loud_room' },
      { reveal: 'trunk' },
      { set: 'low_tide' },
      { if: 'in:deep_canyon', then: ['The roar of rushing water is quieter now.'] },
      { if: 'in:reservoir_north', then: ['The water level is now quite low here and you could easily cross over to the other side.'] },
      { if: 'in:reservoir_south', then: ['The water level is now quite low here and you could easily cross over to the other side.'] },
    ],
    // I-RFILL.
    reservoir_fills: [
      { unvisit: 'deep_canyon' },
      { unvisit: 'loud_room' },
      { if: 'inside:trunk:reservoir', then: [{ hide: 'trunk' }] },
      { clear: 'low_tide' },
      {
        if: 'in:reservoir',
        then: [{ die: 'You are lifted up by the rising river! You try to swim, but the currents are too strong. You come closer, closer to the awesome structure of Flood Control Dam #3. The dam beckons to you. The roar of the water nearly deafens you, but you remain conscious as you tumble over the dam toward your certain doom among the rocks at its base.' }],
      },
      { if: 'in:deep_canyon', then: ['A sound, like that of flowing water, starts to come from below.'] },
      { if: 'in:loud_room', then: ['All of a sudden, an alarmingly loud roaring sound fills the room. Filled with fear, you scramble away.', { script: 'loud_run' }] },
      { if: 'in:reservoir_north', then: ['You notice that the water level has risen to the point that it is impossible to cross.'] },
      { if: 'in:reservoir_south', then: ['You notice that the water level has risen to the point that it is impossible to cross.'] },
    ],
    took_trunk: [{ set: 'took_trunk' }],
    took_pot: [{ set: 'took_pot' }],
    sceptre_waved: [{ script: 'sceptre_waved' }],
    cross_rainbow: [{ script: 'cross_rainbow' }],
    over_the_cliff: [{ script: 'over_the_cliff' }],
    // BATS-ROOM's M-ENTER describes the room before FLY-ME; TAKE BAT doesn't.
    bat_arrival: [{ look: true }, { script: 'bat_flight' }],
    gunk_crumbles: [{ move: 'gunk', to: null }, 'The slag was rather insubstantial, and crumbles into dust at your touch.'],
    basket_raise: [{ script: 'basket', arg: 'raise' }],
    basket_lower: [{ script: 'basket', arg: 'lower' }],
    machine_open: [{ script: 'machine_lid', arg: 'open' }],
    machine_close: [{ script: 'machine_lid', arg: 'close' }],
    machine_on: [{ script: 'machine_switch' }],
    machine_switch: [{ script: 'machine_switch' }],
    bat_flight: [{ script: 'bat_flight' }],
    slider: [{ script: 'slider' }],
    slide_down: ['You tumble down the slide....', { go: 'cellar' }],
    canyon_jump: [{ if: '!aboard', then: [{ die: 'Nice view, lousy place to jump.' }] }],
    took_scarab: [{ set: 'took_scarab' }],
    won: [
      { set: 'won' },
      { reveal: 'map' },
      { unvisit: 'west_of_house' },
      'An almost inaudible voice whispers in your ear, “Look to your treasures for the final secret.”',
    ],
    barrow_end: [{ end: 'barrow' }],
    into_kitchen: [{ go: 'kitchen' }],
    took_canary: [{ set: 'took_canary' }],
    took_bauble: [{ set: 'took_bauble' }],
    canary_wind: [{ script: 'canary_wind' }],
    took_jade: [{ set: 'took_jade' }],
    took_bracelet: [{ set: 'took_bracelet' }],
    took_diamond: [{ set: 'took_diamond' }],
    dig_sand: [{ script: 'dig_sand' }],
    took_emerald: [{ set: 'took_emerald' }],
    river_current: [{ script: 'river_current' }],
    boat_inflate: [{ script: 'boat_inflate' }],
    boat_pump: [{ script: 'boat_pump' }],
    // RBOAT-FUNCTION's DEFLATE.
    boat_deflate: [
      { if: '!here:inflated_boat', then: ['The boat must be on the ground to be deflated.'] },
      { if: 'here:inflated_boat', then: ['The boat deflates.', { set: 'deflate' }, { move: 'inflated_boat', to: null }, { move: 'inflatable_boat', to: 'here' }] },
    ],
    // RBOAT-FUNCTION's BOARD: something sharp in hand.
    boat_punctured_boarding: [
      'Oops! Something sharp seems to have slipped and punctured the boat. The boat deflates to the sounds of hissing, sputtering, and cursing.',
      { move: 'inflated_boat', to: null },
      { move: 'punctured_boat', to: 'here' },
    ],
    // FIX-BOAT.
    boat_repaired: ['Well done. The boat is repaired.', { script: 'boat_repaired' }],
    took_bar: [{ set: 'took_bar' }],
    took_trident: [{ set: 'took_trident' }],
    took_coffin: [{ set: 'took_coffin' }],
    took_sceptre: [{ set: 'took_sceptre' }],
    took_skull: [{ set: 'took_skull' }],
    prayer_answered: [{ go: 'forest_1' }],
    // LLD-ROOM's M-BEG: RING BELL.
    bell_rung: [
      { set: 'xb' },
      { move: 'bell', to: null },
      { move: 'hot_bell', to: 'here' },
      'The bell suddenly becomes red hot and falls to the ground. The wraiths, as if paralyzed, stop their jeering and slowly turn to face you. On their ashen faces, the expression of a long-forgotten terror takes shape.',
      { if: 'has:candles', then: ['In your confusion, the candles drop to the ground (and they are out).', { move: 'candles', to: 'here' }, { switch: 'candles', on: false }] },
      { schedule: 'xb_ends', in: 5 },
      { schedule: 'hot_bell_cools', in: 19 },
    ],
    // LLD-ROOM's M-END.
    exorcism_flames: [
      { set: 'xc' },
      'The flames flicker wildly and appear to dance. The earth beneath your feet trembles, and your legs nearly buckle beneath you. The spirits cower at your unearthly power.',
      { cancel: 'xb_ends' },
      { schedule: 'xc_ends', in: 2 },
    ],
    // LLD-ROOM's M-BEG: READ BOOK.
    exorcism_done: [
      'Each word of the prayer reverberates through the hall in a deafening confusion. As the last word fades, a voice, loud and commanding, speaks: “Begone, fiends!” A heart-stopping scream fills the cavern, and the spirits, sensing a greater power, flee through the walls.',
      { moveNpc: 'ghosts', to: null },
      { set: 'lld_flag' },
      { cancel: 'xc_ends' },
    ],
    // I-XB.
    xb_ends: [{ if: '!flag:xc & in:entrance_to_hades', then: ['The tension of this ceremony is broken, and the wraiths, amused but shaken at your clumsy attempt, resume their hideous jeering.'] }, { clear: 'xb' }],
    // I-XC.
    xc_ends: [{ clear: 'xc' }, { run: 'xb_ends' }],
    // I-XBH.
    hot_bell_cools: [{ move: 'hot_bell', to: null }, { move: 'bell', to: 'entrance_to_hades' }, { if: 'in:entrance_to_hades', then: ['The bell appears to have cooled down.'] }],
    hot_bell_touched: [{ script: 'hot_bell_touched' }],
    hot_bell_cooled: [{ move: 'water', to: null }, 'The water cools the bell and is evaporated.', { cancel: 'hot_bell_cools' }, { run: 'hot_bell_cools' }],
    candles_touched: [{ set: 'candles_touched' }],
    candles_lit: [{ set: 'candles_touched' }, { script: 'light_candles' }],
    candles_out: [{ set: 'candles_touched' }, { script: 'candles_out' }],
    candles_examined_lit: [{ set: 'candles_touched' }, 'The candles are burning.'],
    candles_examined: [{ set: 'candles_touched' }, 'The candles are out.'],
    // I-CANDLES at its last turn.
    candles_burn_out: [{ switch: 'candles', on: false }, { set: 'candles_burnt' }, { if: 'here:candles', then: ['You’d better have more light than from the pair of candles.'] }],
    book_burns: [{ move: 'book', to: null }, { die: 'A booming voice says “Wrong, cretin!” and you notice that you have turned into a pile of dust. How, I can’t imagine.' }],
    bodies_defiled: [{ die: 'The voice of the guardian of the dungeon booms out from the darkness, “Your disrespect costs you your life!” and places your head on a sharp pole.' }],
    // JIGS-UP after the Altar: a spirit now.
    ghost_begins: [{ set: 'dead' }],
    spirit_falls: ['As you enter the dome you feel a strong pull as if from a wind drawing you over the railing and down.', { go: 'torch_room', quiet: true }],
    took_torch: [{ set: 'took_torch' }],
    mirror_rub: [{ script: 'mirror_rub' }],
    mirror_breaks: [{ set: 'mirror_mung' }, { set: 'unlucky' }, 'You have broken the mirror. I hope you have a seven years’ supply of good luck handy.'],
    rope_tie_elsewhere: [{ clear: 'dome_flag' }, 'You can’t tie the rope to that.'],
    rope_tied: [
      'The rope drops over the side and comes within ten feet of the floor.',
      { set: 'dome_flag' },
      { unlist: 'rope' },
      { if: 'has:rope', then: [{ move: 'rope', to: 'here' }] },
    ],
    rope_untied: [{ clear: 'dome_flag' }, { relist: 'rope' }, 'The rope is now untied.'],
    rope_drops: [{ move: 'rope', to: 'torch_room' }, 'The rope drops gently to the floor below.'],
    jump_death: ['This was not a very safe place to try jumping.', { script: 'jump_loss' }],
    loud_noise: [{ stopLine: 'The rest of your commands have been lost in the noise.' }],
    tree_leap: ['In a feat of unaccustomed daring, you manage to land on your feet without killing yourself.', '', { go: 'path' }],
    loud_room_ejects: [
      'It is unbearably loud here, with an ear-splitting roar seeming to come from all around you. There is a pounding in your head which won’t stop. With a tremendous effort, you scramble out of the room.',
      '',
      { script: 'loud_run' },
    ],
    fill_bottle: [{ script: 'fill_bottle' }],
    bolt_turn: [{ script: 'bolt_turn' }],
    dam_plug: [{ script: 'dam_plug' }],
    with_tell: [{ script: 'with_tell' }],
    squeeze_tube: [{ script: 'squeeze_tube' }],
    strike_match: [{ script: 'strike_match' }],
    count_matches: [{ script: 'count_matches' }],
    water_spills: [{ move: 'water', to: null }, 'The water spills to the floor and evaporates immediately.'],
    intro: [
      'ZORK I: The Great Underground Empire',
      'Infocom interactive fiction - a fantasy story',
      'Copyright (c) 1981, 1982, 1983, 1984, 1985, 1986 Infocom, Inc. All rights reserved.',
      'ZORK is a registered trademark of Infocom, Inc.',
      'Release 119 / Serial number 880429',
      '[A native Brass Lantern port.]',
      // INVISIBLE until something reveals them.
      { hide: 'leak' },
      { hide: 'trunk' },
      { hide: 'scarab' },
      { hide: 'pot_of_gold' },
      { hide: 'map' },
      // The torch and the candles are lit from the start (ONBIT); the hot bell waits offstage.
      { switch: 'torch', on: true },
      { switch: 'candles', on: true },
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
