import { describe, expect, it } from 'vitest';
import { execute } from '../../src/engine/engine';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world, fixtureWorld } from '../fixtures/world';
import type { World } from '../../src/types/world';

const run = (state: ReturnType<typeof stateWith>, action: string, target?: string, indirect?: string) =>
  execute({ action, target, indirect }, { world, state });

describe('instead and after rules', () => {
  it('an instead rule replaces the default', () => {
    const s = stateWith(world, { room: 'yard' });
    s.flags.paid = true;
    const r = run(s, 'take', 'bat');
    expect(r.lines).toEqual(['Not yours to take.']);
    expect(s.locations.bat).toBe('yard');
  });

  it('a rule whose condition fails falls through to the default', () => {
    const s = stateWith(world, { room: 'yard' });
    run(s, 'take', 'bat');
    expect(s.locations.bat).toBe('player');
  });

  it('after rules run only when the default succeeded, and respect their own conditions', () => {
    const s = stateWith(world, { room: 'yard' });
    run(s, 'take', 'lamp');
    expect(run(s, 'drop', 'lamp').lines).toContain('The lamp rolls under the fence.');
    run(s, 'take', 'lamp');
    expect(run(s, 'drop', 'lamp').lines).not.toContain('The lamp rolls under the fence.');
    expect(run(s, 'drop', 'lamp').lines).not.toContain('The lamp rolls under the fence.');
  });

  it('onUse is still honored, as instead.use', () => {
    const s = stateWith(world, { room: 'bedroom' });
    expect(run(s, 'use', 'bed').lines).toContain('😴 You nap.');
  });

  it('onTake still fires once, as after.take', () => {
    const s = stateWith(world, { room: 'living' });
    expect(run(s, 'take', 'brass key').lines).toContain('📎 The key is cold.');
    run(s, 'drop', 'brass key');
    expect(run(s, 'take', 'brass key').lines).not.toContain('📎 The key is cold.');
  });

  it('rules belong to the item the verb actually acted on', () => {
    // Carrying the lit lamp, with the plain lamp on the ground: DROP LAMP drops what you carry.
    const s = stateWith(world, { room: 'yard', carrying: ['lit_lamp'] });
    const r = run(s, 'drop', 'lamp');
    expect(s.locations.lit_lamp).toBe('yard');
    expect(r.lines).not.toContain('The lamp rolls under the fence.');
    expect(s.flags.lamp_rolled).toBeUndefined();
  });

  it('an instead rule can say its piece and let the default go on (continue)', () => {
    const w = { ...world, items: { ...world.items, wallet: { ...world.items.wallet, instead: { take: [{ say: ['It’s warm.'], continue: true }] } } } };
    const s = stateWith(w, { room: 'living' });
    const lines = execute({ action: 'take', target: 'wallet' }, { world: w, state: s }).lines;
    expect(lines.slice(0, 2)).toEqual(['It’s warm.', 'Taken: wallet.']);
    expect(s.locations.wallet).toBe('player');
  });
});


describe('rules by role and preposition (5a)', () => {
  const w = {
    ...world,
    items: {
      ...world.items,
      jar: { ...world.items.jar, instead: { put: [{ as: 'indirect' as const, say: ['The jar refuses.'] }] } },
      wallet: { ...world.items.wallet, instead: { put: [{ as: 'target' as const, prep: 'in', say: ['Not in there.'] }] } },
    },
  };
  it('`as` limits a rule to its owner’s role in the command', () => {
    const s = stateWith(w, { room: 'shed', carrying: ['wallet', 'key'] });
    s.locations.jar = 'shed';
    s.itemState.jar = { open: true };
    expect(execute({ action: 'put', target: 'key', indirect: 'jar', prep: 'in' }, { world: w, state: s }).lines).toEqual(['The jar refuses.']);
    const t = stateWith(w, { room: 'shed', carrying: ['jar'] });
    expect(execute({ action: 'put', target: 'jar', indirect: 'shelf', prep: 'on' }, { world: w, state: t }).lines).not.toEqual(['The jar refuses.']);
  });
  it('`prep` limits a rule to IN or ON', () => {
    const s = stateWith(w, { room: 'shed', carrying: ['wallet'] });
    s.itemState.chest = { open: true, locked: false };
    expect(execute({ action: 'put', target: 'wallet', indirect: 'chest', prep: 'in' }, { world: w, state: s }).lines).toEqual(['Not in there.']);
    expect(execute({ action: 'put', target: 'wallet', indirect: 'shelf', prep: 'on' }, { world: w, state: s }).lines).not.toEqual(['Not in there.']);
  });
});

describe('a continue rule before a default that misses (fast follow)', () => {
  it('is undone with the miss, so the retry starts clean', () => {
    const w: World = {
      ...fixtureWorld,
      events: { ...fixtureWorld.events, mark: [{ set: 'marked' }] },
      rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, instead: { ...fixtureWorld.rooms.bedroom.instead, go: [{ continue: true, then: 'mark' }] } } },
    };
    const s = stateWith(w, { room: 'bedroom' });
    const r = execute({ action: 'go', target: 'northwest' }, { world: w, state: s });
    expect(r.understood).toBe(false);
    expect(s.flags.marked).toBeUndefined();
  });
});

describe('a second object that names nothing here (fast follow)', () => {
  it('is a miss before any rule runs (no rule fires as if no tool had been named)', () => {
    const w: World = {
      ...fixtureWorld,
      events: { ...fixtureWorld.events, wrenched: [{ set: 'wrenched' }, 'Wrenched.'] },
      items: { ...fixtureWorld.items, bed: { ...fixtureWorld.items.bed, instead: { ...fixtureWorld.items.bed?.instead, turn: [{ then: 'wrenched' }] } } },
    };
    const s = stateWith(w, { room: 'bedroom' });
    const r = execute({ action: 'turn', target: 'bed', indirect: 'xyzzy' }, { world: w, state: s });
    expect(r.understood).toBe(false);
    expect(s.flags.wrenched).toBeUndefined();
  });
});
