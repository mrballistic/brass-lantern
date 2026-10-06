import { conditionProblems } from '@/engine/conditions';
import { verbClashes } from '@/engine/parser';
import type { Effect, EventStep, Rule, RuleTable, World } from '@/types/world';

// Checks a world's data: effects and rules naming things that exist, exits
// going somewhere, conditions that parse, no reserved IDs. Mistakes here fail
// silently in play, so they fail loudly in tests/worlds/audit.test.ts.

const EFFECT_KINDS = new Set([
  'say', 'set', 'clear', 'move', 'open', 'close', 'lock', 'unlock', 'switch', 'add', 'setVar', 'score',
  'go', 'schedule', 'cancel', 'chance', 'run', 'die', 'end', 'moveNpc', 'npcState', 'script', 'hide', 'reveal',
  'if', 'unvisit', 'free', 'noDarkLine', 'unlist', 'relist', 'look', 'board', 'disembark',
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
      if (['open', 'close', 'lock', 'unlock', 'switch', 'unlist', 'relist', 'board'].includes(kind) && !isItem(target as string)) problems.push(`${where}: ${kind} names no item “${target}”`);
      if (kind === 'move') {
        if (!isItem(e.move as string)) problems.push(`${where}: move names no item “${e.move}”`);
        const to = e.to as string | null;
        if (to !== null && to !== 'player' && to !== 'here' && !isItem(to) && !isRoom(to) && !(to in world.npcs)) problems.push(`${where}: move to nowhere “${to}”`);
      }
      if (['run', 'schedule', 'cancel'].includes(kind) && !isEvent(target as string)) problems.push(`${where}: ${kind} names no event “${target}”`);
      if (kind === 'go' && !isRoom(target as string)) problems.push(`${where}: go names no room “${target}”`);
      if (kind === 'script' && !world.scripts?.[target as string]) problems.push(`${where}: script names no script “${target}”`);
      if ((kind === 'moveNpc' || kind === 'npcState') && !((target as string) in world.npcs)) problems.push(`${where}: ${kind} names no character “${target}”`);
      if (kind === 'moveNpc' && e.to !== null && !isRoom(e.to as string)) problems.push(`${where}: moveNpc to nowhere “${e.to}”`);
      if (kind === 'end' && !world.endings?.[target as string]) problems.push(`${where}: end names no ending “${target}”`);
      if (kind === 'unvisit' && !isRoom(target as string)) problems.push(`${where}: unvisit names no room “${target}”`);
      if (kind === 'if') {
        for (const p of conditionProblems(target as string, world)) problems.push(`${where} (if): ${p}`);
        checkSteps((e.then as EventStep[]) ?? [], `${where} (if)`);
        checkSteps((e.else as EventStep[]) ?? [], `${where} (if)`);
      }
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
  const checkCapture = (capture: World['capture'], where: string) => {
    if (!capture) return;
    checkCondition(capture.if, where);
    if (!world.scripts?.[capture.script]) problems.push(`${where}: names no script “${capture.script}”`);
  };
  checkCapture(world.capture, 'world capture');
  checkCondition(world.darkness?.litIf, 'darkness.litIf');
  checkSteps(world.darkness?.stumble?.then ?? [], 'darkness.stumble');
  checkSteps(world.darkness?.stumble?.aboard ?? [], 'darkness.stumble');
  for (const m of d?.message ?? []) if (typeof m !== 'string') checkCondition(m.if, 'death.message');
  for (const x of d?.instead ?? []) checkCondition(x.if, 'death.instead');
  for (const v of d?.variants ?? []) {
    checkCondition(v.if, 'death.variants');
    if (v.respawn && !isRoom(v.respawn)) problems.push(`death.variants respawn names no room “${v.respawn}”`);
    if (v.then && !isEvent(v.then)) problems.push(`death.variants then names no event “${v.then}”`);
    if (v.before && !isEvent(v.before)) problems.push(`death.variants before names no event “${v.before}”`);
  }
  for (const [id, room] of Object.entries(world.rooms)) {
    checkTriggers(room.onEnter, `room ${id} onEnter`);
    checkTable(room.instead, 'instead', `room ${id}`);
    checkTable(room.after, 'after', `room ${id}`);
    checkCondition(room.requires, `room ${id} requires`);
    for (const e of room.onEnd ?? []) {
      checkCondition(e.if, `room ${id} onEnd`);
      if (typeof e.then === 'string') {
        if (!isEvent(e.then)) problems.push(`room ${id} onEnd names no event “${e.then}”`);
      } else checkSteps(e.then, `room ${id} onEnd`);
    }
    checkCapture(room.capture, `room ${id} capture`);
    if (typeof room.water === 'string') checkCondition(room.water, `room ${id} water`);
    for (const [label, exit] of Object.entries(room.exits)) {
      if (typeof exit === 'string') continue;
      checkCondition(exit.if, `room ${id} exit ${label}`);
      checkEvent(exit.then, `room ${id} exit ${label}`);
      for (const d of exit.denials ?? []) checkCondition(d.if, `room ${id} exit ${label}`);
    }
  }
  for (const [id, item] of Object.entries(world.items)) {
    for (const e of item.onEnd ?? []) {
      checkCondition(e.if, `item ${id} onEnd`);
      if (typeof e.then === 'string') {
        if (!isEvent(e.then)) problems.push(`item ${id} onEnd names no event “${e.then}”`);
      } else checkSteps(e.then, `item ${id} onEnd`);
    }
    checkTable(item.instead, 'instead', `item ${id}`);
    checkTable(item.after, 'after', `item ${id}`);
    checkRules(item.onUse, `item ${id} onUse`);
    checkEvent(item.onTake, `item ${id} onTake`);
    checkEvent(item.onSmash, `item ${id} onSmash`);
    checkEvent(item.onWear, `item ${id} onWear`);
  }
  for (const [id, npc] of Object.entries(world.npcs)) {
    for (const key of Object.values(npc.onGive ?? {})) checkEvent(key, `npc ${id} onGive`);
    const c = npc.combat;
    if (c) {
      for (const hook of ['onDeath', 'onUnconscious', 'onWake', 'onBusy'] as const) checkEvent(c[hook], `npc ${id} combat ${hook}`);
      if (c.weapon && !isItem(c.weapon)) problems.push(`npc ${id} combat: weapon names no item “${c.weapon}”`);
      if (c.fears && !isItem(c.fears.item)) problems.push(`npc ${id} combat fears: names no item “${c.fears.item}”`);
    }
    for (const held of npc.holds ?? []) if (!isItem(held)) problems.push(`npc ${id} holds: no item “${held}”`);
    for (const d of npc.descriptions ?? []) checkCondition(d.if, `npc ${id} descriptions`);
    checkTable(npc.instead, 'instead', `npc ${id}`);
    checkTable(npc.after, 'after', `npc ${id}`);
    for (const [topic, entries] of Object.entries(npc.topics ?? {})) {
      for (const e of typeof entries === 'string' ? [] : entries) checkCondition(e.if, `npc ${id} topic ${topic}`);
    }
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
