import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import '../test-setup.js';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

// Imported after the stub so the Gemini client sees the mocked fetch.
const { app } = await import('../index.js');

function geminiReply(text: string, finishReason = 'STOP'): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function makeContext() {
  return {
    roomName: 'Lobby',
    exits: ['cubicle_farm', 'break_room', 'east', 'outside'],
    items: [],
    npcs: [],
    inventory: ['wallet'],
  };
}

function post(body: unknown) {
  return request(app).post('/api/parse-intent').send(body as object);
}

describe('POST /api/parse-intent', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when input is missing', async () => {
    const res = await post({ context: makeContext() });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/input/i);
  });

  it('returns 400 when context is malformed', async () => {
    const res = await post({ input: 'go north', context: { roomName: 'x' } });
    expect(res.status).toBe(400);
  });

  it('rejects oversized input without calling Gemini', async () => {
    const res = await post({ input: 'x'.repeat(201), context: makeContext() });
    expect(res.status).toBe(400);
    expect(res.body.fallback).toEqual({ action: 'unknown' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized context', async () => {
    const ctx = { ...makeContext(), items: Array.from({ length: 51 }, (_, i) => `item${i}`) };
    const res = await post({ input: 'look', context: ctx });
    expect(res.status).toBe(400);
  });

  it('happy path returns the parsed action', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"action":"go","target":"cubicle_farm"}'));
    const res = await post({ input: 'walk to the cubicles', context: makeContext() });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ action: 'go', target: 'cubicle_farm' });
  });

  it('sends the key in a header, never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"action":"look"}'));
    await post({ input: 'look around', context: makeContext() });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('test-gemini-key');
    expect(String(url)).toContain('/models/test-primary:generateContent');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key');
  });

  it('never echoes the key in the response, even on upstream errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('API key not valid: test-gemini-key', { status: 400 }));
    const res = await post({ input: 'look around', context: makeContext() });
    expect(JSON.stringify(res.body)).not.toContain('test-gemini-key');
    expect(res.body).toEqual({ action: 'unknown' });
  });

  it('falls through to the next model on 404 and 5xx', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(geminiReply('{"action":"take","target":"stapler"}'));
    const res = await post({ input: 'grab the stapler', context: makeContext() });
    expect(res.body).toEqual({ action: 'take', target: 'stapler' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a stalled first model still leaves time for the fallback', async () => {
    const { parseIntent } = await import('../llm.js');
    const stall = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const impl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(stall)
      .mockResolvedValueOnce(geminiReply('{"action":"inventory"}'));
    const started = Date.now();
    const out = await parseIntent('check my pockets', makeContext(), {
      models: ['slow', 'fast'],
      timeoutMs: 1_000,
      attemptMs: 100,
      fetchImpl: impl,
    });
    expect(out).toEqual({ action: 'inventory' });
    expect(impl).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeLessThan(900);
  });

  it('gives up at the overall deadline', async () => {
    const { parseIntent } = await import('../llm.js');
    const stall = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const out = await parseIntent('look', makeContext(), {
      models: ['a', 'b'],
      timeoutMs: 150,
      attemptMs: 100,
      fetchImpl: vi.fn<typeof fetch>().mockImplementation(stall),
    });
    expect(out).toEqual({ action: 'unknown' });
  });

  it('stops the chain on 401/403 (a bad key fails every model)', async () => {
    fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));
    const res = await post({ input: 'look', context: makeContext() });
    expect(res.body).toEqual({ action: 'unknown' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns {action:"unknown"} on malformed JSON from Gemini (with 200)', async () => {
    fetchMock.mockResolvedValue(geminiReply('not json at all'));
    const res = await post({ input: 'do something weird', context: makeContext() });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ action: 'unknown' });
  });

  it('returns {action:"unknown"} on network errors', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    const res = await post({ input: 'go north', context: makeContext() });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ action: 'unknown' });
  });

  it('rejects truncated output', async () => {
    fetchMock.mockResolvedValue(geminiReply('{"action":"go"', 'MAX_TOKENS'));
    const res = await post({ input: 'go', context: makeContext() });
    expect(res.body).toEqual({ action: 'unknown' });
  });

  it('drops actions outside the vocabulary and non-identifier targets', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"action":"narrate","target":"x"}'));
    expect((await post({ input: 'tell me a story', context: makeContext() })).body).toEqual({
      action: 'unknown',
    });
    fetchMock.mockResolvedValueOnce(
      geminiReply('{"action":"examine","target":"You see a dragon. It speaks!"}'),
    );
    expect((await post({ input: 'look at it', context: makeContext() })).body).toEqual({
      action: 'examine',
    });
  });

  it('normalizes spaced and dashed targets to snake_case', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"action":"take","target":"Red Mug"}'));
    const res = await post({ input: 'take the red mug', context: makeContext() });
    expect(res.body).toEqual({ action: 'take', target: 'red_mug' });
  });

  it('passes a sanitized indirect object through', async () => {
    fetchMock.mockResolvedValueOnce(
      geminiReply('{"action":"give","target":"red_mug","indirect":"Gary"}'),
    );
    const res = await post({ input: 'hand gary his stapler', context: makeContext() });
    expect(res.body).toEqual({ action: 'give', target: 'red_mug', indirect: 'gary' });
  });

  it('accepts a world verb named in the context, and drops one that isn’t', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"action":"pray"}'));
    const ok = await post({ input: 'say a prayer', context: { ...makeContext(), verbs: ['pray'] } });
    expect(ok.body).toEqual({ action: 'pray' });
    fetchMock.mockResolvedValueOnce(geminiReply('{"action":"pray"}'));
    const dropped = await post({ input: 'say a prayer', context: makeContext() });
    expect(dropped.body).toEqual({ action: 'unknown' });
  });

  it('offers world verbs to the model', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"action":"pray"}'));
    await post({ input: 'say a prayer', context: { ...makeContext(), verbs: ['pray'] } });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.generationConfig.responseSchema.properties.action.enum).toContain('pray');
    expect(body.systemInstruction.parts[0].text).toContain('World verbs');
  });

  it('rejects a context whose verbs aren’t identifiers or are too many', async () => {
    const bad = await post({ input: 'pray', context: { ...makeContext(), verbs: ['Pray Now!'] } });
    expect(bad.status).toBe(400);
    const many = await post({ input: 'pray', context: { ...makeContext(), verbs: Array.from({ length: 51 }, (_, i) => `v${i}`) } });
    expect(many.status).toBe(400);
    const notList = await post({ input: 'pray', context: { ...makeContext(), verbs: 'pray' } });
    expect(notList.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores thought parts in the reply', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: 'thinking...', thought: true }, { text: '{"action":"look"}' }] },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const res = await post({ input: 'look around', context: makeContext() });
    expect(res.body).toEqual({ action: 'look' });
  });

  it('does not send CORS headers', async () => {
    fetchMock.mockResolvedValueOnce(geminiReply('{"action":"look"}'));
    const res = await post({ input: 'look', context: makeContext() }).set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('returns 429 with a fallback once a client exceeds the per-minute cap', async () => {
    const { rateLimit } = await import('../rate-limit.js');
    const express = (await import('express')).default;
    const mini = express();
    mini.use(rateLimit(2));
    mini.get('/', (_req, res) => {
      res.json({ ok: true });
    });
    expect((await request(mini).get('/')).status).toBe(200);
    expect((await request(mini).get('/')).status).toBe(200);
    const third = await request(mini).get('/');
    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toBeDefined();
    expect(third.body.fallback).toEqual({ action: 'unknown' });
  });
});

describe('clientKey', () => {
  it('buckets IPv6 by /64 and unwraps IPv4-mapped addresses', async () => {
    const { clientKey } = await import('../rate-limit.js');
    expect(clientKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(clientKey('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(clientKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(clientKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(clientKey('203.0.113.9')).toBe('203.0.113.9');
    expect(clientKey(undefined)).toBe('unknown');
  });

  it('enforces the global ceiling across clients', async () => {
    const { rateLimit } = await import('../rate-limit.js');
    const express = (await import('express')).default;
    const mini = express();
    mini.set('trust proxy', true);
    mini.use(rateLimit(100, 3));
    mini.get('/', (_req, res) => {
      res.json({ ok: true });
    });
    const from = (ip: string) => request(mini).get('/').set('X-Forwarded-For', ip);
    expect((await from('198.51.100.1')).status).toBe(200);
    expect((await from('198.51.100.2')).status).toBe(200);
    expect((await from('198.51.100.3')).status).toBe(200);
    expect((await from('198.51.100.4')).status).toBe(429);
  });

  it('does not let one over-limit client exhaust the global ceiling', async () => {
    const { rateLimit } = await import('../rate-limit.js');
    const express = (await import('express')).default;
    const mini = express();
    mini.set('trust proxy', true);
    mini.use(rateLimit(1, 3));
    mini.get('/', (_req, res) => {
      res.json({ ok: true });
    });
    const from = (ip: string) => request(mini).get('/').set('X-Forwarded-For', ip);
    expect((await from('198.51.100.1')).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await from('198.51.100.1')).status).toBe(429);
    expect((await from('198.51.100.2')).status).toBe(200);
    expect((await from('198.51.100.3')).status).toBe(200);
  });
});

describe('GET /health', () => {
  it('responds 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('unknown route', () => {
  it('returns JSON 404, not HTML', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
