import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import { captureLine, execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse, splitCommands, verbClashes } from '@/engine/parser';
import { currentScore, statusText } from '@/engine/verbs/meta';
import { zork1 } from '@/worlds/zork1';

function play(commands: string[]) {
  const state = initialState(zork1);
  const out: string[] = [...openingLines(zork1, state)];
  for (const c of commands) {
    for (const piece of splitCommands(c, zork1.verbs)) {
      const parsed = fallbackParse(piece, zork1.verbs) ?? { action: 'unknown' };
      out.push(`> ${piece}`, ...execute(parsed, { world: zork1, state }).lines);
    }
  }
  return { state, text: out.join('\n') };
}

describe('Zork I, natively: house and forest', () => {
  it('shows Zork’s status line, and has its title and credits for VERSION', () => {
    expect(statusText(zork1, initialState(zork1))).toBe('West of House  Score: 0  Moves: 0');
    expect(zork1.title).toBe('ZORK I: The Great Underground Empire');
    expect(zork1.credits?.[0]).toMatch(/^Copyright \(c\) 1981/);
  });

  it('opens west of the house', () => {
    const { text } = play([]);
    expect(text).toContain('West of House');
    expect(text).toContain('There is a small mailbox here.');
  });

  it('the mailbox, the leaflet and reading it', () => {
    const { text, state } = play(['open mailbox', 'take leaflet', 'read leaflet']);
    expect(text).toContain('Opening the small mailbox reveals a leaflet.');
    expect(text).toContain('WELCOME TO ZORK!');
    expect(state.locations.leaflet).toBe('player');
  });

  it('into the house by the window, and up to the attic for the rope', () => {
    const { state, text } = play(['n', 'e', 'open window', 'w', 'w', 'take lamp', 'turn on lamp', 'e', 'u', 'take rope', 'd']);
    expect(text).toContain('With great effort, you open the window far enough to allow entry.');
    expect(state.locations.lamp).toBe('player');
    expect(state.locations.rope).toBe('player');
    expect(state.currentRoom).toBe('kitchen');
  });

  it('moving the rug reveals the trap door, which opens onto the stairs down', () => {
    const { text } = play(['n', 'e', 'open window', 'w', 'w', 'move rug', 'open trap door', 'd']);
    expect(text).toContain('With a great effort, the rug is moved to one side of the room, revealing the dusty cover of a closed trap door.');
    expect(text).toContain('The door reluctantly opens to reveal a rickety staircase descending into darkness.');
    expect(text).toContain('It is pitch black. You are likely to be eaten by a grue.'); // no lamp lit
  });

  it('the egg up the tree scores', () => {
    const { state, text } = play(['n', 'n', 'u', 'take egg', 'score']);
    expect(state.locations.egg).toBe('player');
    expect(text).toContain('Your score is 5 (total of 350 points)');
  });

  it('moving the leaves reveals the grating', () => {
    const { text } = play(['n', 'n', 'n', 'move leaves', 'look']);
    expect(text).toContain('In disturbing the pile of leaves, a grating is revealed.');
    expect(text).toContain('There is a grating securely fastened into the ground.');
  });

  it('down the trap door with a light: it slams shut behind you, and the cellar scores', () => {
    const { state, text } = play(['n', 'e', 'open window', 'w', 'w', 'take lamp', 'turn on lamp', 'move rug', 'open trap door', 'd']);
    expect(text).toContain('The trap door crashes shut, and you hear someone barring it.');
    expect(text).toContain('You are in a dark and damp cellar');
    expect(state.currentRoom).toBe('cellar');
    expect(state.flags.cellar_visited).toBe(true);
    expect(play(['n', 'e', 'open window', 'w', 'w', 'take lamp', 'turn on lamp', 'move rug', 'open trap door', 'd', 'open trap door']).text).toContain(
      'The door is locked from above.',
    );
  });

  it('without light the cellar is pitch black', () => {
    const { text } = play(['n', 'e', 'open window', 'w', 'w', 'move rug', 'open trap door', 'd']);
    expect(text).toContain('It is pitch black. You are likely to be eaten by a grue.');
  });

  it('the painting, the chimney, the trophy case', () => {
    const { state, text } = play([
      'n', 'e', 'open window', 'w', 'w', 'take lamp', 'turn on lamp', 'move rug', 'open trap door', 'd',
      's', 'e', 'take painting', 'n', 'u', 'w', 'open case', 'put painting in case', 'score',
    ]);
    expect(state.currentRoom).toBe('living_room');
    expect(state.locations.painting).toBe('trophy_case');
    // kitchen 10 + cellar 25 + painting 4 + painting in the case 6
    expect(text).toContain('Your score is 45 (total of 350 points)');
  });

  it('the chimney refuses a full load, and empty hands', () => {
    const { state, text } = play([
      'n', 'e', 'open window', 'w', 'take sack', 'take bottle', 'w', 'take lamp', 'turn on lamp', 'move rug', 'open trap door', 'd',
      's', 'e', 'take painting', 'n', 'u',
    ]);
    expect(text).toContain('You can’t get up there with what you’re carrying.');
    expect(state.currentRoom).toBe('studio');
  });

  it('the lamp burns down, warns, and dies', () => {
    const { state } = play(['n', 'e', 'open window', 'w', 'w', 'take lamp', 'turn on lamp']);
    let text = '';
    for (let i = 0; i < 200 && !state.flags.lamp_dead; i++) {
      text += execute({ action: 'wait' }, { world: zork1, state }).lines.join('\n') + '\n';
    }
    expect(text).toContain('The lamp appears a bit dimmer.');
    expect(text).toContain('The lamp is definitely dimmer now.');
    expect(text).toContain('The lamp is nearly out.');
    expect(state.flags.lamp_dead).toBe(true);
    expect(state.itemState.lamp.on).toBe(false);
    expect(execute({ action: 'turn_on', target: 'lamp' }, { world: zork1, state }).lines).toEqual(['A burned-out lamp won’t light.']);
  });

  it('the grue: blundering about in the dark is usually fatal, and the lamp goes home', () => {
    const { state } = play(['n', 'e', 'open window', 'w', 'w', 'take lamp', 'move rug', 'open trap door', 'd']);
    state.rng = 1;
    let text = '';
    for (let i = 0; i < 10 && state.currentRoom === 'cellar'; i++) {
      text += execute({ action: 'go', target: 'east' }, { world: zork1, state }).lines.join('\n');
    }
    expect(text).toContain('Oh, no! You have walked into the slavering fangs of a lurking grue!');
    expect(text).toContain('****  You have died  ****');
    expect(state.currentRoom).toBe('forest_1');
    expect(state.locations.lamp).toBe('living_room');
  });

  it('no world verb clashes with a built-in', () => {
    expect(verbClashes(zork1.verbs)).toEqual([]);
  });

  it('every exit leads somewhere real', () => {
    for (const [id, room] of Object.entries(zork1.rooms)) {
      for (const [label, exit] of Object.entries(room.exits)) {
        const to = typeof exit === 'string' ? exit : exit.to;
        if (to) expect(zork1.rooms[to], `${id} → ${label}`).toBeDefined();
      }
    }
  });
});

