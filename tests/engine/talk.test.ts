import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse, splitCommands } from '@/engine/parser';
import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const w: World = {
  ...fixtureWorld,
  npcs: {
    ...fixtureWorld.npcs,
    neighbor: {
      ...fixtureWorld.npcs.neighbor,
      topics: { fence: [{ if: 'flag:paid', text: '“Fixed it myself.”' }, { text: '“Needs paint.”' }], dog: '“Not my dog.”' },
      topicAliases: { fence: ['picket'] },
      noTopic: '“Couldn’t say.”',
    },
  },
};
const say = (s: GameState, a: ParsedAction, world: World = w) => execute(a, { world, state: s });

describe('parsing ASK/TELL ABOUT and orders', () => {
  it('reads each phrasing', () => {
    expect(fallbackParse('ask neighbor about the fence')).toEqual({ action: 'ask', target: 'neighbor', indirect: 'the fence' });
    expect(fallbackParse('tell neighbor about my wallet')).toEqual({ action: 'ask', target: 'neighbor', indirect: 'my wallet' });
    expect(fallbackParse('ask neighbor')).toEqual({ action: 'talk', target: 'neighbor' });
    expect(fallbackParse('neighbor, give me the key')).toEqual({ action: 'order', target: 'neighbor', indirect: 'give me the key' });
    expect(fallbackParse('tell the neighbor to leave')).toEqual({ action: 'order', target: 'neighbor', indirect: 'leave' });
    expect(fallbackParse('tell neighbor')).toEqual({ action: 'order', target: 'neighbor' });
  });

  it('keeps an order whole, and lists still split', () => {
    expect(splitCommands('neighbor, give me the key')).toEqual(['neighbor, give me the key']);
    expect(splitCommands('take key, wallet')).toEqual(['take key', 'take wallet']);
    expect(splitCommands('take key and wallet')).toEqual(['take key', 'take wallet']);
  });
});

describe('topics', () => {
  it('answer by topic, with conditions and aliases', () => {
    const s = stateWith(w, { room: 'yard' });
    expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'the fence' }).lines[0]).toBe('“Needs paint.”');
    s.flags.paid = true;
    expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'picket' }).lines[0]).toBe('“Fixed it myself.”');
    expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'dog' }).lines[0]).toBe('“Not my dog.”');
    expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'the moon' }).lines[0]).toBe('“Couldn’t say.”');
  });

  it('without topics, ASK ABOUT is TALK TO', () => {
    const s = stateWith(fixtureWorld, { room: 'yard' });
    expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'the fence' }, fixtureWorld).lines[0]).toBe('“Nice day.”');
  });

  it('asking someone who isn’t here is a miss', () => {
    const s = stateWith(w, { room: 'bedroom' });
    expect(say(s, { action: 'ask', target: 'neighbor', indirect: 'dog' }).understood).toBe(false);
  });
});

describe('orders', () => {
  it('get the character’s rule, its refusal, or “ignores you”', () => {
    const s = stateWith(w, { room: 'yard' });
    expect(say(s, { action: 'order', target: 'neighbor', indirect: 'dance' }).lines[0]).toBe('Neighbor ignores you.');
    const refusing: World = { ...w, npcs: { ...w.npcs, neighbor: { ...w.npcs.neighbor, refuseOrder: '“Not my job.”' } } };
    expect(say(s, { action: 'order', target: 'neighbor', indirect: 'dance' }, refusing).lines[0]).toBe('“Not my job.”');
    const ruled: World = { ...w, npcs: { ...w.npcs, neighbor: { ...w.npcs.neighbor, instead: { order: [{ say: ['He waves you off.'] }] } } } };
    expect(say(s, { action: 'order', target: 'neighbor' }, ruled).lines[0]).toBe('He waves you off.');
  });

  it('an order to someone who isn’t here is a miss', () => {
    const s = stateWith(w, { room: 'bedroom' });
    expect(say(s, { action: 'order', target: 'neighbor', indirect: 'sit' }).understood).toBe(false);
  });
});
