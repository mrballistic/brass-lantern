import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import type { ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const w: World = {
  ...fixtureWorld,
  items: {
    ...fixtureWorld.items,
    book: { ...fixtureWorld.items.book, burnable: true },
    match: { name: 'match', description: 'A match.', portable: true, tags: [], switchable: true, flaming: true },
    torch: { name: 'torch', description: 'A torch.', portable: true, tags: [], flaming: true },
    candle: { name: 'candle', description: 'A candle.', portable: true, tags: [], instead: { burn: [{ with: 'match', say: ['The candle is lit.'] }] } },
    bolt: { name: 'bolt', description: 'A bolt.', portable: false, tags: [] },
  },
};
type S = ReturnType<typeof stateWith>;
const run = (s: S, a: ParsedAction) => execute(a, { world: w, state: s });

describe('BURN', () => {
  it('asks what with, taking no turn, when there is no tool', () => {
    const s = stateWith(w, { room: 'living', carrying: ['book'] });
    const r = run(s, { action: 'burn', target: 'book' });
    expect(r.lines.join(' ')).toMatch(/What do you want to burn the book with\?/);
    expect(s.moveCount).toBe(0);
  });
  it('refuses a tool that isn’t burning, in Zork’s words', () => {
    const s = stateWith(w, { room: 'living', carrying: ['book', 'match'] });
    expect(run(s, { action: 'burn', target: 'book', indirect: 'match' }).lines).toEqual(['With a match??!?']);
  });
  it('burns a burnable thing on the floor with a lit tool', () => {
    const s = stateWith(w, { room: 'living', carrying: ['match'] });
    s.locations.book = 'living';
    s.itemState.match = { on: true };
    expect(run(s, { action: 'burn', target: 'book', indirect: 'match' }).lines).toEqual(['The book catches fire and is consumed.']);
    expect(s.locations.book).toBeNull();
  });
  it('kills a player holding what burns', () => {
    const s = stateWith(w, { room: 'living', carrying: ['book', 'torch'] });
    const r = run(s, { action: 'burn', target: 'book', indirect: 'torch' });
    expect(r.lines[0]).toBe('The book catches fire. Unfortunately, you were holding it at the time.');
    expect(r.lines).toContain('**** You have died ****');
    expect(s.currentRoom).toBe('bedroom');
  });
  it('refuses what can’t burn', () => {
    const s = stateWith(w, { room: 'living', carrying: ['torch'] });
    s.locations.bolt = 'living';
    expect(run(s, { action: 'burn', target: 'bolt', indirect: 'torch' }).lines).toEqual(['You can’t burn a bolt.']);
  });
  it('lets a rule answer first', () => {
    const s = stateWith(w, { room: 'living', carrying: ['candle', 'match'] });
    expect(run(s, { action: 'burn', target: 'candle', indirect: 'match' }).lines).toEqual(['The candle is lit.']);
  });
});

describe('TURN and PLUG with a tool', () => {
  it('have no effect without a rule', () => {
    const s = stateWith(w, { room: 'shed', carrying: ['match'] });
    s.locations.bolt = 'shed';
    expect(run(s, { action: 'turn', target: 'bolt', indirect: 'match' }).lines).toEqual(['This has no effect.']);
    expect(run(s, { action: 'plug', target: 'bolt', indirect: 'match' }).lines).toEqual(['This has no effect.']);
  });
  it('TURN ON with a tool ignores the tool', () => {
    const s = stateWith(w, { room: 'living', carrying: ['lamp', 'match'] });
    run(s, { action: 'turn_on', target: 'lamp', indirect: 'match' });
    expect(s.itemState.lamp?.on).toBe(true);
  });
});

describe('BURN’s refusal in brass (fast follow)', () => {
  it('uses the right article', async () => {
    const { fixtureWorld } = await import('../fixtures/world');
    const { stateWith } = await import('../helpers/state');
    const { execute } = await import('@/engine/engine');
    const w = { ...fixtureWorld, items: { ...fixtureWorld.items, apple: { name: 'apple', description: '', portable: true, tags: [] }, torch2: { name: 'torch', description: '', portable: true, tags: [], flaming: true, light: true, switchable: true } } };
    const s = stateWith(w, { room: 'bedroom', carrying: ['apple'] });
    expect(execute({ action: 'burn', target: 'bed', indirect: 'apple' }, { world: w, state: s }).lines.join(' ')).toContain('an apple');
  });
});