describe('Zork I, natively: the troll', () => {
  /** In the cellar with the lamp lit and the sword in hand, seeded. */
  function cellar(seed = 1) {
    const state = initialState(zork1);
    state.currentRoom = 'cellar';
    state.locations.lamp = 'player';
    state.locations.sword = 'player';
    state.itemState.lamp = { on: true, moved: true };
    state.itemState.sword = { moved: true };
    state.rng = seed;
    const run = (c: string) => execute(fallbackParse(c, zork1.verbs) ?? { action: 'unknown' }, { world: zork1, state }).lines;
    return { state, run };
  }

  it('the sword glows near the troll, brightly beside him', () => {
    const { run } = cellar();
    expect(run('look')).toContain('Your sword is glowing with a faint blue glow.');
    expect(run('north')).toContain('Your sword has begun to glow very brightly.');
  });

  it('the troll blocks east and west while he’s awake', () => {
    const { state, run } = cellar();
    run('north');
    state.npcs = { troll: { fighting: false } };
    expect(run('east')[0]).toBe('The troll fends you off with a menacing gesture.');
    expect(run('west')[0]).toBe('The troll fends you off with a menacing gesture.');
  });

  it('a fight the troll can lose: the fog, the axe on the floor, the way east open', () => {
    expect(cellar().run('north').join('\n')).toContain('A nasty-looking troll, brandishing a bloody axe, blocks all passages out of the room.');
    let won = false;
    for (let seed = 1; seed < 400 && !won; seed++) {
      const { state, run } = cellar(seed);
      run('north');
      if (state.currentRoom !== 'troll_room') continue;
      // Zork's parser picks the one weapon you hold.
      expect(run('kill troll')[0]).toBe('(with the sword)');
      for (let i = 0; i < 20 && state.currentRoom === 'troll_room'; i++) {
        const lines = run('kill troll with sword');
        if (lines.some((l) => l.startsWith('Almost as soon as the troll breathes his last breath'))) {
          won = true;
          expect(state.locations.axe).toBe('troll_room');
          expect(run('east')[0]).toBe('📍 East-West Passage');
          expect(run('look').join('\n')).toContain('narrow east-west passageway');
          break;
        }
      }
    }
    expect(won).toBe(true);
  });

  it('the East-West Passage is worth 5 points, once', () => {
    const { state, run } = cellar();
    state.currentRoom = 'troll_room';
    state.npcs = { troll: { strength: 0 } };
    const before = currentScore(zork1, state);
    run('east');
    run('west');
    run('east');
    expect(currentScore(zork1, state) - before).toBe(5);
  });

  it('throwing and giving things to the troll', () => {
    const { state, run } = cellar(2);
    run('north');
    state.locations.lunch = 'player';
    state.npcs = { troll: { fighting: false } };
    expect(run('give lunch to troll')[0]).toBe('The troll, who is not overly proud, graciously accepts the gift and not having the most discriminating tastes, gleefully eats it.');
    expect(state.locations.lunch).toBe(null);
    const outcomes = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const t = cellar(seed);
      t.run('north');
      t.state.npcs = { troll: { fighting: false } };
      outcomes.add(t.run('throw sword at troll')[0].replace(/^The troll, who is remarkably coordinated, catches the sword/, ''));
    }
    expect([...outcomes]).toEqual(
      expect.arrayContaining([
        ' and eats it hungrily. Poor troll, he dies from an internal hemorrhage and his carcass disappears in a sinister black fog.',
        ' and, being for the moment sated, throws it back. Fortunately, the troll has poor control, and the sword falls to the floor. He does not look pleased.',
      ]),
    );
  });

  it('spits, laughs, and has nothing to say', () => {
    const { state, run } = cellar();
    run('north');
    state.npcs = { troll: { fighting: false } };
    expect(run('take troll')[0]).toBe('The troll spits in your face, grunting “Better luck next time” in a rather barbarous accent.');
    expect(run('smash troll')[0]).toBe('The troll laughs at your puny gesture.');
    expect(run('talk to troll')[0]).toBe('The troll isn’t much of a conversationalist.');
  });

  it('carries Zork’s weights: the sword and the egg are too much together', () => {
    const { state, run } = cellar();
    state.currentRoom = 'up_a_tree';
    for (const id of ['sack', 'bottle', 'rope', 'knife']) state.locations[id] = 'player';
    expect(run('take egg')[0]).toBe('Your load is too heavy.');
  });

  it('DIAGNOSE is built in now', () => {
    const { run } = cellar();
    // (The sword's glow follows: the troll is next door.)
    expect(run('diagnose').slice(0, 2)).toEqual(['You are in perfect health.', 'You can be killed by a serious wound.']);
  });

  it('the troll’s death doesn’t take the axe out of your hands', () => {
    const { state, run } = cellar(3);
    run('north');
    state.locations.axe = 'player';
    state.npcs = { troll: { fighting: true } };
    run('kill troll with sword');
    expect(state.locations.axe).toBe('player');
  });

  it('dying un-bars the trap door, as Zork’s JIGS-UP does', async () => {
    const { runSteps } = await import('@/engine/effects');
    const { state } = cellar();
    state.flags.trap_door_barred = true;
    runSteps([{ die: 'Oops.' }], zork1, state);
    expect(state.flags.trap_door_barred).toBeFalsy();
  });
});

