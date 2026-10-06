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

  it('a character can start hidden, and answer to aliases', () => {
    const w = { ...world, npcs: { ...world.npcs, guard: { ...world.npcs.guard, hidden: true, aliases: ['sentry'] } } };
    const s = stateWith(w, { room: 'shed' });
    expect(npcsSeen(w, s, 'shed')).toEqual([]);
    runSteps([{ npcState: 'guard', hidden: false }], w, s);
    expect(execute({ action: 'examine', target: 'sentry' }, { world: w, state: s }).lines).toEqual(['A guard watches you.']);
  });

  it('items can be hidden and revealed: unseen, unlisted, untakeable', () => {
    const s = stateWith(world, { room: 'living' });
    runSteps([{ hide: 'wallet' }], world, s);
    expect(execute({ action: 'look' }, { world, state: s }).lines.join(' ')).not.toContain('wallet');
    expect(execute({ action: 'take', target: 'wallet' }, { world, state: s }).understood).toBe(false);
    runSteps([{ reveal: 'wallet' }], world, s);
    expect(execute({ action: 'take', target: 'wallet' }, { world, state: s }).lines[0]).toBe('Taken: wallet.');
  });

  it('scripts can read the player’s fight strength', () => {
    const w = { ...world, maxScore: 350, combat: {}, scripts: { str: (ctx: { playerStrength(): number }) => [`${ctx.playerStrength()}`] } };
    const s = stateWith(w);
    s.player = { wounds: 1 };
    expect(runSteps([{ script: 'str' }], w, s)).toEqual(['1']);
  });
});


describe('hidden items (review fixes)', () => {
  it('Infocom TAKE ALL doesn’t name a hidden item', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'living' });
    runSteps([{ hide: 'wallet' }], w, s);
    const out = execute({ action: 'take', target: 'all' }, { world: w, state: s }).lines.join(' ');
    expect(out).not.toContain('wallet');
    expect(s.locations.wallet).toBe('living');
  });

  it('opening or looking in a container doesn’t list a hidden item inside', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'living' });
    s.locations.jar = 'living';
    runSteps([{ hide: 'marble' }], w, s);
    expect(execute({ action: 'examine', target: 'jar' }, { world: w, state: s }).lines.join(' ')).not.toContain('marble');
    expect(execute({ action: 'open', target: 'jar' }, { world: w, state: s }).lines.join(' ')).not.toContain('marble');
  });
});
