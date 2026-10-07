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
    const ghostly: World = {
      ...fixtureWorld,
      npcs: {
        ...fixtureWorld.npcs,
        ghost: {
          name: 'ghost',
          description: '',
          combat: { strength: 1, weapon: 'nothing', onDeath: 'missing', fears: { item: 'nope', by: 1 } },
          holds: ['void'],
          descriptions: [{ if: 'flagg:x', text: '' }],
          instead: { take: [{ then: 'gone' }] },
        },
      },
    };
    expect(auditWorld(ghostly)).toEqual(
      expect.arrayContaining([
        'npc ghost combat: weapon names no item “nothing”',
        'npc ghost combat onDeath: names no event “missing”',
        'npc ghost combat fears: names no item “nope”',
        'npc ghost holds: no item “void”',
        'npc ghost descriptions: unknown condition “flagg:x”',
        'npc ghost instead.take: names no event “gone”',
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
        '“player” is reserved; no room, item or character may use it',
      ]),
    );
  });

  it('a scoring condition can’t use the score (5d)', () => {
    const w: World = { ...fixtureWorld, scoring: [{ if: 'score>=1', points: 1 }] };
    expect(auditWorld(w).some((p) => p.includes('score'))).toBe(true);
  });

  it('“number” is reserved like “player” (6a)', () => {
    const w: World = { ...fixtureWorld, items: { ...fixtureWorld.items, number: { name: 'n', description: '', portable: false, tags: [] } } };
    expect(auditWorld(w)).toContain('“number” is reserved; no room, item or character may use it');
  });
});
