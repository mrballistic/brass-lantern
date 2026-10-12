import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { describe, expect, it } from 'vitest';
import { resolveEngine } from '../src/engine.ts';

/** A scratch project with a world file and, optionally, its own engine package. */
function project(engineSource?: string, exportsField: unknown = { '.': './index.js', './package.json': './package.json' }): string {
  const dir = mkdtempSync(join(tmpdir(), 'bl-mcp-engine-'));
  writeFileSync(join(dir, 'world.ts'), 'export default {};\n');
  if (engineSource !== undefined) {
    const pkg = join(dir, 'node_modules', '@brass-lantern', 'engine');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({ name: '@brass-lantern/engine', version: '9.9.9', type: 'module', exports: exportsField }),
    );
    writeFileSync(join(pkg, 'index.js'), engineSource);
  }
  return join(dir, 'world.ts');
}

describe('resolveEngine', () => {
  it('uses the project’s own engine when it has one', async () => {
    const r = await resolveEngine(project("export const ENGINE_VERSION = '9.9.9'; export function createGame() {} export function auditWorld() { return ['fake']; }"), bundled);
    expect(r.source).toBe('project');
    expect(r.version).toBe('9.9.9');
    expect(r.engine.auditWorld({} as never)).toEqual(['fake']);
  });
  it('falls back to the bundled engine when the project has none', async () => {
    const r = await resolveEngine(project(), bundled);
    expect(r).toMatchObject({ source: 'bundled', version: bundled.ENGINE_VERSION });
    expect(r.note).toBeUndefined();
  });
  it('falls back, with a note, when the project’s engine throws on import', async () => {
    const r = await resolveEngine(project("throw new Error('boom');"), bundled);
    expect(r.source).toBe('bundled');
    expect(r.note).toMatch(/couldn’t load the project’s @brass-lantern\/engine \(boom\)/);
  });
  it('falls back, with a note, when the project’s engine is installed but can’t be resolved', async () => {
    const r = await resolveEngine(project('export {};', { '.': { import: './index.js' } }), bundled);
    expect(r.source).toBe('bundled');
    expect(r.note).toMatch(/^couldn’t resolve the project’s @brass-lantern\/engine \(.+\); used the bundled engine$/);
  });
  it('falls back, with a note, when the project’s engine is installed but its entry file is missing', async () => {
    const r = await resolveEngine(project('export {};', { '.': './missing.js' }), bundled);
    expect(r.source).toBe('bundled');
    expect(r.note).toMatch(/^couldn’t resolve the project’s @brass-lantern\/engine \(.+missing\.js.*\); used the bundled engine$/);
  });
  it('falls back, with a note, when it lacks createGame or auditWorld', async () => {
    const r = await resolveEngine(project("export const ENGINE_VERSION = '0.1.0';"), bundled);
    expect(r.source).toBe('bundled');
    expect(r.note).toMatch(/doesn’t export createGame and auditWorld/);
  });
});
