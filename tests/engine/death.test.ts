import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import { execute } from '@/engine/engine';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('death', () => {
  it('dies, pays the penalty, sends things home or scatters them, and respawns', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['lamp', 'wallet', 'key'] });
    s.rng = 123;
    s.fuses = { something: 3 };
    const lines = runSteps([{ run: 'fall_down' }], world, s);
    expect(lines.slice(0, 2)).toEqual(['You fall.', '**** You have died ****']);
    expect(lines).toContain('You wake up.');
    expect(lines).toContain('📍 Bedroom');
    expect(lines).not.toContain('never printed');
    expect(s.currentRoom).toBe('bedroom');
    expect(s.vars?.score).toBe(-10);
    expect(s.vars?.deaths).toBe(1);
    expect(s.locations.lamp).toBe('shed');
    expect(['yard', 'living']).toContain(s.locations.wallet);
    expect(['yard', 'living']).toContain(s.locations.key);
    expect(s.fuses).toEqual({});
    expect(s.gameOver).toBe(false);
  });

  it('the same seed scatters the same way', () => {
    const place = () => {
      const s = stateWith(world, { carrying: ['wallet', 'key', 'bat'] });
      s.rng = 99;
      runSteps([{ die: 'x' }], world, s);
      return ['wallet', 'key', 'bat'].map((id) => s.locations[id]);
    };
    expect(place()).toEqual(place());
  });

  it('the last life ends the game, and nothing runs after it', () => {
    const s = stateWith(world);
    s.vars = { deaths: 1 };
    const lines = runSteps([{ die: 'Again.' }, 'not printed'], world, s);
    expect(lines).toEqual(['Again.', '**** You have died ****', 'That’s it.']);
    expect(s.gameOver).toBe(true);
  });

  it('a death mid-turn stops daemons that turn', () => {
    const w: World = {
      ...world,
      daemons: [{ if: 'in:bedroom', then: [{ die: 'A daemon gets you.' }] }, { if: 'in:bedroom', then: ['Never seen.'] }],
    };
    const s = stateWith(w);
    s.vars = { deaths: 1 };
    const r = execute({ action: 'look' }, { world: w, state: s });
    expect(r.lines).toContain('A daemon gets you.');
    expect(r.lines).not.toContain('Never seen.');
    expect(s.gameOver).toBe(true);
  });

  it('without a death block, dying just ends the game', () => {
    const w = { ...world, death: undefined };
    const s = stateWith(w, { room: 'yard', carrying: ['wallet'] });
    expect(runSteps([{ die: 'Bonk.' }], w, s)).toEqual(['Bonk.']);
    expect(s.gameOver).toBe(true);
  });

  it('a home that isn’t a room, or no scatter rooms, leaves things where the player fell', () => {
    const w: World = {
      ...world,
      death: { ...world.death!, scatter: [] },
      items: { ...world.items, wallet: { ...world.items.wallet, home: 'nowhere' } },
    };
    const s = stateWith(w, { room: 'yard', carrying: ['wallet', 'key'] });
    runSteps([{ die: 'x' }], w, s);
    expect(s.locations.wallet).toBe('yard');
    expect(s.locations.key).toBe('yard');
  });

  it('nothing after a death runs, however deeply it was nested, even when the player is resurrected', () => {
    const w: World = {
      ...world,
      events: { ...world.events, inner: [{ die: 'Zapped.' }], zap: [{ run: 'inner' }] },
      items: { ...world.items, bed: { ...world.items.bed, onUse: [{ then: 'zap', say: ['NOT AFTER DEATH (say)'] }] } },
      daemons: [{ if: 'in:bedroom', then: ['NOT AFTER DEATH (daemon)'] }],
    };
    const s = stateWith(w);
    const viaRun = runSteps([{ run: 'inner' }, 'NOT AFTER DEATH', { score: 50 }], w, s);
    expect(viaRun).not.toContain('NOT AFTER DEATH');
    expect(s.vars?.score).toBe(-10);

    const s2 = stateWith(w);
    expect(runSteps([{ chance: 100, then: [{ die: 'Fell.' }] }, 'NOT AFTER DEATH'], w, s2)).not.toContain('NOT AFTER DEATH');

    const s3 = stateWith(w);
    const r = execute({ action: 'use', target: 'bed' }, { world: w, state: s3 });
    expect(r.lines).toContain('Zapped.');
    expect(r.lines.join('\n')).not.toContain('NOT AFTER DEATH');
  });

  it('a death can run an event after the resurrection', () => {
    const w: World = { ...world, death: { ...world.death!, then: 'reborn' }, events: { ...world.events, reborn: ['You feel new.'] } };
    const s = stateWith(w, { room: 'yard' });
    const lines = runSteps([{ die: 'Oops.' }], w, s);
    expect(lines.at(-1)).toBe('You feel new.');
  });
});

