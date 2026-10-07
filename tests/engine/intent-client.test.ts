import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContext, parseIntentRemote } from '@/engine/intent-client';
import type { World, WorldVerb } from '@/types/world';
import { fixtureWorld } from '../fixtures/world';

const opts = { endpoint: '/api/parse-intent' };
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

describe('the intent client reply', () => {
  const reply = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  const ctx = { roomName: 'x', exits: [], items: [], npcs: [], inventory: [], verbs: [] };

  afterEach(() => vi.unstubAllGlobals());

  it('passes a number and a preposition through', async () => {
    reply({ action: 'turn', target: 'dial', indirect: 'number', number: 4 });
    expect(await parseIntentRemote('set dial to 4', ctx, opts)).toEqual({ action: 'turn', target: 'dial', indirect: 'number', number: 4 });
    reply({ action: 'put', target: 'mat', indirect: 'door', prep: 'under' });
    expect(await parseIntentRemote('slide mat under door', ctx, opts)).toEqual({ action: 'put', target: 'mat', indirect: 'door', prep: 'under' });
  });

  it('passes a push direction through and drops an invalid one', async () => {
    reply({ action: 'push', target: 'box', direction: 'north' });
    expect(await parseIntentRemote('push box north', ctx, opts)).toEqual({ action: 'push', target: 'box', direction: 'north' });
    reply({ action: 'push', target: 'box', direction: 'sideways' });
    expect(await parseIntentRemote('x', ctx, opts)).toEqual({ action: 'push', target: 'box' });
  });

  it('drops a preposition or number the engine would not know', async () => {
    reply({ action: 'put', target: 'mat', prep: 'sideways', number: '4' });
    expect(await parseIntentRemote('x', ctx, opts)).toEqual({ action: 'put', target: 'mat' });
    reply({ action: 'turn', number: 1001 });
    expect(await parseIntentRemote('x', ctx, opts)).toEqual({ action: 'turn' });
  });

  it('drops a number no slot reads', async () => {
    reply({ action: 'take', target: 'lamp', number: 4 });
    expect(await parseIntentRemote('x', ctx, opts)).toEqual({ action: 'take', target: 'lamp' });
    reply({ action: 'turn', target: '4', indirect: 'dial', number: 4 });
    expect(await parseIntentRemote('x', ctx, opts)).toEqual({ action: 'turn', target: '4', indirect: 'dial', number: 4 });
  });
});

describe('the intent client options', () => {
  const ctx = { roomName: 'x', exits: [], items: [], npcs: [], inventory: [], verbs: [] };

  it('posts to the endpoint it is given, with the fetch it is given', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ action: 'take', target: 'lamp' }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await parseIntentRemote('x', ctx, { endpoint: 'https://e/x', fetch: fakeFetch });
    expect(out).toEqual({ action: 'take', target: 'lamp' });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('https://e/x');
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ input: 'x', context: ctx });
  });

  it('gives up after timeoutMs when the fetch never resolves', async () => {
    const hang = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const started = Date.now();
    expect(await parseIntentRemote('x', ctx, { endpoint: 'https://e/x', fetch: hang, timeoutMs: 30 })).toEqual({ action: 'unknown' });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
