import { describe, expect, it } from 'vitest';
import { execute, initialState } from '../../src/engine/engine';
import { fallbackParse } from '../../src/engine/parser';
import { scoreLines, statusText } from '../../src/engine/verbs/meta';
import type { GameState } from '../../src/types/game';
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
    const { execute } = await import('../../src/engine/engine');
    const lines = execute({ action: 'help' }, { world: fixtureWorld, state: stateWith(fixtureWorld, { room: 'bedroom' }) }).lines;
    const vehicle = lines.find((l) => l.startsWith('BOARD'))!;
    expect(vehicle.indexOf('Get in')).toBe(25);
  });
});

describe('world-set SCORE text', () => {
  const scored = { ...world, scoring: [{ if: 'flag:paid', points: 5 }], maxScore: 10, ranks: [{ min: 0, title: 'Beginner' }] };
  const infocom = { ...scored, style: 'infocom' as const };
  const score = (w: typeof scored) => {
    const s = stateWith(w, { room: 'living' });
    s.turns = 1;
    return scoreLines(w, s);
  };
  it('prints today’s lines without templates', () => {
    expect(score(infocom)).toEqual(['Your score is 0 (total of 10 points), in 1 move.', 'This gives you the rank of Beginner.']);
  });
  it('prints the world’s own lines with them', () => {
    const w = { ...infocom, scoreLine: 'Your score would be {score} (total of {max} points), in {moves}.', rankLine: 'This score gives you the rank of {rank}.' };
    expect(score(w)).toEqual(['Your score would be 0 (total of 10 points), in 1 move.', 'This score gives you the rank of Beginner.']);
    expect(score({ ...infocom, scoreLine: 'Your potential is {score} of a possible {max}, in {moves}.' })).toEqual([
      'Your potential is 0 of a possible 10, in 1 move.',
      'This gives you the rank of Beginner.',
    ]);
  });
  it('applies to brass style too', () => {
    expect(score({ ...scored, scoreLine: '{score}/{max} in {moves}' })[0]).toBe('0/10 in 0 moves');
  });
});

describe('world-set DIAGNOSE text', () => {
  it('a world’s healthy and wounded lines replace the defaults', () => {
    const w = { ...world, diagnose: { healthy: 'You feel fine.', wounded: 'You ache.' } };
    const s = stateWith(w, { room: 'living' });
    expect(run2(s, w)).toEqual(['[You feel fine.]']);
    s.player = { wounds: 1, cureIn: 5 };
    expect(run2(s, w)).toEqual(['[You ache.]']);
    expect(run2(stateWith(world, { room: 'living' }), world)).toEqual(['[You are in perfect health.]']);
  });
});
const run2 = (s: GameState, w: typeof world) => execute({ action: 'diagnose' }, { world: w, state: s }).lines;
