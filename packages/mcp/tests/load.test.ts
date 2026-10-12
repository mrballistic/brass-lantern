import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isWorldShaped, loadWorld, WorldLoadError } from '../src/load.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

describe('loadWorld', () => {
  it('takes the default export when it is a world', async () => {
    const loaded = await loadWorld('default-world.ts', undefined, FIXTURES);
    expect(loaded.exportName).toBe('default');
    expect(loaded.world.startRoom).toBe('hall');
    expect(loaded.file).toBe(join(FIXTURES, 'default-world.ts'));
  });
  it('takes a named export when asked', async () => {
    expect((await loadWorld('two-worlds.ts', 'b', FIXTURES)).exportName).toBe('b');
  });
  it('several worlds and no name: an error naming them', async () => {
    await expect(loadWorld('two-worlds.ts', undefined, FIXTURES)).rejects.toThrow(/^two-worlds\.ts: several worlds \(a, b\)/);
  });
  it('an export that is not a world, or missing, is an error', async () => {
    await expect(loadWorld('default-world.ts', 'notAWorld', FIXTURES)).rejects.toThrow(/^default-world\.ts: .*isn’t a world/);
    await expect(loadWorld('default-world.ts', 'nope', FIXTURES)).rejects.toThrow(/^default-world\.ts: no export “nope”/);
  });
  it('no world at all is an error listing the exports', async () => {
    await expect(loadWorld('no-world.ts', undefined, FIXTURES)).rejects.toThrow(/^no-world\.ts: no world-shaped export \(exports: x\)/);
  });
  it('a syntax error comes back as a WorldLoadError naming the file', async () => {
    const error = await loadWorld('broken.ts', undefined, FIXTURES).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorldLoadError);
    expect(String((error as Error).message)).toMatch(/^broken\.ts: /);
  });
  it('a missing file says where it looked; a non-module extension is refused', async () => {
    await expect(loadWorld('missing.ts', undefined, FIXTURES)).rejects.toThrow(`missing.ts: no such file (looked in ${FIXTURES})`);
    await expect(loadWorld('world.json', undefined, FIXTURES)).rejects.toThrow(/^world\.json: .*\.ts, \.mts, \.js or \.mjs/);
  });
  it('sees an edit, in the world or a file it imports, on the next call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bl-mcp-'));
    cpSync(join(FIXTURES, 'uses-helper.ts'), join(dir, 'uses-helper.ts'));
    cpSync(join(FIXTURES, 'helper.ts'), join(dir, 'helper.ts'));
    expect((await loadWorld('uses-helper.ts', undefined, dir)).world.rooms.hall.name).toBe('Hall');
    writeFileSync(
      join(dir, 'helper.ts'),
      "export const HALL = { name: 'Great Hall', description: 'A hall.', exits: {}, items: [], npcs: [], onEnter: [] };\n",
    );
    expect((await loadWorld('uses-helper.ts', undefined, dir)).world.rooms.hall.name).toBe('Great Hall');
  });
  it('sees an edit to a .mjs world, and to a .mjs helper it imports, on the next call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bl-mcp-'));
    const room = (name: string) => `export const HALL = { name: '${name}', description: 'A hall.', exits: {}, items: [], npcs: [], onEnter: [] };\n`;
    const world = (extra: string) =>
      `import { HALL } from './helper.mjs';\nexport default { startRoom: 'hall', rooms: { hall: HALL }, items: {}, npcs: {}, flagLabels: {}${extra} };\n`;
    writeFileSync(join(dir, 'helper.mjs'), room('Hall'));
    writeFileSync(join(dir, 'w.mjs'), world(''));
    expect((await loadWorld('w.mjs', undefined, dir)).world.rooms.hall.name).toBe('Hall');
    writeFileSync(join(dir, 'helper.mjs'), room('Great Hall'));
    expect((await loadWorld('w.mjs', undefined, dir)).world.rooms.hall.name).toBe('Great Hall');
    writeFileSync(join(dir, 'w.mjs'), world(", startRoomNote: 'edited'"));
    expect((await loadWorld('w.mjs', undefined, dir)).world).toHaveProperty('startRoomNote', 'edited');
  });
  it('loads a real world that imports from the engine (the tutorial source)', async () => {
    const tutorial = resolve(import.meta.dirname, '../../engine/src/worlds/tutorial.ts');
    expect((await loadWorld(tutorial, 'tutorial', FIXTURES)).world.startRoom).toBe('cubicle');
  });
  it('isWorldShaped needs rooms, items, npcs and startRoom', () => {
    expect(isWorldShaped({ rooms: {}, items: {}, npcs: {}, startRoom: 'x' })).toBe(true);
    expect(isWorldShaped({ rooms: {}, items: {}, startRoom: 'x' })).toBe(false);
    expect(isWorldShaped(null)).toBe(false);
  });
});
