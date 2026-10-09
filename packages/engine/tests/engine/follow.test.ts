import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/engine/game';
import { execute } from '../../src/engine/engine';
import { fallbackParse } from '../../src/engine/parser';
import type { NPC, World } from '../../src/types/world';
import { stateWith } from '../helpers/state';
import { auditWorld } from '../helpers/audit';
import { fixtureWorld } from '../fixtures/world';

const world: World = {
  ...fixtureWorld,
  rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, items: [...fixtureWorld.rooms.bedroom.items, 'lamp'], npcs: ['samir'] } },
  items: { ...fixtureWorld.items, lamp: { name: 'lamp', description: 'A lamp.', portable: true, tags: [] } },
  npcs: { ...fixtureWorld.npcs, samir: { name: 'Samir', description: 'Samir is here.' } },
};
const withNpc = (w: World, id: string, patch: Partial<NPC>): World => ({ ...w, npcs: { ...w.npcs, [id]: { ...w.npcs[id], ...patch } } });
const text = (w: World, input: string) => createGame(w).send(input).lines.join(' ');

describe('FOLLOW (2.1.0)', () => {
  it('parses as a built-in, bare and with a target', () => {
    expect(fallbackParse('follow')).toEqual({ action: 'follow' });
    expect(fallbackParse('follow me')).toEqual({ action: 'follow', target: 'me' });
    expect(fallbackParse('follow the lamp')).toMatchObject({ action: 'follow', target: 'lamp' });
  });
  it('bare FOLLOW asks what to follow', () => {
    expect(text(world, 'follow')).toContain('What do you want to follow?');
  });
  it('FOLLOW a character with no rule points at the order form', () => {
    expect(text(world, 'follow samir')).toBe('You’d rather the Samir came to you. Try SAMIR, FOLLOW ME.');
  });
  it('FOLLOW a character with article "" uses the bare name', () => {
    expect(text(withNpc(world, 'samir', { article: '' }), 'follow samir')).toBe('You’d rather Samir came to you. Try SAMIR, FOLLOW ME.');
  });
  it('FOLLOW a character with a custom article lowercases it mid-sentence', () => {
    const w = withNpc(world, 'samir', { name: 'robot', aliases: ['samir'], article: 'Your' });
    expect(text(w, 'follow robot')).toBe('You’d rather your robot came to you. Try ROBOT, FOLLOW ME.');
  });
  it('FOLLOW a thing', () => {
    expect(text(world, 'follow lamp')).toBe('You can’t follow that.');
  });
  it('FOLLOW something absent is a miss that changes nothing', () => {
    const s = stateWith(world, { room: 'bedroom' });
    const before = JSON.stringify(s);
    const r = execute(fallbackParse('follow zebra')!, { world, state: s });
    expect(r.understood).toBe(false);
    expect(r.lines.join(' ')).toContain('zebra');
    expect(JSON.stringify(s)).toBe(before);
  });
  it('an instead.follow rule on the character wins', () => {
    const w = withNpc(world, 'samir', { instead: { follow: [{ say: ['“Not now.”'] }] } });
    expect(text(w, 'follow samir')).toContain('Not now');
  });
  it('X, FOLLOW ME parses inside orders with no world verb, and orders.follow fires', () => {
    const w = withNpc(world, 'samir', { orders: { follow: [{ say: ['“Okay.”'] }] } });
    expect(text(w, 'samir, follow me')).toContain('Okay');
  });
  it('a world that declares its own follow world verb gets an audit report', () => {
    const w = { ...world, verbs: { follow: { words: ['follow'], target: 'optional' as const } } };
    expect(auditWorld(w).join(' ')).toMatch(/follow/);
  });
});
