import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { docsReport, readDocs } from './docs.ts';
import { resolveEngine, type Engine } from './engine.ts';
import { loadWorld, WorldLoadError, type LoadedWorld } from './load.ts';
import { auditReport, header, MAX_COMMANDS, playReport } from './tools.ts';
import type { ResolvedEngine } from './engine.ts';

export { quietStdout } from './stdio.ts';

export interface ServerOptions {
  /** The engine to use when a world’s project has none of its own. */
  bundled: Engine;
  /** Where the docs bundle is. Default: the one shipped with this package (dist/docs). */
  docsDir?: string;
  /** Relative world paths resolve against this (the client’s launch directory). */
  cwd: string;
  /** Worlds must live inside one of these directories (symlinks resolved). Default: [cwd]. */
  roots?: string[];
  version: string;
}

type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const reply = (text: string, isError = false): Result => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });

const PATH = z.string().min(1).describe('The world module: a .ts, .mts, .js or .mjs file, relative to the directory the server was started in, or absolute.');
const EXPORT = z.string().min(1).optional().describe('Which export is the world. Default: the default export, else the only world-shaped export.');

/**
 * The brass-lantern MCP server, unconnected: pass it a transport. Stdout-based transports also
 * want quietStdout(), so a world’s console output can’t corrupt the protocol.
 *
 * Loading a .mjs or .js world registers a process-wide module resolve hook (once). It only acts
 * on imports made by modules this server loaded under its own ?bl= query, so the rest of the
 * process resolves as before.
 */
export function createServer(options: ServerOptions): McpServer {
  const docsDir = options.docsDir ?? fileURLToPath(new URL('./docs/', import.meta.url));
  const server = new McpServer({ name: 'brass-lantern', version: options.version });

  const real = (p: string): string => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const roots = (options.roots ?? [options.cwd]).map((r) => real(resolve(options.cwd, r)));
  const allowed = (path: string): boolean => {
    const file = real(resolve(options.cwd, path));
    return roots.some((root) => {
      const rel = relative(root, file);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });
  };

  /** Loads the world and its engine, runs `report`, and turns any failure into an error result. */
  async function withWorld(path: string, exportName: string | undefined, report: (loaded: LoadedWorld, resolved: ResolvedEngine) => string): Promise<Result> {
    if (!allowed(path)) return reply(`${path}: outside the allowed directories (${roots.join(', ')}). Start the server with --root <dir> to allow another.`, true);
    let loaded: LoadedWorld;
    try {
      loaded = await loadWorld(path, exportName, options.cwd);
    } catch (error) {
      if (error instanceof WorldLoadError) return reply(error.message, true);
      return reply(`The world couldn’t be loaded: ${error instanceof Error ? error.message : String(error)}`, true);
    }
    let resolved: ResolvedEngine | undefined;
    try {
      resolved = await resolveEngine(loaded.file, options.bundled);
      return reply(report(loaded, resolved));
    } catch (error) {
      const lines = resolved ? [...header(loaded, resolved), ''] : [];
      return reply(`${lines.join('\n')}${lines.length ? '\n' : ''}The engine threw: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  server.registerTool(
    'audit_world',
    {
      title: 'Audit a Brass Lantern world',
      description: 'Checks a world file the way the engine’s auditWorld does: exits that go nowhere, conditions that don’t parse, effects naming things that don’t exist, unmapped flag labels and more. Reports the engine version used.',
      inputSchema: { path: PATH, export: EXPORT },
    },
    ({ path, export: exportName }) => withWorld(path, exportName, auditReport),
  );

  server.registerTool(
    'play',
    {
      title: 'Play commands in a Brass Lantern world',
      description: `Starts a fresh game (seeded, so runs repeat exactly) and types each command, as a player would, with no LLM. Returns the transcript and the final state (room, inventory, flags, score, moves, game over). Each call starts from the beginning; at most ${MAX_COMMANDS} commands.`,
      inputSchema: {
        path: PATH,
        export: EXPORT,
        commands: z.array(z.string()).min(1).describe('Commands to type, in order (e.g. ["open drawer", "take key", "north"]).'),
        seed: z.number().int().optional().describe('Random seed. Default 1.'),
      },
    },
    ({ path, export: exportName, commands, seed }) => withWorld(path, exportName, (loaded, resolved) => playReport(loaded, resolved, commands, seed)),
  );

  server.registerTool(
    'docs',
    {
      title: 'Brass Lantern documentation',
      description: 'The docs for this version: with no arguments, the index of pages; with “page”, one page’s markdown (e.g. reference/world-schema); with “query”, the best-matching sections. If both are given, “page” wins.',
      inputSchema: {
        page: z.string().optional().describe('A page path from the index, e.g. reference/world-schema or guide/building-worlds/recipes.'),
        query: z.string().optional().describe('Words to search the docs for, e.g. "timers fuses".'),
      },
    },
    ({ page, query }) => {
      try {
        const r = docsReport(readDocs(docsDir), { page, query });
        return reply(r.text, r.isError);
      } catch (error) {
        return reply(`The docs bundle couldn’t be read (${error instanceof Error ? error.message : String(error)}).`, true);
      }
    },
  );

  return server;
}
