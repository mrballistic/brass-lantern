import { describe, expect, it } from 'vitest';
import { fightStrength, pickTable, TABLES } from '../../src/engine/combat';
import { execute } from '../../src/engine/engine';
import type { GameState, ParsedAction } from '../../src/types/game';
import type { World } from '../../src/types/world';
import { carry, stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

// An Infocom-style fixture with combat rules, so Zork's wording applies.
const world: World = {
  ...fixtureWorld,
  style: 'infocom',
  maxScore: 350,
  combat: {
    strength: { min: 2, max: 7 },
    cureWait: 30,
    messages: {
      missed: ['Your {weapon} misses the {defender} by an inch.'],
      killed: ['The fatal blow strikes the {defender} square in the heart: He dies.'],
    },
  },
  npcs: {
    ...fixtureWorld.npcs,
    guard: {
      ...fixtureWorld.npcs.guard,
      instead: { throw: [{ say: ['The guard catches it and hands it back.'] }] },
    },
  },
};
// Brass style, but with combat: the short default wording.
const brass: World = { ...fixtureWorld, combat: {} };
const act = (s: GameState, a: ParsedAction, w: World = world) => execute(a, { world: w, state: s }).lines;
const attack = (s: GameState, target: string, indirect?: string, w: World = world) =>
  act(s, indirect ? { action: 'attack', target, indirect } : { action: 'attack', target }, w);

describe('combat: the player’s blow', () => {
  it('picks Zork’s table from the two strengths', () => {
    expect(pickTable(1, 1)).toEqual(TABLES.DEF1);
    expect(pickTable(5, 1)).toEqual(TABLES.DEF1.slice(2));
    expect(pickTable(1, 2)).toEqual(TABLES.DEF2A);
    expect(pickTable(2, 2)).toEqual(TABLES.DEF2B);
    expect(pickTable(9, 2)).toEqual(TABLES.DEF2B.slice(2));
    expect(pickTable(2, 4)).toEqual(TABLES.DEF3A);
    expect(pickTable(3, 4)).toEqual(TABLES.DEF3A.slice(1));
    expect(pickTable(4, 4)).toEqual(TABLES.DEF3B);
    expect(pickTable(5, 4)).toEqual(TABLES.DEF3B.slice(1));
    expect(pickTable(9, 4)).toEqual(TABLES.DEF3C);
    for (const [a, d] of [[1, 1], [3, 1], [1, 2], [4, 2], [1, 5], [9, 3]]) expect(pickTable(a, d).length).toBeGreaterThanOrEqual(9);
  });

  it('player strength grows with score and falls with wounds', () => {
    const s = stateWith(world);
    expect(fightStrength(world, s)).toBe(2);
    s.vars = { ...s.vars, score: 140 };
    expect(fightStrength(world, s)).toBe(4);
    s.vars.score = 350;
    expect(fightStrength(world, s)).toBe(7);
    s.player = { wounds: 2 };
    expect(fightStrength(world, s)).toBe(5);
    expect(fightStrength(world, s, false)).toBe(7);
  });

  it('in Infocom style, guesses the one weapon you hold, as Zork’s parser does', () => {
    const s = stateWith(world, { room: 'shed' });
    carry(s, 'bat');
    expect(attack(s, 'guard')[0]).toBe('(with the bat)');
  });

  it('in Infocom style, asks what to attack with when you hold no weapon', () => {
    const s = stateWith(world, { room: 'shed' });
    const r = execute({ action: 'attack', target: 'guard' }, { world, state: s });
    expect(r.lines).toEqual(['What do you want to attack the guard with?']);
    expect(r.ask?.kind).toBe('what');
    expect(r.free).toBe(true);
  });

  it('in Infocom style, a weapon you don’t have is the parser’s refusal: no turn passes', () => {
    const s = stateWith(world, { room: 'shed' });
    s.locations.bat = 'shed';
    const r = execute({ action: 'attack', target: 'guard', indirect: 'bat' }, { world, state: s });
    expect(r.lines).toEqual(['You don’t have the bat.']);
    expect(r.free).toBe(true);
    expect(s.moveCount).toBe(0);
  });

  it('refuses in Zork’s order and words, changing nothing', () => {
    const s = stateWith(brass, { room: 'shed' });
    carry(s, 'wallet');
    const before = structuredClone(s);
    expect(attack(s, 'guard', undefined, brass)).toEqual(['You can’t fight the guard with your bare hands.']);
    expect(attack(s, 'guard', 'hands')).toEqual(['Trying to attack a guard with your bare hands is suicidal.']);
    expect(execute({ action: 'attack', target: 'guard', indirect: 'bat' }, { world, state: s }).understood).toBe(false); // no bat here: a miss
    expect(attack(s, 'guard', 'wallet')).toEqual(['Trying to attack the guard with a wallet is suicidal.']);
    expect(attack(s, 'crate', 'wallet')).toEqual(['I’ve known strange people, but fighting a crate?']);
    expect({ ...s, turns: 0, moveCount: 0 }).toEqual({ ...before, turns: 0, moveCount: 0 });
  });

  it('not holding the weapon (brass), and characters with no fight in them', () => {
    const s = stateWith(world, { room: 'yard' });
    const shed = stateWith(brass, { room: 'shed' });
    shed.locations.bat = 'shed';
    expect(attack(shed, 'guard', 'bat', brass)[0]).toBe('You aren’t holding the bat.');
    carry(s, 'bat');
    expect(attack(s, 'neighbor', 'bat')[0]).toBe('Neighbor won’t fight you.');
  });

  it('a blow follows the seed, and the same seed replays it', () => {
    const a = stateWith(world, { room: 'shed' });
    carry(a, 'bat');
    const b = structuredClone(a);
    expect(attack(a, 'guard', 'bat')).toEqual(attack(b, 'guard', 'bat'));
    expect(a.npcs?.guard).toEqual(b.npcs?.guard);
    expect(attack(a, 'guard', 'bat')).toEqual(attack(b, 'guard', 'bat'));
  });

  it('an unarmed defender dies at once, and onDeath runs', () => {
    const w: World = { ...world, events: { ...world.events, guard_dies: [{ move: 'cudgel', to: 'here' }] } };
    w.npcs = { ...w.npcs, guard: { ...w.npcs.guard, combat: { ...w.npcs.guard.combat!, onDeath: 'guard_dies' } } };
    const s = stateWith(w, { room: 'shed' });
    carry(s, 'bat');
    s.locations.cudgel = null;
    const lines = attack(s, 'guard', 'bat', w);
    expect(lines[0]).toBe('The unarmed guard cannot defend himself: He dies.');
    expect(lines[1]).toMatch(/^Almost as soon as the guard breathes his last breath/);
    expect(s.npcs?.guard?.strength).toBe(0);
    expect(s.locations.cudgel).toBe('shed'); // onDeath ran
  });

  it('brass worlds get short defaults', () => {
    const s = stateWith(brass, { room: 'shed' });
    carry(s, 'bat');
    s.locations.cudgel = null;
    expect(attack(s, 'guard', 'bat', brass)).toEqual(['The guard can’t defend themselves.', 'The guard is dead.']);
  });

  it('SMASH and ATTACK at things still smash in a world without combat', () => {
    const s = stateWith(fixtureWorld);
    expect(attack(s, 'alarm', undefined, fixtureWorld)).toContain('🔨 You smash the alarm clock.');
  });

  it('THROW: a character’s rule, or the thing lands on the floor', () => {
    const s = stateWith(world, { room: 'shed' });
    carry(s, 'wallet', 'shirt');
    expect(act(s, { action: 'throw', target: 'wallet', indirect: 'guard' })).toEqual(['The guard catches it and hands it back.']);
    expect(act(s, { action: 'throw', target: 'shirt' })).toEqual(['Thrown.']);
    expect(s.locations.shirt).toBe('shed');
    expect(execute({ action: 'throw', target: 'lamp' }, { world, state: s }).understood).toBe(false);
  });

  it('a guessed weapon weakens the defender as a named one does (Zork’s GWIM sets PRSI)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = stateWith(world, { room: 'shed' });
      carry(a, 'bat');
      a.rng = seed;
      // Staggered: the player's blow is lost, so the guard swings back at full strength unless the weapon counts.
      a.player = { staggered: true };
      a.npcs = { guard: { fighting: true } };
      const b = structuredClone(a);
      expect(attack(a, 'guard').slice(1)).toEqual(attack(b, 'guard', 'bat'));
    }
  });

  it('in a world without combat, attacking a person is SMASH, as before (a miss the LLM can retry)', () => {
    const s = stateWith(fixtureWorld, { room: 'yard' });
    carry(s, 'bat');
    expect(execute({ action: 'attack', target: 'neighbor', indirect: 'bat' }, { world: fixtureWorld, state: s })).toEqual(
      execute({ action: 'smash', target: 'neighbor', indirect: 'bat' }, { world: fixtureWorld, state: structuredClone(s) }),
    );
  });

  it('in a world with combat, someone who doesn’t fight says so before any weapon check', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(attack(s, 'neighbor')[0]).toBe('Neighbor won’t fight you.');
  });

  it('THROW at a person with no rule for it is a miss, so the LLM can read it another way', () => {
    const s = stateWith(world, { room: 'yard' });
    carry(s, 'wallet');
    const r = execute({ action: 'throw', target: 'wallet', indirect: 'neighbor' }, { world, state: s });
    expect(r.understood).toBe(false);
    expect(s.locations.wallet).toBe('player');
  });
});

describe('Infocom habits found in the coal mine (5c)', () => {
  it('ATTACK with no weapon named guesses the one held before a rule answers', () => {
    const w: World = { ...world, npcs: { ...world.npcs, guard: { ...world.npcs.guard, instead: { attack: [{ say: ['The guard ducks.'] }] } } } };
    const s = stateWith(w, { room: 'shed' });
    carry(s, 'bat');
    expect(act(s, { action: 'attack', target: 'guard' }, w)).toEqual(['(with the bat)', 'The guard ducks.']);
  });
  it('PUT of something in sight but not held: “You don’t have the …”, before any rule', () => {
    const w: World = { ...world, items: { ...world.items, chute: { name: 'chute', description: '', portable: false, tags: [], scenery: true, instead: { put: [{ as: 'indirect', say: ['Whoosh.'] }] } } } };
    const s = stateWith(w, { room: 'shed' });
    s.locations.chute = 'shed';
    expect(act(s, { action: 'put', target: 'chute', indirect: 'chute' }, w)).toEqual(['You don’t have the chute.']);
  });
});
