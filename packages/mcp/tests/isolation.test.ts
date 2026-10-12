import { resolve } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runInWorker } from '../src/run.ts';
import { createServer, inProcessRunner } from '../src/server.ts';

// Through the server with its default runner: every audit_world and play runs in a fresh worker.
const FIXTURES = resolve(import.meta.dirname, 'fixtures');
let client: Client;

beforeAll(async () => {
  const server = createServer({ version: '0.0.0-test', cwd: FIXTURES, timeoutMs: 1500, timeoutHint: 'Raise the limit with --timeout <seconds>.' });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(clientSide);
});
afterAll(() => client.close());
afterEach(() => vi.restoreAllMocks());

const text = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');
const stillWorks = async () => {
  const ok = await client.callTool({ name: 'audit_world', arguments: { path: 'default-world.ts' } });
  expect(ok.isError).toBeFalsy();
  expect(text(ok)).toMatch(/No problems\./);
};

describe('a world runs in its own worker', () => {
  it('a script that loops forever times out, and the server keeps answering', async () => {
    const started = Date.now();
    const r = await client.callTool({ name: 'play', arguments: { path: 'loops.ts', commands: ['look'] } });
    expect(Date.now() - started).toBeLessThan(1500 + 2000);
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('The world didn’t finish within 1.5 s (a script may loop forever). Raise the limit with --timeout <seconds>.');
    await stillWorks();
  });
  it('a world that calls process.exit() ends only its worker', async () => {
    const r = await client.callTool({ name: 'audit_world', arguments: { path: 'exits.ts' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('The world ended before answering (exit code 3); a world shouldn’t call process.exit() or leave a top-level await pending.');
    await stillWorks();
  });
  it('a world that throws later is a crash or a result, and the server keeps answering', async () => {
    const r = await client.callTool({ name: 'play', arguments: { path: 'throws-later.ts', commands: ['look'] } });
    if (r.isError) expect(text(r)).toMatch(/^The world crashed: (later|rejected)/);
    else expect(text(r)).toContain('Final state:');
    await stillWorks();
  });
  it('a message a world posts itself isn’t taken for the answer', async () => {
    const r = await client.callTool({ name: 'audit_world', arguments: { path: 'posts-junk.ts' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('The world crashed: its worker sent something other than a result.');
    await stillWorks();
  });
  it('a dozen calls at once all answer, with no listener warning', async () => {
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.name);
    process.on('warning', onWarning);
    try {
      const results = await Promise.all(Array.from({ length: 12 }, () => client.callTool({ name: 'audit_world', arguments: { path: 'noisy.ts' } })));
      expect(results.every((r) => !r.isError)).toBe(true);
      await new Promise((r) => setTimeout(r, 700));
    } finally {
      process.off('warning', onWarning);
    }
    expect(warnings).not.toContain('MaxListenersExceededWarning');
  });
  it('a world’s stdout never reaches the protocol', async () => {
    const out = vi.spyOn(process.stdout, 'write');
    const r = await client.callTool({ name: 'audit_world', arguments: { path: 'noisy.ts' } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/No problems\./);
    expect(out.mock.calls.map((c) => String(c[0])).join('')).not.toContain('NOISE');
  });
});

describe('runJob', () => {
  it('replaces the worker, and gets each job with its cwd (the roots are checked first)', async () => {
    const jobs: unknown[] = [];
    const server = createServer({ cwd: FIXTURES, version: '0', runJob: async (job) => (jobs.push(job), { text: 'ran', isError: false }) });
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const c = new Client({ name: 'test', version: '1' });
    await c.connect(clientSide);
    expect(text(await c.callTool({ name: 'play', arguments: { path: 'x.ts', commands: ['look'], seed: 2 } }))).toBe('ran');
    expect(text(await c.callTool({ name: 'audit_world', arguments: { path: '/elsewhere/x.ts' } }))).toMatch(/outside the allowed directories/);
    expect(jobs).toEqual([{ op: 'play', path: 'x.ts', cwd: FIXTURES, commands: ['look'], seed: 2 }]);
    await c.close();
  });
});

describe('runInWorker deadlines', () => {
  const job = { op: 'audit' as const, path: 'default-world.ts', cwd: FIXTURES };
  it('a deadline past setTimeout’s limit (or Infinity) is capped, not fired at once', async () => {
    for (const timeoutMs of [3_000_000_000, Infinity]) {
      const r = await runInWorker(job, { timeoutMs });
      expect(r.isError).toBe(false);
    }
  });
  it('NaN means the default', async () => {
    expect((await runInWorker(job, { timeoutMs: Number.NaN })).isError).toBe(false);
  });
  it('the timeout message ends with a generic hint unless one is given', async () => {
    const loops = { op: 'play' as const, path: 'loops.ts', cwd: FIXTURES, commands: ['look'] };
    expect((await runInWorker(loops, { timeoutMs: 300 })).text).toBe('The world didn’t finish within 0.3 s (a script may loop forever). Raise the server’s timeout.');
    expect((await runInWorker(loops, { timeoutMs: 300, timeoutHint: 'Use a bigger one.' })).text).toMatch(/ Use a bigger one\.$/);
  });
  // `new Worker` throws synchronously for a URL it refuses outright (here: not file:), which only the
  // try/catch around the constructor turns into a result.
  it('a worker that can’t start is a result, not a rejection', async () => {
    const r = await runInWorker(job, { workerUrl: new URL('https://example.com/worker.js') });
    expect(r).toEqual({ isError: true, text: expect.stringMatching(/^The world runner couldn’t start: /) });
  });
  // A worker file that doesn't exist fails asynchronously (an 'error' event), through the crash path.
  it('a missing worker file is a crash result', async () => {
    const r = await runInWorker(job, { workerUrl: new URL('file:///nonexistent/worker.js') });
    expect(r).toEqual({ isError: true, text: expect.stringMatching(/^The world crashed: /) });
  });
  it('createServer rejects a timeout that is not a positive number', () => {
    for (const timeoutMs of [0, -5, Number.NaN]) {
      expect(() => createServer({ version: '0', cwd: FIXTURES, timeoutMs })).toThrow(RangeError);
    }
    expect(() => createServer({ version: '0', cwd: FIXTURES, timeoutMs: 0 })).toThrow('timeoutMs must be a positive number of milliseconds (it is capped at 2147483647)');
    expect(() => createServer({ version: '0', cwd: FIXTURES, timeoutMs: Infinity })).not.toThrow();
  });
});

describe('inProcessRunner and the deprecated bundled', () => {
  it('runs a job in this thread with the engine given', async () => {
    const r = await inProcessRunner(bundled)({ op: 'audit', path: 'audit-problem.ts', cwd: FIXTURES });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/1 problem:/);
  });
  it('bundled without runJob is ignored, with a note written once', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    createServer({ bundled, cwd: FIXTURES, version: '0' });
    createServer({ bundled, cwd: FIXTURES, version: '0' });
    createServer({ bundled, cwd: FIXTURES, version: '0', runJob: inProcessRunner(bundled) });
    const notes = err.mock.calls.map((c) => String(c[0])).filter((t) => t.includes('bundled'));
    expect(notes).toEqual(['brass-lantern-mcp: the bundled option is ignored (each call runs in a worker with this package’s engine); pass runJob: inProcessRunner(engine) to use your engine in-process.\n']);
  });
});
