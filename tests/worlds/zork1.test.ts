import { describe, expect, it } from 'vitest';
import { execute, initialState, openingLines } from '@/engine/engine';
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

  it('bare hands, then a fight the troll can lose: the fog, the axe on the floor, the way east open', () => {
    expect(cellar().run('north').join('\n')).toContain('A nasty-looking troll, brandishing a bloody axe, blocks all passages out of the room.');
    let won = false;
    for (let seed = 1; seed < 400 && !won; seed++) {
      const { state, run } = cellar(seed);
      run('north');
      if (state.currentRoom !== 'troll_room') continue;
      expect(run('kill troll')[0]).toBe('Trying to attack a troll with your bare hands is suicidal.');
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
});
