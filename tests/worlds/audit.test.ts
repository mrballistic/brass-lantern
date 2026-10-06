import { describe, expect, it } from 'vitest';
import { cartridges } from '@/app.config';
import { conditionProblems } from '@/engine/conditions';
import { verbClashes } from '@/engine/parser';
import type { Effect, EventStep, Rule, RuleTable, World } from '@/types/world';
import { fixtureWorld } from '../fixtures/world';

// Checks the data of every native world this repo has: effects naming things
// that exist, exits going somewhere, no reserved IDs. Mistakes here fail
// silently in play, so they fail loudly here.

const EFFECT_KINDS = new Set([
  'say', 'set', 'clear', 'move', 'open', 'close', 'lock', 'unlock', 'switch', 'add', 'setVar', 'score',
  'go', 'schedule', 'cancel', 'chance', 'run', 'die', 'end',
]);

export function auditWorld(world: World): string[] {
  const problems: string[] = [];
  const isItem = (id: string) => id in world.items;
  const isRoom = (id: string) => id in world.rooms;
  const isEvent = (id: string) => id in world.events;

  const checkSteps = (steps: EventStep[], where: string) => {
    for (const step of steps) {
      if (typeof step === 'string') continue;
      const kind = Object.keys(step).find((k) => EFFECT_KINDS.has(k));
      if (!kind) {
        problems.push(`${where}: unknown effect ${JSON.stringify(step)}`);
        continue;
      }
      const e = step as Effect & Record<string, unknown>;
      const target = e[kind] as unknown;
      if (['open', 'close', 'lock', 'unlock', 'switch'].includes(kind) && !isItem(target as string)) problems.push(`${where}: ${kind} names no item “${target}”`);
      if (kind === 'move') {
        if (!isItem(e.move as string)) problems.push(`${where}: move names no item “${e.move}”`);
        const to = e.to as string | null;
        if (to !== null && to !== 'player' && !isItem(to) && !isRoom(to)) problems.push(`${where}: move to nowhere “${to}”`);
      }
      if (['run', 'schedule', 'cancel'].includes(kind) && !isEvent(target as string)) problems.push(`${where}: ${kind} names no event “${target}”`);
      if (kind === 'go' && !isRoom(target as string)) problems.push(`${where}: go names no room “${target}”`);
      if (kind === 'end' && !world.endings?.[target as string]) problems.push(`${where}: end names no ending “${target}”`);
      if (kind === 'chance') {
        checkSteps((e.then as EventStep[]) ?? [], `${where} (chance)`);
        checkSteps((e.else as EventStep[]) ?? [], `${where} (chance)`);
      }
    }
  };

  for (const [key, steps] of Object.entries(world.events)) checkSteps(steps, `event ${key}`);
  for (const [i, d] of (world.daemons ?? []).entries()) {
    if (typeof d.then === 'string') {
      if (!isEvent(d.then)) problems.push(`daemon ${i}: names no event “${d.then}”`);
    } else checkSteps(d.then, `daemon ${i}`);
  }
  for (const [id, e] of Object.entries(world.endings ?? {})) {
    checkSteps(e.lines, `ending ${id}`);
    checkSteps(e.footer ?? [], `ending ${id}`);
  }
  checkSteps(world.darkness?.blunder ?? [], 'darkness.blunder');

  const d = world.death;
  if (d?.respawn && !isRoom(d.respawn)) problems.push(`death.respawn names no room “${d.respawn}”`);
  for (const r of d?.scatter ?? []) if (!isRoom(r)) problems.push(`death.scatter names no room “${r}”`);
  for (const [id, item] of Object.entries(world.items)) {
    if (item.home && !isRoom(item.home)) problems.push(`item ${id}: home names no room “${item.home}”`);
    for (const c of item.contains ?? []) if (!isItem(c)) problems.push(`item ${id}: contains no item “${c}”`);
  }
  if ('player' in world.items || 'player' in world.rooms) problems.push('“player” is reserved; no room or item may use it');

  for (const [id, room] of Object.entries(world.rooms)) {
    for (const i of [...room.items, ...(room.scenery ?? [])]) if (!isItem(i)) problems.push(`room ${id}: no item “${i}”`);
    for (const [label, exit] of Object.entries(room.exits)) {
      const to = typeof exit === 'string' ? exit : exit.to;
      if (to && !isRoom(to)) problems.push(`room ${id}: exit ${label} goes nowhere (“${to}”)`);
      if (typeof exit !== 'string' && exit.door && !isItem(exit.door)) problems.push(`room ${id}: exit ${label} has no door “${exit.door}”`);
    }
  }
  // Rules, triggers and the finale: the events they name, and their conditions.
  const checkEvent = (key: string | undefined, where: string) => {
    if (key !== undefined && !isEvent(key)) problems.push(`${where}: names no event “${key}”`);
  };
  const checkCondition = (condition: string | undefined, where: string) => {
    if (condition !== undefined) for (const p of conditionProblems(condition, world)) problems.push(`${where}: ${p}`);
  };
  const checkRules = (rules: Rule[] | undefined, where: string) => {
    for (const r of rules ?? []) {
      checkEvent(r.then, where);
      checkCondition(r.if, where);
    }
  };
  const checkTable = (table: RuleTable | undefined, kind: string, where: string) => {
    for (const [verb, rules] of Object.entries(table ?? {})) checkRules(rules, `${where} ${kind}.${verb}`);
  };
  const checkTriggers = (triggers: Array<{ if: string; then: string }>, where: string) => {
    for (const t of triggers) {
      checkEvent(t.then, where);
      checkCondition(t.if, where);
    }
  };
  for (const [id, room] of Object.entries(world.rooms)) {
    checkTriggers(room.onEnter, `room ${id} onEnter`);
    checkTable(room.instead, 'instead', `room ${id}`);
    checkTable(room.after, 'after', `room ${id}`);
    checkCondition(room.requires, `room ${id} requires`);
    for (const [label, exit] of Object.entries(room.exits)) {
      if (typeof exit === 'string') continue;
      checkCondition(exit.if, `room ${id} exit ${label}`);
      for (const d of exit.denials ?? []) checkCondition(d.if, `room ${id} exit ${label}`);
    }
  }
  for (const [id, item] of Object.entries(world.items)) {
    checkTable(item.instead, 'instead', `item ${id}`);
    checkTable(item.after, 'after', `item ${id}`);
    checkRules(item.onUse, `item ${id} onUse`);
    checkEvent(item.onTake, `item ${id} onTake`);
    checkEvent(item.onSmash, `item ${id} onSmash`);
    checkEvent(item.onWear, `item ${id} onWear`);
  }
  for (const [id, npc] of Object.entries(world.npcs)) {
    for (const key of Object.values(npc.onGive ?? {})) checkEvent(key, `npc ${id} onGive`);
  }
  for (const [i, d] of (world.daemons ?? []).entries()) checkCondition(d.if, `daemon ${i}`);
  for (const h of world.hints ?? []) checkCondition(h.if, 'hint');
  for (const s of world.scoring ?? []) checkCondition(s.if, 'scoring');
  if (world.finale) {
    checkEvent(world.finale.event, 'finale');
    checkEvent(world.finale.bareHanded, 'finale');
    checkTriggers(world.finale.epilogue, 'finale epilogue');
  }
  if (!isRoom(world.startRoom)) problems.push(`startRoom “${world.startRoom}” isn’t a room`);
  for (const w of verbClashes(world.verbs)) problems.push(`verb word “${w}” is a built-in`);
  return problems;
}

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
      events: { ...fixtureWorld.events, bad: [{ move: 'unicorn', to: 'nowhere' }, { run: 'missing' }, { teleport: 'x' } as unknown as Effect] },
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
        expect.stringContaining('unknown effect'),
        'daemon 0: names no event “absent”',
        'item player: home names no room “mars”',
        '“player” is reserved; no room or item may use it',
      ]),
    );
  });
});
