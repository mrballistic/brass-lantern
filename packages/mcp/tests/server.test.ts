import { mkdirSync, readFileSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleDocs } from '../scripts/bundle-docs.ts';
import * as entry from '../src/server.ts';
import { createServer } from '../src/server.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const ENGINE_WORLDS = resolve(import.meta.dirname, '../../engine/src/worlds');
let client: Client;

async function connect(options: Partial<Parameters<typeof createServer>[0]> & { cwd: string }): Promise<Client> {
  const server = createServer({ bundled, version: '0.0.0-test', ...options });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(clientSide);
  return c;
}

beforeAll(async () => {
  const docsDir = mkdtempSync(join(tmpdir(), 'bl-mcp-server-docs-'));
  bundleDocs(docsDir);
  client = await connect({ docsDir, cwd: FIXTURES, roots: [FIXTURES, ENGINE_WORLDS] });
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
    expect(text(thrower)).toMatch(/^World: default in .*throws\.ts\nEngine: @brass-lantern\/engine .*\n\nThe engine threw: .*kaboom/);
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
  it('docs default to the bundle beside the server module (dist/docs when built)', async () => {
    const c = await connect({ cwd: FIXTURES });
    const r = await c.callTool({ name: 'docs', arguments: {} });
    // Run from source there is no src/docs, so the read fails, naming where it looked.
    expect(text(r)).toContain(join(resolve(import.meta.dirname, '../src/docs'), 'pages.json'));
  });
  it('exports quietStdout for an embedder', () => {
    expect(typeof entry.quietStdout).toBe('function');
  });
  it('docs read failure is an error result', async () => {
    const c = await connect({ docsDir: join(tmpdir(), 'bl-mcp-no-such-docs'), cwd: FIXTURES });
    const r = await c.callTool({ name: 'docs', arguments: {} });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/docs bundle couldn’t be read/);
    await c.close();
  });
});

describe('allowed roots', () => {
  const docsDir = tmpdir();
  const audit = async (c: Client, path: string) => c.callTool({ name: 'audit_world', arguments: { path } });
  const outside = mkdtempSync(join(tmpdir(), 'bl-mcp-outside-'));
  writeFileSync(join(outside, 'w.ts'), readFileSync(join(FIXTURES, 'default-world.ts')));
  const inside = mkdtempSync(join(tmpdir(), 'bl-mcp-inside-'));
  mkdirSync(join(inside, 'sub'));
  symlinkSync(join(outside, 'w.ts'), join(inside, 'link.ts'));
  symlinkSync(outside, join(inside, 'dir'));
  writeFileSync(join(inside, 'sub', 'ok.ts'), readFileSync(join(FIXTURES, 'default-world.ts')));

  it('refuses an absolute path outside the roots', async () => {
    const r = await audit(await connect({ docsDir, cwd: inside }), join(outside, 'w.ts'));
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/outside the allowed directories .*--root <dir>/);
  });
  it('refuses a ../ escape', async () => {
    const r = await audit(await connect({ docsDir, cwd: join(inside, 'sub') }), `../../${outside.split('/').pop()}/w.ts`);
    expect(text(r)).toMatch(/outside the allowed directories/);
  });
  it('refuses a symlink that points outside', async () => {
    const c = await connect({ docsDir, cwd: inside });
    expect(text(await audit(c, 'link.ts'))).toMatch(/outside the allowed directories/);
    expect(text(await audit(c, 'dir/w.ts'))).toMatch(/outside the allowed directories/);
  });
  it('accepts paths inside the root and inside an extra root', async () => {
    expect((await audit(await connect({ docsDir, cwd: inside }), 'sub/ok.ts')).isError).toBeFalsy();
    expect((await audit(await connect({ docsDir, cwd: inside, roots: [inside, outside] }), join(outside, 'w.ts'))).isError).toBeFalsy();
  });
});