describe('Zork I, natively: the maze and the cyclops’s rooms', () => {
  function at(room: string, seed = 1) {
    const state = initialState(zork1);
    state.currentRoom = room;
    state.locations.lamp = 'player';
    state.itemState.lamp = { on: true, moved: true };
    state.rng = seed;
    const run = (c: string) => execute(fallbackParse(c, zork1.verbs) ?? { action: 'unknown' }, { world: zork1, state }).lines;
    return { state, run };
  }

  it('the maze goes where the ZIL says', () => {
    expect(zork1.rooms.maze_1.exits).toMatchObject({ east: 'troll_room', north: 'maze_1', south: 'maze_2', west: 'maze_4' });
    expect(zork1.rooms.maze_15.exits).toMatchObject({ west: 'maze_14', south: 'maze_7', southeast: 'cyclops_room' });
    expect(zork1.rooms.dead_end_1.exits).toMatchObject({ south: 'maze_4' });
    expect(zork1.rooms.maze_1.tags).toContain('maze');
  });

  it('a one-way drop warns you first', () => {
    const { state, run } = at('maze_2');
    const lines = run('down');
    expect(lines[0]).toBe('You won’t be able to get back up to the tunnel you are going through when it gets to the next room.');
    expect(state.currentRoom).toBe('maze_4');
  });

  it('the skeleton, the lantern, the knife, the key and the coins lie in MAZE-5', () => {
    for (const id of ['bones', 'burned_out_lantern', 'rusty_knife', 'keys', 'bag_of_coins']) expect(initialState(zork1).locations[id]).toBe('maze_5');
    expect(zork1.items.bag_of_coins.treasure).toBe(5);
    expect(zork1.items.rusty_knife.weapon).toBe(true);
  });

  it('the grating unlocks from below with the skeleton key, opens to daylight, and drops the leaves', () => {
    const { state, run } = at('grating_room');
    state.locations.keys = 'player';
    expect(run('open grating')[0]).toBe('The grating is locked.');
    expect(run('unlock grating with key')[0]).toBe('The grate is unlocked.');
    const lines = run('open grating');
    expect(lines[0]).toBe('The grating opens to reveal trees above you.');
    expect(lines).toContain('A pile of leaves falls onto your head and to the ground.');
    expect(run('up')[0]).toBe('📍 Clearing');
  });

  it('from above, the lock is out of reach', () => {
    const { state, run } = at('grating_clearing');
    state.flags.grate_revealed = true;
    state.locations.keys = 'player';
    expect(run('unlock grating with key')[0]).toBe('You can’t reach the lock from here.');
  });

  it('the Treasure Room is worth 25 points, once', () => {
    const { state, run } = at('cyclops_room');
    state.flags.cyclops_asleep = true;
    const before = currentScore(zork1, state);
    run('up');
    run('down');
    run('up');
    expect(currentScore(zork1, state) - before).toBe(25);
  });

  it('the Strange Passage leads east into the living room', () => {
    expect(zork1.rooms.strange_passage.exits).toMatchObject({ west: 'cyclops_room', east: 'living_room' });
  });

  it('touching the skeleton brings the ghost, who curses your valuables away', () => {
    const { state, run } = at('maze_5');
    state.locations.painting = 'player';
    expect(run('take skeleton')[0]).toMatch(/^A ghost appears in the room and is appalled/);
    expect(state.locations.painting).toBe(null);
    expect(state.locations.bag_of_coins).toBe(null);
  });
});

