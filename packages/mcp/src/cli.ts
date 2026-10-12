#!/usr/bin/env node
// The stdio entry point an MCP client launches (`npx -y @brass-lantern/mcp`). Nothing may be
// written to stdout except through the transport: it carries the protocol.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as bundled from '@brass-lantern/engine';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const server = createServer({ bundled, docsDir: fileURLToPath(new URL('./docs/', import.meta.url)), cwd: process.cwd(), version: pkg.version });
await server.connect(new StdioServerTransport());
