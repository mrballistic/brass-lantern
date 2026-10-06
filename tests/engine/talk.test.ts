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

describe('orders (review fixes)', () => {
  it('in the dark, a comma line that isn’t an order to anyone here stays a miss, so the LLM can read it', () => {
    const s = stateWith(w, { room: 'cellar' });
    const parsed = fallbackParse('ok, turn on the lamp')!;
    expect(parsed.action).toBe('order');
    expect(say(s, parsed).understood).toBe(false);
  });

  it('the order’s words aren’t resolved as things: no question about which key', () => {
    const s = stateWith(w, { room: 'yard' });
    s.locations.key = 'yard';
    s.locations.rusty_key = 'yard';
    expect(say(s, { action: 'order', target: 'neighbor', indirect: 'give me the key' }).lines).toEqual(['Neighbor ignores you.']);
  });

  it('only the character addressed answers: another character’s order rule doesn’t fire', () => {
    const ruled: World = { ...w, npcs: { ...w.npcs, guard: { ...w.npcs.guard, instead: { order: [{ say: ['The guard barks.'] }] } } } };
    const s = stateWith(ruled, { room: 'yard' });
    s.npcs = { guard: { room: 'yard' } };
    expect(say(s, { action: 'order', target: 'neighbor', indirect: 'talk to guard' }, ruled).lines).toEqual(['Neighbor ignores you.']);
  });
});

describe('TALK and rules (5c)', () => {
  it('a character’s instead.talk rule answers TALK TO', () => {
    const t: World = { ...fixtureWorld, npcs: { ...fixtureWorld.npcs, guard: { ...fixtureWorld.npcs.guard, instead: { talk: [{ say: ['Fweep!', 'Fweep!'] }] } } } };
    const s = stateWith(t, { room: 'shed' });
    expect(execute({ action: 'talk', target: 'guard' }, { world: t, state: s }).lines).toEqual(['Fweep!', 'Fweep!']);
  });
});

describe('“tell bob to ask about x” (fast follow)', () => {
  it('is an order', () => {
    expect(fallbackParse('tell neighbor to ask about the fence')?.action).toBe('order');
    expect(fallbackParse('tell neighbor about the fence')?.action).toBe('ask');
  });
});

describe('final review fixes (1.12.5)', () => {
  it('ASK X ABOUT a topic with “to” in it stays ASK', () => {
    expect(fallbackParse('ask neighbor about going to the store')).toEqual({ action: 'ask', target: 'neighbor', indirect: 'going to the store' });
    expect(fallbackParse('tell neighbor to ask about the fence')?.action).toBe('order');
  });
});
