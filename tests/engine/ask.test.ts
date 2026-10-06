import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fuzzyCandidates } from '@/engine/fuzzy';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('ties', () => {
  const c = [
    { id: 'key', name: 'brass key', aliases: ['key'] },
    { id: 'rusty_key', name: 'rusty key', aliases: ['key'] },
    { id: 'lamp', name: 'lamp' },
  ];
  it('fuzzyCandidates returns every equally good match', () => {
    expect(fuzzyCandidates('key', c).sort()).toEqual(['key', 'rusty_key']);
    expect(fuzzyCandidates('rusty', c)).toEqual(['rusty_key']);
    expect(fuzzyCandidates('rusty key', c)).toEqual(['rusty_key']);
    expect(fuzzyCandidates('trombone', c)).toEqual([]);
  });
  it('an exact ID wins alone when asked to (the intent server answers in IDs)', () => {
    expect(fuzzyCandidates('key', c, { byId: true })).toEqual(['key']);
    expect(fuzzyCandidates('rusty_key', c)).toEqual(['rusty_key']);
  });
});

describe('questions', () => {
  it('asks which one, changing nothing and taking no time', () => {
    const s = stateWith(world, { room: 'living' });
    const before = structuredClone(s);
    const r = execute({ action: 'take', target: 'key' }, { world, state: s });
    expect(r.lines).toEqual(['Which do you mean: the brass key or the rusty key?']);
    expect(r.ask).toMatchObject({ kind: 'which', slot: 'target', candidates: ['key', 'rusty_key'] });
    expect(r.understood).not.toBe(false);
    expect(s).toEqual(before);
  });

  it('Infocom style asks the way Zork does', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'living' });
    expect(execute({ action: 'take', target: 'key' }, { world: w, state: s }).lines).toEqual([
      'Which key do you mean, the rusty key or the brass key?', // Infocom lists newest first
    ]);
  });

  it('asks what, for a missing object or a missing second object', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key'] });
    expect(execute({ action: 'take' }, { world, state: s }).lines).toEqual(['What do you want to take?']);
    expect(execute({ action: 'turn_on' }, { world, state: s }).lines).toEqual(['What do you want to turn on?']);
    const r = execute({ action: 'unlock', target: 'chest' }, { world, state: s });
    expect(r.lines).toEqual(['What do you want to unlock the wooden chest with?']);
    expect(r.ask).toMatchObject({ kind: 'what', slot: 'indirect' });
  });

  it('a target the intent server named by ID isn’t questioned', () => {
    const s = stateWith(world, { room: 'living' });
    execute({ action: 'take', target: 'key', byId: true }, { world, state: s });
    expect(s.locations.key).toBe('player');
  });
});
