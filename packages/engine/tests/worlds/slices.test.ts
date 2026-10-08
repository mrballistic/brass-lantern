// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { World } from '../../src/types/world';
import { sliceRun } from './slices';
import { normalize, openOriginal } from './zsession';

describe('the session harness', () => {
  it('opens Zork II at the Barrow', async () => {
    localStorage.clear();
    const { send } = await openOriginal(1, 'zork2');
    expect(normalize(await send('look'))).toContain('inside the barrow');
  });

  it('opens Zork III at the Endless Stair', async () => {
    localStorage.clear();
    const { send } = await openOriginal(1, 'zork3');
    expect(normalize(await send('look'))).toContain('endless stair');
  });
});

/** A one-room world whose room reads as the original's opening room does. */
async function oneRoom(story: 'zork2' | 'zork3'): Promise<World> {
  localStorage.clear();
  const { send } = await openOriginal(1, story);
  const [name, ...text] = (await send('look')).filter((l) => l.trim());
  return {
    startRoom: 'here',
    rooms: { here: { name: name.replace(/^📍 /, ''), description: text.join(' '), exits: {}, items: [], npcs: [], onEnter: [] } },
    items: {},
    npcs: {},
    events: {},
    dialogue: {},
    flagLabels: {},
    verbs: {},
  } as unknown as World;
}

describe('sliceRun', () => {
  it('plays an empty prefix on both sides and the first replies match', async () => {
    for (const story of ['zork2', 'zork3'] as const) {
      const world = await oneRoom(story);
      const { native, original } = await sliceRun({ name: 'opening', story, prefix: [], seed: 1, world, build: () => {}, commands: ['look'] });
      expect(native).toHaveLength(1);
      expect(normalize(native[0])).toBe(normalize(original[0]));
    }
  });

  it('throws, naming the slice, when the prefix does not reach it', async () => {
    const world = await oneRoom('zork2');
    await expect(
      sliceRun({ name: 'the Frobozz slice', story: 'zork2', prefix: ['look'], seed: 1, world, build: () => {}, commands: ['look'], expect: 'Nowhere Near' }),
    ).rejects.toThrow(/the Frobozz slice[\s\S]*Barrow/i);
  });
});
