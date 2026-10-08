import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// tests/fixtures/world.ts is a copy of the engine's fixture world (so these
// tests import the engine only by package name). Read as text, not imported.
const worldPart = (file: string) => {
  const text = readFileSync(resolve(import.meta.dirname, file), 'utf8');
  const start = text.indexOf('export const fixtureWorld');
  const end = text.indexOf('/** The fixture game as library options');
  return text.slice(start, end === -1 ? undefined : end).trim();
};

describe('the fixture world copy', () => {
  it('matches the engine’s fixture world', () => {
    const engine = worldPart('../../../engine/tests/fixtures/world.ts');
    expect(engine.length).toBeGreaterThan(1000);
    expect(worldPart('world.ts')).toBe(engine);
  });
});