describe('Zork I, natively: the cyclops', () => {
  function room(seed = 1) {
    const state = initialState(zork1);
    state.currentRoom = 'maze_15';
    state.locations.lamp = 'player';
    state.itemState.lamp = { on: true, moved: true };
    state.rng = seed;
    const run = (c: string) => execute(fallbackParse(c, zork1.verbs) ?? { action: 'unknown' }, { world: zork1, state }).lines;
    return { state, run };
  }
  const BLOCKS = 'A cyclops, who looks prepared to eat horses (much less mere adventurers), blocks the staircase. From his state of health, and the bloodstains on the walls, you gather that he is not very friendly, though he likes people.';

  it('stands at the foot of the stairs, blocking them', () => {
    const { run } = room();
    const lines = run('southeast');
    expect(lines.join(' ')).toContain(BLOCKS);
    expect(run('up')[0]).toBe('The cyclops doesn’t look like he’ll let you past.');
    expect(run('east')[0]).toBe('The east wall is solid rock.');
  });

  it('provoked, he grows angrier each turn, then eats you', () => {
    const { state, run } = room();
    run('southeast');
    state.locations.knife = 'player';
    expect(run('throw knife at cyclops')).toContain('The cyclops shrugs but otherwise ignores your pitiful attempt.');
    const said: string[] = [];
    for (let i = 0; i < 6; i++) said.push(...run('wait'));
    expect(said).toContain('The cyclops appears to be getting more agitated.');
    expect(said).toContain('You have two choices: 1. Leave  2. Become dinner.');
    expect(said.join(' ')).toContain('The cyclops, tired of all of your games and trickery, grabs you firmly.');
  });

  it('the lunch, then the water, puts him to sleep and opens the stairs', () => {
    const { state, run } = room();
    run('southeast');
    state.locations.lunch = 'player';
    state.locations.bottle = 'player';
    expect(run('give water to cyclops')[0]).toBe('The cyclops apparently is not thirsty and refuses your generous offer.');
    expect(run('give lunch to cyclops')[0]).toMatch(/^The cyclops says “Mmm Mmm. I love hot peppers!/);
    expect(run('give water to cyclops')[0]).toMatch(/^The cyclops takes the bottle, checks that it’s open, and drinks the water./);
    expect(run('look').join(' ')).toContain('The cyclops is sleeping blissfully at the foot of the stairs.');
    // Up the stairs: the thief rushes to defend his lair.
    expect(run('up')).toContain('📍 Treasure Room');
  });

  it('refuses garlic and anything else', () => {
    const { state, run } = room();
    run('southeast');
    state.locations.garlic = 'player';
    state.locations.leaflet = 'player';
    expect(run('give garlic to cyclops')[0]).toBe('The cyclops may be hungry, but there is a limit.');
    expect(run('give leaflet to cyclops')[0]).toBe('The cyclops is not so stupid as to eat THAT!');
  });

  it('ULYSSES drives him off through the east wall', () => {
    const { run } = room();
    run('southeast');
    expect(run('ulysses')[0]).toBe('The cyclops, hearing the name of his father’s deadly nemesis, flees the room by knocking down the wall on the east of the room.');
    expect(run('look').join(' ')).toContain('The east wall, previously solid, now has a cyclops-sized opening in it.');
    expect(run('east')[0]).toBe('📍 Strange Passage');
    expect(run('ulysses')[0]).toBe('Wasn’t he a sailor?');
  });

  it('won’t talk, won’t be grabbed, and his stomach rumbles', () => {
    const { run } = room();
    run('southeast');
    expect(run('cyclops, go away')[0]).toBe('The cyclops prefers eating to making conversation.');
    expect(run('take cyclops')[0]).toBe('The cyclops doesn’t take kindly to being grabbed.');
    expect(run('listen to cyclops')[0]).toBe('You can hear his stomach rumbling.');
    expect(run('examine cyclops')[0]).toBe('A hungry cyclops is standing at the foot of the stairs.');
  });
});


