import { describe, expect, it } from 'vitest';
import { execute, initialState } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { statusText } from '@/engine/verbs/meta';
import type { GameState } from '@/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (s: GameState, input: string) => execute(fallbackParse(input, world.verbs)!, { world, state: s });

describe('moves, the status line, SCRIPT and VERSION', () => {
  it('counts every acted-on turn as a move, not room entries', () => {
    const s = stateWith(world, { room: 'living' });
    run(s, 'look');
    run(s, 'look');
    expect(s.moveCount).toBe(2);
    run(s, 'take zeppelin');
    expect(s.moveCount).toBe(2);
  });

  it('shows Zork’s status line in Infocom style, MOVES in brass', () => {
    const infocom = { ...world, style: 'infocom' as const };
    expect(statusText(infocom, initialState(infocom))).toBe(`${world.rooms[world.startRoom].name}  Score: 0  Moves: 0`);
    const s = stateWith(world, { room: 'living' });
    run(s, 'look');
    expect(statusText(world, s)).toBe('MOVES: 1');
    expect(statusText({ ...world, statusLine: 'score' }, s)).toBe('SCORE: 0  MOVES: 1');
  });

  it('SCRIPT starts and stops a transcript, and VERSION asks for the version lines', () => {
    const s = stateWith(world, { room: 'living' });
    expect(run(s, 'script')).toMatchObject({ script: 'start', free: true });
    expect(run(s, 'unscript')).toMatchObject({ script: 'stop', free: true });
    expect(run(s, 'version')).toMatchObject({ version: true, free: true });
    expect(s.moveCount).toBe(0);
  });
});

describe('HELP’s columns (fast follow)', () => {
  it('the vehicle line lines its text up at column 25 with the others', async () => {
    const { fixtureWorld } = await import('../fixtures/world');
    const { stateWith } = await import('../helpers/state');
    const { execute } = await import('@/engine/engine');
    const lines = execute({ action: 'help' }, { world: fixtureWorld, state: stateWith(fixtureWorld, { room: 'bedroom' }) }).lines;
    const vehicle = lines.find((l) => l.startsWith('BOARD'))!;
    expect(vehicle.indexOf('Get in')).toBe(25);
  });
});
