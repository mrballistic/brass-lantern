import { describe, expect, it } from 'vitest';
import { execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse, splitCommands, verbClashes } from '@/engine/parser';
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

  it('moving the rug reveals the trap door, which opens onto unbuilt stairs', () => {
    const { text } = play(['n', 'e', 'open window', 'w', 'w', 'move rug', 'open trap door', 'd']);
    expect(text).toContain('With a great effort, the rug is moved to one side of the room, revealing the dusty cover of a closed trap door.');
    expect(text).toContain('The door reluctantly opens to reveal a rickety staircase descending into darkness.');
    expect(text).toContain('The rest of the Great Underground Empire isn’t built yet.');
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
