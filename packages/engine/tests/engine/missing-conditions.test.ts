import { auditWorld } from '../../src/engine/audit';
import { evaluateCondition } from '../../src/engine/conditions';
import { runSteps } from '../../src/engine/effects';
import { createGame } from '../../src/engine/game';
import { fixtureWorld } from '../fixtures/world';
import { stateWith } from '../helpers/state';
import type { World } from '../../src/types/world';

const withTrigger = (repeat?: boolean): World => ({
  ...fixtureWorld,
  rooms: { ...fixtureWorld.rooms, living: { ...fixtureWorld.rooms.living, onEnter: [{ then: 'rest', ...(repeat ? { repeat } : {}) }] } },
});

describe('a missing condition holds', () => {
  it('evaluateCondition treats undefined and blank as true', () => {
    const state = stateWith(fixtureWorld);
    expect(evaluateCondition(undefined, state)).toBe(true);
    expect(evaluateCondition('  ', state)).toBe(true);
    expect(evaluateCondition('', state)).toBe(true);
  });

  it('an onEnter trigger without `if` runs once', () => {
    const game = createGame(withTrigger(), { seed: 1 });
    expect(game.send('west').lines.join(' ')).toContain('You nap.');
    expect(game.send('east').lines.join(' ')).not.toContain('Something went wrong');
    expect(game.send('west').lines.join(' ')).not.toContain('You nap.');
  });

  it('with repeat it runs on each entry', () => {
    const game = createGame(withTrigger(true), { seed: 1 });
    expect(game.send('west').lines.join(' ')).toContain('You nap.');
    game.send('east');
    expect(game.send('west').lines.join(' ')).toContain('You nap.');
  });

  it('auditWorld reports no problem and does not throw', () => {
    expect(auditWorld(withTrigger())).toEqual(auditWorld(fixtureWorld));
  });

  it('auditWorld copes with an `if` effect step that has no `if`', () => {
    const world = { ...fixtureWorld, events: { ...fixtureWorld.events, rest: [{ if: undefined, then: ['ok'] }] } } as unknown as World;
    expect(() => auditWorld(world)).not.toThrow();
  });

  it('a description without `if` is used', () => {
    const world = {
      ...fixtureWorld,
      rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, descriptions: [{ text: 'Always this.' }] } },
    } as unknown as World;
    const game = createGame(world, { seed: 1 });
    expect(game.send('look').lines.join(' ')).toContain('Always this.');
  });

  it('an `if` effect step without `if` takes its then branch', () => {
    const state = stateWith(fixtureWorld);
    const lines = runSteps([{ if: undefined, then: ['Then.'], else: ['Else.'] }] as never, fixtureWorld, state);
    expect(lines.join(' ')).toContain('Then.');
    expect(lines.join(' ')).not.toContain('Else.');
  });
});
