import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { parseIntent } from './lib.js';
import { intentRoute } from './express.js';

const ctx = {
  roomName: 'Lobby',
  exits: ['north'],
  items: [],
  npcs: [],
  inventory: [],
};

function geminiReply(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseIntent (library entry)', () => {
  it('returns the sanitized action and sends the key only in the header', async () => {
    const fake = vi.fn<typeof fetch>().mockResolvedValue(geminiReply('{"action":"go","target":"North Door"}'));
    const out = await parseIntent('walk north', ctx, { apiKey: 'sekrit-key', models: ['m1'], fetch: fake });
    expect(out).toEqual({ action: 'go', target: 'north_door' });
    const [url, init] = fake.mock.calls[0]!;
    expect(String(url)).not.toContain('sekrit-key');
    expect(String(init!.body)).not.toContain('sekrit-key');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('sekrit-key');
  });

  it('never reads process.env', async () => {
    const realEnv = process.env;
    const throwing = new Proxy({}, {
      get(_t, prop) {
        throw new Error(`process.env.${String(prop)} was read`);
      },
      has() {
        throw new Error('process.env was inspected');
      },
    });
    const fake = vi.fn<typeof fetch>().mockResolvedValue(geminiReply('{"action":"look"}'));
    process.env = throwing as NodeJS.ProcessEnv;
    try {
      const out = await parseIntent('look', ctx, { apiKey: 'k', fetch: fake });
      expect(out).toEqual({ action: 'look' });
    } finally {
      process.env = realEnv;
    }
  });

  it('throws on an empty key', async () => {
    await expect(parseIntent('look', ctx, { apiKey: '' })).rejects.toThrow(/apiKey/);
    await expect(parseIntent('look', ctx, { apiKey: '   ' })).rejects.toThrow(/apiKey/);
  });

  it('keeps the model chain defaults (falls to the next model on 404)', async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(geminiReply('{"action":"theme","target":"Crt Green"}'));
    const out = await parseIntent('make it green', ctx, { apiKey: 'k', fetch: fake });
    expect(out).toEqual({ action: 'theme', target: 'crt-green' });
    expect(String(fake.mock.calls[0]![0])).toContain('gemini-3.5-flash-lite');
    expect(String(fake.mock.calls[1]![0])).toContain('gemini-3.6-flash');
  });

  it('treats models: [] as the defaults, as intentRoute does', async () => {
    const fake = vi.fn<typeof fetch>().mockResolvedValue(geminiReply('{"action":"look"}'));
    const out = await parseIntent('look', ctx, { apiKey: 'k', models: [], fetch: fake });
    expect(out).toEqual({ action: 'look' });
    expect(String(fake.mock.calls[0]![0])).toContain('gemini-3.5-flash-lite');
  });
});

describe('intentRoute', () => {
  it('throws at construction on an empty key', () => {
    expect(() => intentRoute({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('throws at construction unless rateLimitPerMinute is a positive finite number', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '30' as unknown as number]) {
      expect(() => intentRoute({ apiKey: 'k', rateLimitPerMinute: bad })).toThrow(/rateLimitPerMinute/);
    }
    expect(() => intentRoute({ apiKey: 'k', rateLimitPerMinute: 1 })).not.toThrow();
    expect(() => intentRoute({ apiKey: 'k', rateLimitPerMinute: 0.5 })).not.toThrow();
  });

  it('treats models: [] as the defaults', async () => {
    const fake = vi.fn<typeof fetch>().mockResolvedValue(geminiReply('{"action":"look"}'));
    vi.stubGlobal('fetch', fake);
    const res = await request(mount({ models: [] })).post('/api/parse-intent').send({ input: 'look', context: ctx });
    expect(res.status).toBe(200);
    expect(String(fake.mock.calls[0]![0])).toContain('gemini-3.5-flash-lite');
  });

  function mount(options: Partial<Parameters<typeof intentRoute>[0]> = {}) {
    const app = express();
    app.use(express.json());
    app.use('/api', intentRoute({ apiKey: 'k', models: ['m1'], ...options }));
    return app;
  }

  it('answers POST /parse-intent through the mount path', async () => {
    const fake = vi.fn<typeof fetch>().mockResolvedValue(geminiReply('{"action":"take","target":"stapler"}'));
    vi.stubGlobal('fetch', fake);
    const res = await request(mount()).post('/api/parse-intent').send({ input: 'grab it', context: ctx });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ action: 'take', target: 'stapler' });
    expect((fake.mock.calls[0]![1]!.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
  });

  it('keeps the input cap and validation', async () => {
    const fake = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fake);
    const app = mount();
    const long = await request(app).post('/api/parse-intent').send({ input: 'x'.repeat(201), context: ctx });
    expect(long.status).toBe(400);
    const bad = await request(app).post('/api/parse-intent').send({ input: 'look', context: { roomName: 'x' } });
    expect(bad.status).toBe(400);
    expect(fake).not.toHaveBeenCalled();
  });

  it('rate limits per minute', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => geminiReply('{"action":"look"}')));
    const app = mount({ rateLimitPerMinute: 2 });
    const send = () => request(app).post('/api/parse-intent').send({ input: 'look', context: ctx });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const third = await send();
    expect(third.status).toBe(429);
    expect(third.body.fallback).toEqual({ action: 'unknown' });
  });
});
