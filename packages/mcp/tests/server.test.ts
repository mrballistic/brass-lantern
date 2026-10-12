import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleDocs } from '../scripts/bundle-docs.ts';
import { createServer } from '../src/server.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');
let client: Client;

beforeAll(async () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'bl-mcp-server-docs-'));
  bundleDocs(docsDir);
  const server = createServer({ bundled, docsDir, cwd: FIXTURES, version: '0.0.0-test' });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(clientSide);
});
afterAll(() => client.close());

const text = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');

describe('the MCP server', () => {
  it('lists the three tools with their inputs', async () => {
    const tools = (await client.listTools()).tools.map((t) => [t.name, Object.keys(t.inputSchema.properties ?? {}).sort()]);
    expect(tools).toEqual([
      ['audit_world', ['export', 'path']],
      ['play', ['commands', 'export', 'path', 'seed']],
      ['docs', ['page', 'query']],
    ]);
  });
  it('audit_world on a world with a problem', async () => {
    const r = await client.callTool({ name: 'audit_world', arguments: { path: 'audit-problem.ts' } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/1 problem:/);
  });
  it('play drives the tutorial (path relative to cwd, by export name)', async () => {
    const r = await client.callTool({
      name: 'play',
      arguments: { path: '../../../engine/src/worlds/tutorial.ts', export: 'tutorial', commands: ['open drawer', 'take stapler', 'north', 'take mug and give mug to gary', 'talk to gary', 'north', 'smash machine with stapler'] },
    });
    expect(text(r)).toContain('"gameOver": true');
  });
  it('a broken world is an error result, and the server keeps working', async () => {
    const bad = await client.callTool({ name: 'audit_world', arguments: { path: 'broken.ts' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/^broken\.ts: /);
    const thrower = await client.callTool({ name: 'play', arguments: { path: 'throws.ts', commands: ['look'] } });
    expect(thrower.isError).toBe(true);
    expect(text(thrower)).toMatch(/The engine threw: .*kaboom/);
    const ok = await client.callTool({ name: 'audit_world', arguments: { path: 'default-world.ts' } });
    expect(ok.isError).toBeFalsy();
  });
  it('bad arguments are refused by the schema', async () => {
    const r = await client.callTool({ name: 'play', arguments: { path: 'default-world.ts', commands: [] } });
    expect(r.isError).toBe(true);
  });
  it('docs answers from the bundle', async () => {
    expect(text(await client.callTool({ name: 'docs', arguments: { page: 'reference/world-schema' } }))).toContain('typoReplies');
  });
});
