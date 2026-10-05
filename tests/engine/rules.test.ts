import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

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
    expect(run(s, 'take', 'key').lines).toContain('📎 The key is cold.');
    run(s, 'drop', 'key');
    expect(run(s, 'take', 'key').lines).not.toContain('📎 The key is cold.');
  });
});
