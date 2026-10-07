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
    expect(asked.lines).toEqual(['Which do you mean: the brass key or the rusty key?']);
    expect(asked.awaiting).toBe(true);
    const answered = game.send('rusty');
    expect(answered.awaiting).toBe(false);
    expect(game.state.locations.rusty_key).toBe('player');
  });
});

describe('the line loop', () => {
  const bellRoom = Object.keys(fixtureWorld.rooms).find((r) => fixtureWorld.rooms[r].items?.includes('bell'))!;
  function game(ring: Effect[], extra: Partial<World> = {}) {
    const w: World = {
      ...fixtureWorld,
      items: { ...fixtureWorld.items, bell: { ...fixtureWorld.items.bell, instead: { ring: [{ then: 'ring_evt' }] } } },
      events: { ...fixtureWorld.events, ring_evt: ring },
      ...extra,
    };
    const g = createGame(w, { seed: 1 });
    g.state.currentRoom = bellRoom;
    return g;
  }

  it('a question stops the line, which stays awaiting', () => {
    const g = createGame(fixtureWorld, { seed: 1 });
    g.state.currentRoom = 'living';
    const reply = g.send('take key. look');
    expect(reply.lines).toEqual(['Which do you mean: the brass key or the rusty key?']);
    expect(reply.awaiting).toBe(true);
  });

  it('a game that ends on the first piece drops the rest', () => {
    const g = game(['Dong.', { end: 'over' }], { endings: { over: { lines: ['It is over.'] } } });
    const reply = g.send('ring bell. look');
    expect(reply.lines).toEqual(['Dong.', 'It is over.']);
    expect(reply.gameOver).toBe(true);
  });

  it('stopLine: true drops the rest silently', () => {
    const reply = game(['Dong.', { stopLine: true }]).send('ring bell. look');
    expect(reply.lines).toEqual(['Dong.']);
  });

  it('stopLine with a message prints it only when pieces remain', () => {
    const g = game(['Dong.', { stopLine: 'Silence falls.' }]);
    expect(g.send('ring bell. look').lines).toEqual(['Dong.', 'Silence falls.']);
    expect(g.send('ring bell').lines).not.toContain('Silence falls.');
  });

  it('a capture ends the line', () => {
    const w: World = {
      ...fixtureWorld,
      capture: { script: 'grab' },
      scripts: { ...fixtureWorld.scripts, grab: (ctx) => (ctx.line === 'ring bell' ? ['Captured.', { free: true }] : undefined) },
    };
    const g = createGame(w, { seed: 1 });
    expect(g.send('ring bell. look').lines).toEqual(['Captured.']);
  });

  it('a script that throws rolls back, says so, and leaves the game playable', () => {
    const g = game([{ set: 'rung' }, { script: 'boom' }], {
      scripts: {
        ...fixtureWorld.scripts,
        boom: () => {
          throw new Error('boom');
        },
      },
    });
    const before = JSON.stringify(g.state);
    const reply = g.send('ring bell. look');
    expect(reply.lines).toEqual(['[Something went wrong with that command. Nothing changed.]']);
    expect(reply.awaiting).toBe(false);
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.send('look').lines.length).toBeGreaterThan(0);
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
