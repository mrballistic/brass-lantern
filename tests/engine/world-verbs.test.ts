import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse, splitCommands, verbClashes } from '@/engine/parser';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

describe('world verbs', () => {
  it('parse from the world’s words, with and without a target', () => {
    expect(fallbackParse('snooze', world.verbs)).toEqual({ action: 'snooze' });
    expect(fallbackParse('hit the snooze button', world.verbs)).toEqual({ action: 'snooze' });
    expect(fallbackParse('ring bell', world.verbs)).toEqual({ action: 'ring', target: 'bell' });
    expect(fallbackParse('ring the bell', world.verbs)).toEqual({ action: 'ring', target: 'bell' });
    expect(fallbackParse('snooze')).toEqual({ action: 'go', target: 'snooze' });
  });

  it('dispatch to rules on things in reach when they take no target', () => {
    const s = stateWith(world, { room: 'bedroom' });
    const before = structuredClone(s);
    const r = execute({ action: 'snooze' }, { world, state: s });
    expect(r.lines).toEqual(['😴 You hit snooze.']);
    expect(r.understood).not.toBe(false);
    expect(s).toEqual({ ...before, turns: 1, moveCount: 1 });
  });

  it('a room rule wins when its condition holds', () => {
    const s = stateWith(world, { room: 'bedroom', flags: ['alarm_smashed'] });
    s.locations.alarm = null;
    expect(execute({ action: 'snooze' }, { world, state: s }).lines[0]).toContain('nothing left to snooze');
  });

  it('with no matching rule, print the reply and change nothing', () => {
    const s = stateWith(world, { room: 'yard' });
    const r = execute({ action: 'snooze' }, { world, state: s });
    expect(r.lines).toEqual(['There is nothing here to snooze.']);
  });

  it('a go verb moves through the named exit', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['key'] });
    execute({ action: 'wander', target: 'shed' }, { world, state: s });
    expect(s.currentRoom).toBe('shed');
  });

  it('an unknown target for a world verb is a miss that changes nothing', () => {
    const s = stateWith(world, { room: 'yard' });
    const before = structuredClone(s);
    const r = execute({ action: 'ring', target: 'trombone' }, { world, state: s });
    expect(r.understood).toBe(false);
    expect(s).toEqual(before);
  });

  it('a required target that’s missing asks for one', () => {
    const s = stateWith(world, { room: 'yard' });
    expect(execute({ action: 'ring' }, { world, state: s }).lines).toEqual(['What do you want to ring?']);
  });

  it('splitCommands treats world verbs as commands', () => {
    expect(splitCommands('snooze and ring bell', world.verbs)).toEqual(['snooze', 'ring bell']);
  });

  it('reports a world verb word that clashes with a built-in', () => {
    expect(verbClashes({ shut: { words: ['take', 'shove'], target: 'required' } })).toEqual(['take']);
    expect(verbClashes(world.verbs)).toEqual([]);
  });

  it('HELP lists the world’s verbs after the built-ins, and no longer lists SNOOZE as built in', () => {
    const lines = execute({ action: 'help' }, { world, state: stateWith(world) }).lines;
    expect(lines.some((l) => l.startsWith('RING'))).toBe(true);
    expect(lines.find((l) => l.startsWith('SNOOZE'))).toBe('SNOOZE                   hit snooze, hit the snooze button, press snooze');
    expect(lines.join('\n')).not.toContain('liberated');
  });

  it('can be aimed at a character, whose rules answer', () => {
    const w = {
      ...world,
      verbs: { ...world.verbs, salute: { words: ['salute'], target: 'required' as const } },
      npcs: { ...world.npcs, guard: { ...world.npcs.guard, instead: { salute: [{ say: ['The guard salutes back.'] }] } } },
    };
    const s = stateWith(w, { room: 'shed' });
    expect(execute({ action: 'salute', target: 'guard' }, { world: w, state: s }).lines).toEqual(['The guard salutes back.']);
  });

  it('aimed at a person with no rule for it, it’s a miss (the LLM gets a turn)', () => {
    const w = { ...world, verbs: { ...world.verbs, salute: { words: ['salute'], target: 'required' as const } } };
    const s = stateWith(w, { room: 'shed' });
    expect(execute({ action: 'salute', target: 'guard' }, { world: w, state: s }).understood).toBe(false);
  });
});
