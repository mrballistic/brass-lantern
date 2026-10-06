import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '@/engine/conditions';
import { execute } from '@/engine/engine';
import { runSteps } from '@/engine/effects';
import { isNpcIn, npcsSeen } from '@/engine/model';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('hidden characters', () => {
  it('are in the room for scripts, but not seen, listed, matched or fought', () => {
    const s = stateWith(world, { room: 'shed' });
    runSteps([{ npcState: 'guard', hidden: true }], world, s);
    expect(isNpcIn(world, s, 'guard', 'shed')).toBe(true);
    expect(npcsSeen(world, s, 'shed')).toEqual([]);
    expect(evaluateCondition('seen:guard', s, world)).toBe(false);
    expect(execute({ action: 'look' }, { world, state: s }).lines.join(' ')).not.toContain('guard');
    const before = structuredClone(s);
    expect(execute({ action: 'talk', target: 'guard' }, { world, state: s }).understood).toBe(false);
    expect(execute({ action: 'attack', target: 'guard' }, { world: { ...world, combat: {} }, state: s }).understood).toBe(false);
    expect({ ...s, turns: 0, moveCount: 0 }).toEqual({ ...before, turns: 0, moveCount: 0 });
    runSteps([{ npcState: 'guard', hidden: false }], world, s);
    expect(evaluateCondition('seen:guard', s, world)).toBe(true);
  });

  it('a hidden fighter doesn’t strike first or swing', () => {
    const w = { ...world, combat: {}, npcs: { ...world.npcs, guard: { ...world.npcs.guard, combat: { ...world.npcs.guard.combat!, firstStrike: 100 } } } };
    const s = stateWith(w, { room: 'shed' });
    s.npcs = { guard: { hidden: true } };
    execute({ action: 'wait' }, { world: w, state: s });
    expect(s.npcs.guard.fighting).toBeFalsy();
  });
});