describe('Zork I, natively: the temple and Hades (5a)', () => {
  const at = (room: string, seed: number, setup?: (s: ReturnType<typeof initialState>) => void) => {
    const state = initialState(zork1);
    state.currentRoom = room;
    state.rng = seed;
    setup?.(state);
    const run = (c: string) => execute(fallbackParse(c, zork1.verbs) ?? { action: 'unknown' }, { world: zork1, state }).lines;
    return { state, run };
  };
  it('the tiny cave blows lit candles out half the time, far less once your luck is gone', () => {
    const blown = (unlucky: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const { run } = at('tiny_cave', seed, (s) => {
          s.locations.candles = 'player';
          s.itemState.candles = { on: true, moved: true };
          s.flags.candles_touched = true;
          if (unlucky) s.flags.unlucky = true;
          s.npcs = { thief: { room: null } };
        });
        if (run('look').some((l) => l.includes('A gust of wind blows out your candles!'))) n++;
      }
      return n / 400;
    };
    const lucky = blown(false);
    const unlucky = blown(true);
    expect(lucky).toBeGreaterThan(0.4);
    expect(lucky).toBeLessThan(0.6);
    expect(unlucky).toBeGreaterThan(0.1);
    expect(unlucky).toBeLessThan(0.23);
  });
  it('dying while dead ends the game, in Zork’s words', () => {
    const { state } = at('entrance_to_hades', 1, (s) => {
      s.flags.dead = true;
    });
    const lines = runSteps([{ die: 'Anything.' }], zork1, state);
    expect(lines.join(' ')).toMatch(/It takes a talented person to be killed while already dead/);
    expect(lines.join(' ')).not.toMatch(/Anything\./);
    expect(state.gameOver).toBe(true);
  });
});

