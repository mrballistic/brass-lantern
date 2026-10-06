import { describe, expect, it } from 'vitest';
import { conditionProblems, evaluateCondition } from '@/engine/conditions';
import { execute } from '@/engine/engine';
import { runSteps } from '@/engine/effects';
import { npcsIn, visibleItems } from '@/engine/model';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('characters', () => {
  it('start where rooms list them, and move by effect', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(npcsIn(world, s, 'shed')).toContain('guard');
    expect(evaluateCondition('with:guard', s, world)).toBe(true);
    runSteps([{ moveNpc: 'guard', to: 'yard' }], world, s);
    expect(npcsIn(world, s, 'shed')).not.toContain('guard');
    expect(npcsIn(world, s, 'yard')).toContain('guard');
    expect(evaluateCondition('with:guard', s, world)).toBe(false);
  });

  it('hold things the player can neither see nor take', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(s.locations.cudgel).toBe('guard');
    expect(visibleItems(world, s)).not.toContain('cudgel');
    expect(execute({ action: 'take', target: 'cudgel' }, { world, state: s }).understood).toBe(false);
  });

  it('describe themselves by state, and the conditions follow', () => {
    const s = stateWith(world, { room: 'shed' });
    expect(execute({ action: 'examine', target: 'guard' }, { world, state: s }).lines).toEqual(['A guard watches you.']);
    runSteps([{ npcState: 'guard', strength: -2 }], world, s);
    expect(evaluateCondition('alive:guard & !awake:guard', s, world)).toBe(true);
    expect(execute({ action: 'examine', target: 'guard' }, { world, state: s }).lines).toEqual(['A guard snores in the corner.']);
    runSteps([{ npcState: 'guard', fighting: true }], world, s);
    expect(evaluateCondition('fighting:guard', s, world)).toBe(false); // out cold
    runSteps([{ npcState: 'guard', strength: 0 }], world, s);
    expect(evaluateCondition('alive:guard', s, world)).toBe(false);
    expect(npcsIn(world, s, 'shed')).not.toContain('guard');
  });

  it('move with “here” puts a thing in the player’s room', () => {
    const s = stateWith(world, { room: 'shed' });
    runSteps([{ move: 'cudgel', to: 'here' }], world, s);
    expect(s.locations.cudgel).toBe('shed');
  });

  it('in Infocom style a character in the room prints its own line', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'shed' });
    expect(execute({ action: 'look' }, { world: w, state: s }).lines).toContain('A guard watches you.');
  });

  it('the audit knows the new conditions', () => {
    expect(conditionProblems('fighting:guard & with:guard & alive:guard & awake:guard', world)).toEqual([]);
    expect(conditionProblems('alive:ghost', world)).toEqual(['“alive:ghost” names no character “ghost”']);
  });

  it('a character listed in several rooms is in each of them, until something moves it', () => {
    const w = { ...world, rooms: { ...world.rooms, living: { ...world.rooms.living, npcs: ['neighbor'] } } };
    const s = stateWith(w, { room: 'living' });
    expect(npcsIn(w, s, 'living')).toContain('neighbor');
    expect(npcsIn(w, s, 'yard')).toContain('neighbor');
    expect(evaluateCondition('with:neighbor', s, w)).toBe(true);
    runSteps([{ moveNpc: 'neighbor', to: 'yard' }], w, s);
    expect(npcsIn(w, s, 'living')).not.toContain('neighbor');
    expect(npcsIn(w, s, 'yard')).toContain('neighbor');
  });

  it('a scenery character isn’t listed in the room, but can be examined', () => {
    const w = { ...world, style: 'infocom' as const, npcs: { ...world.npcs, guard: { ...world.npcs.guard, scenery: true } } };
    const s = stateWith(w, { room: 'shed' });
    expect(execute({ action: 'look' }, { world: w, state: s }).lines).not.toContain('A guard watches you.');
    expect(execute({ action: 'examine', target: 'guard' }, { world: w, state: s }).lines).toEqual(['A guard watches you.']);
  });
});

