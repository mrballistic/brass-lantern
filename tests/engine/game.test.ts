import { describe, expect, it } from 'vitest';
import { createGame } from '@/engine/game';
import { auditWorld } from '@/engine/audit';
import { tutorial } from '@/worlds/tutorial';
import { zork1 } from '@/worlds/zork1';
import type { Effect, World } from '@/types/world';
import { fixtureWorld } from '../fixtures/world';

describe('createGame', () => {
  it('opens with its opening lines and plays the tutorial to the best ending', () => {
    const game = createGame(tutorial, { seed: 1 });
    expect(game.opening.length).toBeGreaterThan(0);
    let reply = game.send('open drawer');
    for (const c of ['take stapler', 'north', 'take mug and give mug to gary', 'talk to gary', 'north', 'smash machine with stapler']) {
      reply = game.send(c);
    }
    expect(reply.gameOver).toBe(true);
    expect(game.state.gameOver).toBe(true);
    expect(reply.lines.join('\n')).toContain('[Rank: Lunch Liberator]');
  });

  it('runs both halves of a compound line', () => {
    const game = createGame(tutorial, { seed: 1 });
    game.send('open drawer');
    const reply = game.send('take stapler. look');
    expect(reply.lines.length).toBeGreaterThan(1);
    expect(reply.lines.join('\n')).toMatch(/stapler/i);
    expect(reply.lines.some((l) => l.startsWith('📍'))).toBe(true);
  });

  it('repeats the last command on AGAIN', () => {
    const game = createGame(tutorial, { seed: 1 });
    const first = game.send('look');
    expect(game.send('again').lines).toEqual(first.lines);
  });

  it('asks a question and takes the next line as its answer', () => {
    const game = createGame(fixtureWorld, { seed: 1 });
    game.state.currentRoom = 'living';
    const asked = game.send('take key');
    expect(asked.question).toBe('Which do you mean: the brass key or the rusty key?');
    const answered = game.send('rusty');
    expect(answered.question).toBeUndefined();
    expect(game.state.locations.rusty_key).toBe('player');
  });
});

describe('auditWorld', () => {
  it('finds nothing wrong with Zork I or the tutorial', () => {
    expect(auditWorld(zork1)).toEqual([]);
    expect(auditWorld(tutorial)).toEqual([]);
  });

  it('reports a broken world', () => {
    const broken: World = {
      ...fixtureWorld,
      events: { ...fixtureWorld.events, bad: [{ teleport: 'x' } as unknown as Effect] },
    };
    expect(auditWorld(broken).length).toBeGreaterThan(0);
  });
});