describe('Zork I, natively: 5a’s treasures score as the ZIL says', () => {
  // VALUE on finding, TVALUE in the trophy case (1dungeon.zil).
  const TREASURES: Array<[string, number, number]> = [
    ['bar', 10, 5],
    ['trunk', 15, 5],
    ['trident', 4, 11],
    ['skull', 10, 10],
    ['coffin', 10, 15],
    ['sceptre', 4, 6],
    ['torch', 14, 6],
  ];
  it.each(TREASURES)('%s: %i for taking, %i in the case', (id, value, tvalue) => {
    const state = initialState(zork1);
    const room = zork1.rooms.living_room ? 'living_room' : state.currentRoom;
    state.currentRoom = room;
    state.locations[id] = room;
    state.itemState[id] = { ...state.itemState[id], hidden: false };
    state.flags.unsacred_bar = true;
    const before = currentScore(zork1, state);
    execute({ action: 'take', target: id, byId: true }, { world: zork1, state });
    expect(currentScore(zork1, state) - before).toBe(value);
    state.itemState.trophy_case = { ...state.itemState.trophy_case, open: true };
    state.locations[id] = 'trophy_case';
    expect(currentScore(zork1, state) - before).toBe(value + tvalue);
  });
});

describe('Zork I, natively: a spirit can’t take things, however asked (5a review)', () => {
  const ghost = () => {
    const state = initialState(zork1);
    state.currentRoom = 'land_of_living_dead';
    state.flags.dead = true;
    state.npcs = { thief: { room: null } };
    return state;
  };
  it.each(['take all', 'take everything', 'get carved skull', 'take skull'])('“%s”', (line) => {
    const state = ghost();
    const lines = captureLine(zork1, state, line)?.lines ?? execute(fallbackParse(line, zork1.verbs)!, { world: zork1, state }).lines;
    expect(lines.join(' ')).toMatch(/Your hand passes through its object/);
    expect(state.locations.skull).toBe('land_of_living_dead');
  });
  it('the intent server’s reading, or AGAIN, goes through the spirit’s limits too', () => {
    const state = ghost();
    expect(execute({ action: 'take', target: 'skull', byId: true }, { world: zork1, state }).lines).toEqual(['Your hand passes through its object.']);
    expect(state.locations.skull).toBe('land_of_living_dead');
  });
});

