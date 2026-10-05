import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('VERBOSE, BRIEF, SUPERBRIEF', () => {
  it('parse as built-in verbs', () => {
    expect(fallbackParse('verbose')).toEqual({ action: 'verbose' });
    expect(fallbackParse('brief')).toEqual({ action: 'brief' });
    expect(fallbackParse('superbrief')).toEqual({ action: 'superbrief' });
  });

  it('reply, and change what revisits show', () => {
    const s = stateWith(world);
    const go = (t: string) => execute({ action: 'go', target: t }, { world, state: s }).lines;
    expect(execute({ action: 'brief' }, { world, state: s }).lines).toEqual(['[Brief descriptions.]']);
    expect(go('west')).toContain('A living room with a table by the door.');
    go('east');
    expect(go('west')).not.toContain('A living room with a table by the door.');
    expect(execute({ action: 'superbrief' }, { world, state: s }).lines).toEqual(['[Room names only.]']);
    expect(execute({ action: 'look' }, { world, state: s }).lines).toContain('A living room with a table by the door.');
    expect(execute({ action: 'verbose' }, { world, state: s }).lines).toEqual(['[Full descriptions.]']);
    expect(go('east')).toContain('A small bedroom.');
  });

  it('Infocom style replies the way Zork does', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w);
    expect(execute({ action: 'verbose' }, { world: w, state: s }).lines).toEqual(['Maximum verbosity.']);
    expect(execute({ action: 'brief' }, { world: w, state: s }).lines).toEqual(['Brief descriptions.']);
    expect(execute({ action: 'superbrief' }, { world: w, state: s }).lines).toEqual(['Superbrief descriptions.']);
  });
});
