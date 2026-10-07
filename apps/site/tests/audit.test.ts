import { describe, expect, it } from 'vitest';
import { auditWorld, type World } from '@brass-lantern/engine';
import { cartridges } from '../src/app.config';

// Every native world the site ships passes the engine's audit (the engine's own
// tests audit the fixture world the same way). Mistakes here fail silently in
// play, so they fail loudly here.

const worlds: Array<[string, World]> = cartridges.flatMap((c): Array<[string, World]> =>
  c.kind === 'world' ? [[c.title, c.world]] : [],
);

describe('world audit', () => {
  it.each(worlds)('%s has no broken references', (_name, world) => {
    expect(auditWorld(world)).toEqual([]);
  });
});
