#!/usr/bin/env node
// The stdio entry point an MCP client launches (`npx -y @brass-lantern/mcp`). Nothing may be
// written to stdout except through the transport: it carries the protocol.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as bundled from '@brass-lantern/engine';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.ts';
import { quietStdout } from './stdio.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
// --root <dir> (repeatable) allows worlds from another directory besides the launch directory.
const roots = [process.cwd()];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1] !== undefined) roots.push(resolve(process.cwd(), args[++i] as string));
}
quietStdout();
const server = createServer({ bundled, roots, docsDir: fileURLToPath(new URL('./docs/', import.meta.url)), cwd: process.cwd(), version: pkg.version });
await server.connect(new StdioServerTransport());
