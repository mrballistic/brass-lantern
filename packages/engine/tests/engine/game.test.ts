import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { execute, initialState } from '../../src/engine/engine';
import { ENGINE_VERSION } from '../../src/version';
import { createGame } from '../../src/engine/game';
import { auditWorld } from '../../src/engine/audit';
import { tutorial } from '../../src/worlds/tutorial';
import { zork1 } from '../../src/worlds/zork1';
import type { Effect, World } from '../../src/types/world';
import { fixtureWorld } from '../fixtures/world';

describe('createGame', () => {
  it('a name that contains “and” stays whole in a command', () => {
    const world: World = {
      ...fixtureWorld,
      rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, items: ['alarm', 'bed', 'lost_and_found'] } },
      items: {
        ...fixtureWorld.items,
        lost_and_found: { name: 'lost and found box', aliases: ['lost and found'], description: 'A box.', portable: false, tags: [], container: {}, contains: ['flair'] },
        flair: { name: 'flair', description: 'Piece of flair.', portable: true, tags: [] },
      },
    };
    const game = createGame(world, { seed: 1 });
    const reply = game.send('take flair from lost and found');
    expect(game.state.locations.flair).toBe('player');
    expect(reply.lines).toHaveLength(1);
    expect(reply.lines.join(' ')).not.toMatch(/can’t|don’t|not/i);
  });

  describe('hosted commands inside a compound line', () => {
    const room = (g: ReturnType<typeof createGame>) => g.state.currentRoom;

    it('“<move> then undo” undoes exactly that move, and a second undo goes back one more line', () => {
      const game = createGame(tutorial, { seed: 1 });
      const start = room(game);
      game.send('open drawer');
      game.send('north');
      const hallway = room(game);
      expect(hallway).not.toBe(start);
      game.send('south then undo');
      expect(room(game)).toBe(hallway);
      game.send('undo');
      expect(room(game)).toBe(start);
      expect(game.send('undo').lines).toEqual(['[Previous turn undone.]']);
      expect(game.send('undo').lines).toEqual(['[Nothing to undo.]']);
    });

    it('“<move> then restart” leaves nothing to undo', () => {
      const game = createGame(tutorial, { seed: 1 });
      game.send('open drawer');
      game.send('north');
      game.send('south then restart');
      const after = structuredClone(game.state);
      expect(game.send('undo').lines).toEqual(['[Nothing to undo.]']);
      expect(game.state).toEqual(after);
    });
  });

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

describe('createGame: the commands a UI would handle', () => {
  const winning = ['open drawer', 'take stapler', 'north', 'take mug and give mug to gary', 'talk to gary', 'north', 'smash machine with stapler'];

  it('RESTART starts over: fresh state, the opening lines, the same seed', () => {
    const game = createGame(tutorial, { seed: 7 });
    game.send('open drawer');
    game.send('take stapler');
    const reply = game.send('restart');
    expect(reply.lines).toEqual(game.opening);
    expect(reply).toMatchObject({ gameOver: false, awaiting: false });
    expect(game.state.moveCount).toBe(0);
    expect(game.state.locations.stapler).not.toBe('player');
    expect(game.state.rng).toBe(7);
    expect(game.state).toEqual(createGame(tutorial, { seed: 7 }).state);
  });

  it('RESTART is the way out once the game has ended', () => {
    const game = createGame(tutorial, { seed: 1 });
    for (const c of winning) game.send(c);
    expect(game.state.gameOver).toBe(true);
    expect(game.send('look').lines).toEqual(['The game has ended. Type RESTART to play again.']);
    const reply = game.send('restart');
    expect(reply.gameOver).toBe(false);
    expect(game.state.gameOver).toBe(false);
    expect(game.send('look').lines.some((l) => l.startsWith('📍'))).toBe(true);
  });

  it('UNDO takes back the last turn that changed something, one step at a time', () => {
    const game = createGame(tutorial, { seed: 1 });
    const fresh = structuredClone(game.state);
    game.send('open drawer');
    const opened = structuredClone(game.state);
    game.send('take stapler');
    game.send('look');
    expect(game.send('undo').lines).toEqual(['[Previous turn undone.]']);
    expect(game.state).toEqual(opened);
    expect(game.send('undo').lines).toEqual(['[Previous turn undone.]']);
    expect(game.state).toEqual(fresh);
    expect(game.send('undo').lines).toEqual(['[Nothing to undo.]']);
    expect(game.state).toEqual(fresh);
  });

  it('UNDO says Undone. in an Infocom-style world, and works after the game has ended', () => {
    const game = createGame(zork1, { seed: 1 });
    game.send('open mailbox');
    expect(game.send('undo').lines).toEqual(['Undone.']);
    const tut = createGame(tutorial, { seed: 1 });
    for (const c of winning) tut.send(c);
    tut.send('undo');
    expect(tut.state.gameOver).toBe(false);
  });

  it('SAVE, RESTORE and LOAD say they aren’t available and change nothing; AGAIN skips them', () => {
    const game = createGame(tutorial, { seed: 1 });
    const looked = game.send('look');
    const before = structuredClone(game.state);
    expect(game.send('save').lines).toEqual(['[Saving isn’t available here.]']);
    expect(game.send('save my game').lines).toEqual(['[Saving isn’t available here.]']);
    expect(game.send('restore').lines).toEqual(['[Restoring isn’t available here.]']);
    expect(game.send('restore my game').lines).toEqual(['[Restoring isn’t available here.]']);
    expect(game.send('load').lines).toEqual(['[Restoring isn’t available here.]']);
    expect(game.state).toEqual(before);
    expect(game.send('again').lines).toEqual(looked.lines);
  });

  it('SCRIPT and UNSCRIPT say transcripts aren’t available', () => {
    const game = createGame(tutorial, { seed: 1 });
    expect(game.send('script').lines).toEqual(['[Transcripts aren’t available here.]']);
    expect(game.send('unscript').lines).toEqual(['[Transcripts aren’t available here.]']);
    expect(game.state.moveCount).toBe(0);
  });

  it('VERSION names the engine and the world', () => {
    const game = createGame(zork1, { seed: 1 });
    const lines = game.send('version').lines;
    expect(lines[0]).toBe(`[Brass Lantern ${ENGINE_VERSION}]`);
    expect(lines).toContain(zork1.title);
    expect(lines.every((l) => l.length > 0)).toBe(true);
    expect(createGame(tutorial).send('version').lines.every((l) => l.length > 0)).toBe(true);
  });

  it('ENGINE_VERSION is the package’s version', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(ENGINE_VERSION).toBe(manifest.version);
  });

  it('HELP lists only what works headless; storeHelp adds the store’s commands', () => {
    const help = createGame(tutorial).send('help').lines.join('\n');
    for (const word of ['UNDO', 'RESTART', 'VERSION', 'AGAIN']) expect(help).toContain(word);
    for (const word of ['SAVE', 'RESTORE', 'LOAD ', 'SCRIPT', 'THEME', 'BLOOM', 'EFFECTS', 'COOKIES', 'plain English']) {
      expect(help).not.toContain(word);
    }
    const store = execute({ action: 'help' }, { world: tutorial, state: initialState(tutorial), storeHelp: true }).lines.join('\n');
    for (const word of ['UNDO', 'SAVE', 'RESTORE', 'LOAD ', 'SCRIPT', 'THEME', 'BLOOM', 'EFFECTS', 'COOKIES', 'plain English', 'Wipe save']) {
      expect(store).toContain(word);
    }
  });
});
