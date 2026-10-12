import { resolve } from 'node:path';
import * as bundled from '@brass-lantern/engine';
import { describe, expect, it } from 'vitest';
import { runJob } from '../src/job.ts';

// What each worker runs, run here in-process (V8 coverage can't see inside a worker).
const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const job = (op: 'audit' | 'play', path: string, extra: { commands?: string[]; seed?: number; exportName?: string } = {}) => runJob({ op, path, cwd: FIXTURES, ...extra }, bundled);

describe('runJob', () => {
  it('audits a world', async () => {
    const r = await job('audit', 'audit-problem.ts');
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/^World: default in .*audit-problem\.ts\nEngine: @brass-lantern\/engine/);
    expect(r.text).toMatch(/1 problem:/);
  });
  it('plays commands with a seed', async () => {
    const r = await job('play', 'default-world.ts', { commands: ['look'], seed: 7 });
    expect(r.isError).toBe(false);
    expect(r.text).toContain('Seed: 7');
    expect(r.text).toContain('> look');
  });
  it('play with no commands still reports the opening and the state', async () => {
    const r = await job('play', 'default-world.ts');
    expect(r.text).toContain('Final state:');
  });
  it('a load failure is the loader’s message', async () => {
    const r = await job('audit', 'nope.ts');
    expect(r).toEqual({ isError: true, text: expect.stringMatching(/^nope\.ts: no such file/) });
  });
  it('an engine throw keeps the header', async () => {
    const r = await job('play', 'throws.ts', { commands: ['look'] });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/^World: default in .*throws\.ts\nEngine: .*\n\nThe engine threw: .*kaboom/);
  });
});
