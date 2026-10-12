import { resolve } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.ts';

// Through the server with its default runner: every audit_world and play runs in a fresh worker.
const FIXTURES = resolve(import.meta.dirname, 'fixtures');
let client: Client;

beforeAll(async () => {
  const server = createServer({ bundled, version: '0.0.0-test', cwd: FIXTURES, timeoutMs: 1500 });
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
    expect(text(r)).toBe('The world ended the process (exit code 3) before answering; a world shouldn’t call process.exit().');
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
