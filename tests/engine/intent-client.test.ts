import { describe, expect, it } from 'vitest';
import { buildContext } from '@/engine/intent-client';
import type { World, WorldVerb } from '@/types/world';
import { fixtureWorld } from '../fixtures/world';

const verb: WorldVerb = { words: ['x'], target: 'none' };

describe('the intent context', () => {
  it('in the dark, names no room and no people', () => {
    const ctx = buildContext(fixtureWorld.rooms.yard, { ...fixtureWorld, rooms: { ...fixtureWorld.rooms, yard: { ...fixtureWorld.rooms.yard, npcs: ['neighbor'] } } }, [], [], true);
    expect(ctx.roomName).toBe('darkness');
    expect(ctx.npcs).toEqual([]);
  });

  it('sends only world verbs the server will accept, so one bad ID can’t break every request', () => {
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`v${i}`, verb]));
    const world: World = { ...fixtureWorld, verbs: { 'hit-snooze': verb, hitSnooze: verb, ring: verb, ...many } };
    const ctx = buildContext(world.rooms.yard, world, [], []);
    expect(ctx.verbs).toContain('ring');
    expect(ctx.verbs).not.toContain('hit-snooze');
    expect(ctx.verbs).not.toContain('hitSnooze');
    expect(ctx.verbs.length).toBe(50);
    expect(ctx.verbs.every((v) => /^[a-z0-9_]{1,48}$/.test(v))).toBe(true);
  });
});
