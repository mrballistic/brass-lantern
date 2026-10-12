#!/usr/bin/env node
// The stdio entry point an MCP client launches (`npx -y @brass-lantern/mcp`). Nothing may be
// written to stdout except through the transport: it carries the protocol.
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.ts';
import { keepRunningOnCrash, parseRoots, parseTimeout, quietStdout } from './stdio.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
// Each audit_world and play runs in its own worker (stdout piped to stderr); these two are a
// second layer, for anything that still runs on the main thread.
quietStdout();
// A world's late throw (a timer, a stray promise) is logged to stderr instead of ending the server.
keepRunningOnCrash();
// --root <dir> (repeatable) allows worlds from another directory besides the launch directory.
const roots = parseRoots(process.argv.slice(2), process.cwd());
// --timeout <seconds> bounds one audit_world or play call (default 10).
const timeoutMs = parseTimeout(process.argv.slice(2));
const server = createServer({ roots, cwd: process.cwd(), timeoutMs, version: pkg.version });
await server.connect(new StdioServerTransport());
