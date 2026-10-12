import { resolve } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../src/load.ts';
import { auditReport, MAX_COMMANDS, MAX_LINES, playReport } from '../src/tools.ts';
import type { ResolvedEngine } from '../src/engine.ts';

const ENGINE: ResolvedEngine = { engine: bundled, version: bundled.ENGINE_VERSION, source: 'bundled' };
const TUTORIAL = resolve(import.meta.dirname, '../../engine/src/worlds/tutorial.ts');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const WIN = ['open drawer', 'take stapler', 'north', 'take mug and give mug to gary', 'talk to gary', 'north', 'smash machine with stapler'];

describe('auditReport', () => {
  it('a clean world: the engine used, the size and “No problems.”', async () => {
    const text = auditReport(await loadWorld(TUTORIAL, 'tutorial', FIXTURES), ENGINE);
    expect(text).toContain(`Engine: @brass-lantern/engine ${bundled.ENGINE_VERSION} (bundled with the MCP server)`);
    expect(text).toMatch(/Size: \d+ rooms, \d+ items, \d+ characters?, \d+ events/);
    expect(text).toContain('No problems.');
  });
  it('lists each problem', async () => {
    const loaded = await loadWorld('audit-problem.ts', undefined, FIXTURES);
    const text = auditReport(loaded, ENGINE);
    expect(text).toMatch(/1 problem:\n- .*nowhere/);
  });
  it('says when the project’s engine was used, and carries a fallback note', async () => {
    const loaded = await loadWorld(TUTORIAL, 'tutorial', FIXTURES);
    expect(auditReport(loaded, { ...ENGINE, source: 'project', version: '2.2.0' })).toContain('2.2.0 (the project’s)');
    expect(auditReport(loaded, { ...ENGINE, note: 'used the bundled engine' })).toContain('Note: used the bundled engine');
  });
});

describe('playReport', () => {
  it('plays the tutorial to its ending, as its own test does', async () => {
    const text = playReport(await loadWorld(TUTORIAL, 'tutorial', FIXTURES), ENGINE, WIN);
    expect(text).toContain('> smash machine with stapler');
    expect(text).toContain('[Score: 50 of 50');
    expect(text).toContain('"gameOver": true');
    expect(text).toContain('"score": 50');
  });
  it('is the same every run with the same seed', async () => {
    const loaded = await loadWorld(TUTORIAL, 'tutorial', FIXTURES);
    expect(playReport(loaded, ENGINE, ['look', 'wait'], 7)).toBe(playReport(loaded, ENGINE, ['look', 'wait'], 7));
  });
  it('marks lines the parser can’t read, but not answers to the game’s own question', async () => {
    const loaded = await loadWorld('ambiguous.ts', undefined, FIXTURES);
    const text = playReport(loaded, ENGINE, ['frobnicate the thing', 'take key', 'rusty']);
    expect(text).toMatch(/> frobnicate the thing\n\[not understood by the parser/);
    expect(text).toMatch(/Which do you mean/);
    expect(text).not.toMatch(/> rusty\n\[not understood/);
  });
  it('stops at game over and says how many commands ran', async () => {
    const text = playReport(await loadWorld(TUTORIAL, 'tutorial', FIXTURES), ENGINE, [...WIN, 'look', 'look']);
    expect(text).toContain(`Game over after ${WIN.length} of ${WIN.length + 2} commands.`);
  });
  it('caps commands and lines', async () => {
    const loaded = await loadWorld(TUTORIAL, 'tutorial', FIXTURES);
    const text = playReport(loaded, ENGINE, Array.from({ length: MAX_COMMANDS + 5 }, () => 'look'));
    expect(text).toContain(`Only the first ${MAX_COMMANDS} commands ran.`);
    expect(text).toMatch(new RegExp(`\\[… \\d+ more lines cut \\(over ${MAX_LINES}\\)\\]`));
  });
});
