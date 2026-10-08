import { describe, expect, it } from 'vitest';
import { runSteps } from '../../src/engine/effects';
import { evaluateCondition } from '../../src/engine/conditions';
import { execute } from '../../src/engine/engine';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('effects', () => {
  it('prints strings and applies bracket lines, as before', () => {
    const s = stateWith(world);
    expect(runSteps(['Hello.', '[Flag set: Paid]'], world, s)).toEqual(['Hello.', '[Flag set: Paid]']);
    expect(s.flags.paid).toBe(true);
  });

  it('effects naming things that don’t exist change nothing', () => {
    const s = stateWith(world);
    const before = structuredClone(s);
    expect(
      runSteps(
        [
          { move: 'ghost', to: 'player' },
          { open: 'ghost' },
          { close: 'ghost' },
          { lock: 'ghost' },
          { unlock: 'ghost' },
          { switch: 'ghost', on: true },
          { run: 'no_such_event' },
          { schedule: 'no_such_event', in: 2 },
        ],
        world,
        s,
      ),
    ).toEqual([]);
    expect(s).toEqual(before);
  });

  it('sets and clears flags, moves items, opens/locks/switches things, all silently', () => {
    const s = stateWith(world);
    expect(
      runSteps([{ set: 'paid' }, { move: 'coin', to: 'player' }, { switch: 'lamp', on: true }, { unlock: 'chest' }, { open: 'chest' }], world, s),
    ).toEqual([]);
    expect(s.flags.paid).toBe(true);
    expect(s.locations.coin).toBe('player');
    expect(s.itemState.lamp.on).toBe(true);
    expect(s.itemState.chest).toEqual({ locked: false, open: true });
    runSteps([{ clear: 'paid' }, { close: 'chest' }, { lock: 'chest' }], world, s);
    expect(s.flags.paid).toBe(false);
    expect(s.itemState.chest).toEqual({ locked: true, open: false });
  });

  it('a say step prints its text', () => {
    expect(runSteps([{ say: 'Spoken.' }], world, stateWith(world))).toEqual(['Spoken.']);
  });

  it('variables, score, and conditions on them', () => {
    const s = stateWith(world);
    runSteps([{ setVar: 'fuel', to: 10 }, { add: 'fuel', by: -3 }, { score: -10 }], world, s);
    expect(s.vars).toEqual({ fuel: 7, score: -10 });
    expect(evaluateCondition('var:fuel=7', s, world)).toBe(true);
    expect(evaluateCondition('var:fuel<=6', s, world)).toBe(false);
    expect(evaluateCondition('var:fuel>6 & var:fuel<8', s, world)).toBe(true);
    expect(evaluateCondition('var:nothing=0', s, world)).toBe(true);
    expect(evaluateCondition('carrying<=0', s, world)).toBe(true);
    s.locations.key = 'player';
    expect(evaluateCondition('carrying=1', s, world)).toBe(true);
    expect(evaluateCondition('!carrying>1', s, world)).toBe(true);
  });

  it('chance draws from the seeded generator: same seed, same branch', () => {
    const pick = (seed: number) => {
      const s = stateWith(world);
      s.rng = seed;
      return runSteps([{ chance: 50, then: ['heads'], else: ['tails'] }], world, s);
    };
    expect(pick(7)).toEqual(pick(7));
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => pick(n)[0]));
    expect(seen).toEqual(new Set(['heads', 'tails']));
  });

  it('run inlines another event; go moves the player and describes the room', () => {
    const s = stateWith(world, { room: 'living' });
    const lines = runSteps([{ run: 'take_key' }, { go: 'bedroom' }], world, s);
    expect(lines[0]).toBe('📎 The key is cold.');
    expect(s.firedEvents).toContain('take_key');
    expect(s.currentRoom).toBe('bedroom');
    expect(lines).toContain('📍 Bedroom');
  });

  it('a score entry can be a condition, counting while it holds; the score variable adds in', () => {
    const w = { ...world, scoring: [...(world.scoring ?? []), { if: 'inside:coin:shelf', points: 6 }] };
    const s = stateWith(w);
    const score = () => execute({ action: 'score' }, { world: w, state: s }).lines[0];
    expect(score()).toContain('Score: 0 of 46');
    s.locations.coin = 'shelf';
    expect(score()).toContain('Score: 6 of 46');
    s.vars = { score: -2 };
    expect(score()).toContain('Score: 4 of 46');
  });

  it('a new game starts with the world’s variables', () => {
    const w = { ...world, vars: { fuel: 185 } };
    expect(stateWith(w).vars).toEqual({ fuel: 185 });
  });
});