describe('death variants (5a)', () => {
  const base = { message: [{ if: 'flag:unlucky', text: 'Bad luck, huh?' }, '**** You have died ****'], lives: 2, respawn: 'living', resurrection: ['Another chance.'] };
  it('conditional message lines', () => {
    const w: World = { ...world, death: base };
    const lucky = stateWith(w, { room: 'yard' });
    expect(runSteps([{ die: 'Splat.' }], w, lucky).slice(0, 2)).toEqual(['Splat.', '**** You have died ****']);
    const s = stateWith(w, { room: 'yard', flags: ['unlucky'] });
    expect(runSteps([{ die: 'Splat.' }], w, s).slice(0, 3)).toEqual(['Splat.', 'Bad luck, huh?', '**** You have died ****']);
  });
  it('a variant replaces the resurrection text, the room and the event', () => {
    const w: World = { ...world, events: { ...world.events, ghosted: [{ set: 'dead' }] }, death: { ...base, variants: [{ if: 'visited:shed', resurrection: ['You find yourself before the gates.'], respawn: 'bedroom', then: 'ghosted' }] } };
    const s = stateWith(w, { room: 'yard' });
    s.visited.push('shed');
    const lines = runSteps([{ die: 'Splat.' }], w, s);
    expect(lines).toContain('You find yourself before the gates.');
    expect(lines).not.toContain('Another chance.');
    expect(s.currentRoom).toBe('bedroom');
    expect(s.flags.dead).toBe(true);
  });
  it('without a matching variant, the block’s own fields', () => {
    const w: World = { ...world, death: { ...base, variants: [{ if: 'flag:never', respawn: 'shed' }] } };
    const s = stateWith(w, { room: 'yard' });
    expect(runSteps([{ die: 'Splat.' }], w, s)).toContain('Another chance.');
    expect(s.currentRoom).toBe('living');
  });
  it('dying while dead ends the game with its own lines', () => {
    const w: World = { ...world, death: { ...base, instead: [{ if: 'flag:dead', lines: ['It takes a talented person…'] }] } };
    const s = stateWith(w, { room: 'yard', flags: ['dead'] });
    expect(runSteps([{ die: 'Splat.' }], w, s)).toEqual(['It takes a talented person…']);
    expect(s.gameOver).toBe(true);
  });
});

describe('the audit checks death variants and litIf', () => {
  it('flags bad rooms, events and conditions', async () => {
    const { auditWorld } = await import('../helpers/audit');
    const w: World = {
      ...world,
      darkness: { ...world.darkness, litIf: 'in:nowhere1' },
      death: { message: [{ if: 'in:nowhere2', text: 'x' }], variants: [{ if: 'in:nowhere3', respawn: 'nowhere4', then: 'nothing5' }], instead: [{ if: 'in:nowhere6', lines: [] }] },
    };
    const p = auditWorld(w).join('\n');
    for (const n of ['nowhere1', 'nowhere2', 'nowhere3', 'nowhere4', 'nothing5', 'nowhere6']) expect(p).toContain(n);
  });
});

describe('death variants: before (5a)', () => {
  it('runs `before` ahead of the respawn, so the new room is described as it now is', () => {
    const w: World = {
      ...world,
      rooms: { ...world.rooms, bedroom: { ...world.rooms.bedroom, descriptions: [{ if: 'flag:dead', text: 'A ghostly bedroom.' }] } },
      events: { ...world.events, ghosted: [{ set: 'dead' }] },
      death: { lives: 2, respawn: 'living', variants: [{ if: 'in:yard', respawn: 'bedroom', before: 'ghosted' }] },
    };
    const s = stateWith(w, { room: 'yard' });
    expect(runSteps([{ die: 'Splat.' }], w, s)).toContain('A ghostly bedroom.');
  });
});

describe('treasures scattered into the dark (RANDOMIZE-OBJECTS) (fast follow)', () => {
  it('with death.treasures: “dark”, a treasure lands in an unlit land room; other things scatter as before', async () => {
    const { fixtureWorld } = await import('../fixtures/world');
    const { stateWith } = await import('../helpers/state');
    const { runSteps } = await import('@/engine/effects');
    const w = {
      ...fixtureWorld,
      death: { ...fixtureWorld.death!, lives: 5, treasures: 'dark' as const, scatter: ['yard'] },
      items: { ...fixtureWorld.items, gem: { name: 'gem', description: '', portable: true, tags: [], treasure: 5 }, pebble: { name: 'pebble', description: '', portable: true, tags: [] } },
    };
    const s = stateWith(w, { room: 'bedroom', carrying: ['gem', 'pebble'] });
    runSteps([{ die: 'Oops.' }], w, s);
    const gemRoom = s.locations.gem as string;
    expect(w.rooms[gemRoom]?.dark).toBe(true);
    expect(s.locations.pebble).toBe('yard');
  });
});

describe('the dark-room walk re-tests where the last treasure landed (backlog clear-out)', () => {
  it('two treasures can share a room, as in RANDOMIZE-OBJECTS', async () => {
    const { fixtureWorld } = await import('../fixtures/world');
    const { stateWith } = await import('../helpers/state');
    const { runSteps } = await import('@/engine/effects');
    const { nextRandom } = await import('@/engine/rng');
    const w = {
      ...fixtureWorld,
      death: { ...fixtureWorld.death!, lives: 5, treasures: 'dark' as const, scatter: ['yard'] },
      rooms: { ...fixtureWorld.rooms, loft: { ...fixtureWorld.rooms.loft, dark: true } },
      items: { ...fixtureWorld.items, gem: { name: 'gem', description: '', portable: true, tags: [], treasure: 5 }, ruby: { name: 'ruby', description: '', portable: true, tags: [], treasure: 5 } },
    };
    // A seed whose first two draws both pass the even odds.
    const seed = Array.from({ length: 500 }, (_, i) => i + 1).find((n) => { const t = { rng: n } as never; return nextRandom(t) < 0.5 && nextRandom(t) < 0.5; })!;
    const s = stateWith(w, { room: 'bedroom', carrying: ['gem', 'ruby'] });
    s.rng = seed;
    runSteps([{ die: 'Oops.' }], w, s);
    expect(s.locations.gem).toBe(s.locations.ruby);
  });
});
