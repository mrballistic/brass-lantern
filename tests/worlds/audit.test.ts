import { describe, expect, it } from 'vitest';
import { cartridges } from '@/app.config';
import { verbClashes } from '@/engine/parser';
import type { Effect, EventStep, World } from '@/types/world';
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
