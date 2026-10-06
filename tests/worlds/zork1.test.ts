import { describe, expect, it } from 'vitest';
import { execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse, splitCommands, verbClashes } from '@/engine/parser';
import { statusText } from '@/engine/verbs/meta';
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