describe('Zork I, natively: the grue in a dark move (5b)', () => {
  it('kills about 80% of the time, moving unlit between dark rooms', () => {
    let killed = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const state = initialState(zork1);
      state.currentRoom = 'maze_1';
      state.rng = seed;
      state.npcs = { thief: { room: null } };
      const lines = execute({ action: 'go', target: 'south' }, { world: zork1, state }).lines.join(' ');
      if (lines.includes('Oh, no! A lurking grue slithered into the room and devoured you!')) killed++;
    }
    expect(killed / 400).toBeGreaterThan(0.74);
    expect(killed / 400).toBeLessThan(0.86);
  });
});

describe('Zork I, natively: 5b’s treasures, the thief and the boat (5b)', () => {
  it('scores the scarab and the pot of gold for taking, the emerald for opening the buoy, and each in the case', () => {
    const state = initialState(zork1);
    state.currentRoom = 'living_room';
    state.npcs = { thief: { room: null } };
    const score = () => currentScore(zork1, state);
    for (const [id, value, tvalue] of [['scarab', 5, 5], ['pot_of_gold', 10, 10]] as const) {
      state.locations[id] = 'living_room';
      state.itemState[id] = { hidden: false };
      const before = score();
      execute({ action: 'take', target: id, byId: true }, { world: zork1, state });
      expect(score() - before).toBe(value);
      state.itemState.trophy_case = { ...state.itemState.trophy_case, open: true };
      state.locations[id] = 'trophy_case';
      expect(score() - before).toBe(value + tvalue);
    }
    state.locations.buoy = 'player';
    const before = score();
    execute({ action: 'open', target: 'buoy', byId: true }, { world: zork1, state });
    expect(score() - before).toBe(5);
    state.locations.emerald = 'trophy_case';
    expect(score() - before).toBe(15);
  });
  it('the thief keeps off the water', () => {
    const state = initialState(zork1);
    state.currentRoom = 'living_room';
    state.npcs = { thief: { room: 'reservoir_north', hidden: true } };
    const visited = new Set<string>();
    for (let i = 0; i < 300; i++) {
      execute({ action: 'look' }, { world: zork1, state });
      const at = Object.keys(zork1.rooms).find((r) => state.npcs?.thief?.room === r);
      if (at) visited.add(at);
    }
    for (const r of ['in_stream', 'reservoir', 'river_1', 'river_2', 'river_3', 'river_4', 'river_5']) expect(visited.has(r)).toBe(false);
  });
  it('the maintenance flood carries a boat at the dam over the falls', () => {
    const state = initialState(zork1);
    state.currentRoom = 'dam_room';
    state.locations.inflated_boat = 'dam_room';
    state.aboard = 'inflated_boat';
    state.flags.leaking = true;
    state.vars = { ...state.vars, water_level: 5 };
    state.npcs = { thief: { room: null } };
    const lines = execute({ action: 'look' }, { world: zork1, state }).lines.join(' ');
    expect(lines).toMatch(/The rising water carries the boat over the dam, down the river, and over the falls\. Tsk, tsk\./);
  });
});
