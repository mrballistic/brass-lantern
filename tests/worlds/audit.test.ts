import { describe, expect, it } from 'vitest';
import { cartridges } from '@/app.config';
import type { Effect, World } from '@/types/world';
import { auditWorld } from '../helpers/audit';
import { fixtureWorld } from '../fixtures/world';

// Checks the data of every native world this repo has: effects naming things
// that exist, exits going somewhere, no reserved IDs. Mistakes here fail
// silently in play, so they fail loudly here.

const worlds: Array<[string, World]> = [
  ['the fixture world', fixtureWorld],
  ...cartridges.flatMap((c): Array<[string, World]> => (c.kind === 'world' ? [[c.title, c.world]] : [])),
];

describe('world audit', () => {
  it.each(worlds)('%s has no broken references', (_name, world) => {
    expect(auditWorld(world)).toEqual([]);
  });

  it('catches the mistakes it’s for', () => {
    const broken: World = {
      ...fixtureWorld,
      items: { ...fixtureWorld.items, player: { name: 'p', description: '', portable: false, tags: [], home: 'mars' } },
      events: { ...fixtureWorld.events, bad: [{ move: 'unicorn', to: 'nowhere' }, { run: 'missing' }, { teleport: 'x' } as unknown as Effect, { moveNpc: 'ghost', to: 'mars' }, { script: 'nope' }] },
      daemons: [{ if: 'in:bedroom', then: 'absent' }],
    };
    const problems = auditWorld(broken);
    const worse: World = {
      ...fixtureWorld,
      rooms: {
        ...fixtureWorld.rooms,
        yard: {
          ...fixtureWorld.rooms.yard,
          onEnter: [{ if: 'flagg:x', then: 'enter_nowhere' }],
          instead: { take: [{ if: 'in:atlantis', then: 'missing_rule_event' }] },
        },
      },
      items: { ...fixtureWorld.items, wallet: { ...fixtureWorld.items.wallet, onTake: 'missing_take', onUse: [{ if: 'has:unicorn', say: ['x'] }] } },
      npcs: { ...fixtureWorld.npcs, neighbor: { ...fixtureWorld.npcs.neighbor, onGive: { wallet: 'missing_give' } } },
      finale: { ...fixtureWorld.finale!, event: 'missing_finale', epilogue: [{ if: 'visited:mars', then: 'missing_epilogue' }] },
    };
    expect(auditWorld(worse)).toEqual(
      expect.arrayContaining([
        'room yard onEnter: names no event “enter_nowhere”',
        'room yard onEnter: unknown condition “flagg:x”',
        'room yard instead.take: names no event “missing_rule_event”',
        'room yard instead.take: “in:atlantis” names no room “atlantis”',
        'item wallet onTake: names no event “missing_take”',
        'item wallet onUse: “has:unicorn” names no item “unicorn”',
        'npc neighbor onGive: names no event “missing_give”',
        'finale: names no event “missing_finale”',
        'finale epilogue: names no event “missing_epilogue”',
        'finale epilogue: “visited:mars” names no room “mars”',
      ]),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'event bad: move names no item “unicorn”',
        'event bad: move to nowhere “nowhere”',
        'event bad: run names no event “missing”',
        'event bad: moveNpc names no character “ghost”',
        'event bad: moveNpc to nowhere “mars”',
        'event bad: script names no script “nope”',
        expect.stringContaining('unknown effect'),
        'daemon 0: names no event “absent”',
        'item player: home names no room “mars”',
        '“player” is reserved; no room or item may use it',
      ]),
    );
  });
});
