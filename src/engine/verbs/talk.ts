import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { whichQuestion } from '../ask';
import { evaluateCondition } from '../conditions';
import { exitTarget } from '../describe';
import { fuzzyCandidates, fuzzyMatchExit, isSelfWord } from '../fuzzy';
import { AskSignal, isAwake, isInside, isNpcHidden, isOpen, matchNpc, moveItem, needObject, nextPlacing, npcRoom, npcScope, npcsSeen, npcStateOf, pickItem, PLAYER } from '../model';
import { fallbackParse } from '../parser';
import { miss, ok, type EngineResult } from '../result';
import { runEventKey, turnHalted } from '../effects';
import { applyRule, findRule } from '../rules';
import { setCommand } from '../scripts';
import { handleTalk, talkLine } from './people';

/** ASK/TELL X ABOUT Y: the character's topic for Y, else its noTopic or TALK line. */
export function handleAsk(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const npc = matchNpc(action.target, world, state);
  if (!npc) return miss(`There is no “${action.target}” here to ask.`);
  const person = world.npcs[npc];
  if (!person.topics || !action.indirect) return handleTalk(action.target, world, state);
  const word = action.indirect.replace(/^(?:the|my|your|his|her|a|an)\s+/i, '');
  const candidates = Object.keys(person.topics).map((k) => ({ id: k, name: k, aliases: person.topicAliases?.[k] }));
  const [key] = fuzzyCandidates(word, candidates);
  const fallback = () => ok([person.noTopic ?? talkLine(world, state, npc)]);
  if (!key) return fallback();
  const topic = person.topics[key];
  const entries = typeof topic === 'string' ? [{ text: topic }] : topic;
  const entry = entries.find((e) => !('if' in e) || !e.if || evaluateCondition(e.if, state, world));
  if (!entry) return fallback();
  // An entry can name an event, which runs.
  return world.events[entry.text] ? ok(runEventKey(entry.text, world, state), true) : ok([entry.text]);
}

/**
 * “X, do this”. The character's `instead.order` rules answer first, as they always have. A character
 * with `orders` or `obeys` then hears the inner command, its objects resolved in its own reach:
 * an `orders` rule for the inner verb, else a built-in it obeys (GO, TAKE, DROP, GIVE TO ME), else
 * its refuseOrder line or “X ignores you.” An order rule with `continue` answers first and then
 * lets the built-in or the refusal go on (Zork's robot says “Whirr, buzz, click!” before it walks).
 * Every order ends the rest of the line.
 */
export function handleOrder(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const npc = matchNpc(action.target, world, state) ?? matchHeard(action.target, world, state);
  if (!npc) return miss(`There is no “${action.target}” here.`);
  const person = world.npcs[npc];
  const result = order(npc, action, world, state);
  // Only an understood order to someone who can take orders ends the line. A miss never
  // does (the store retries it), and characters without orders or obeys answer as they always have.
  return result.understood !== false && (person.orders || person.obeys) ? { ...result, stopLine: true } : result;
}

/** A character elsewhere that can be addressed from the player's room (`heardFrom`), awake and unhidden. */
function matchHeard(target: string, world: World, state: GameState): string | null {
  const heard = Object.keys(world.npcs).filter(
    (id) => world.npcs[id].heardFrom?.includes(state.currentRoom) && npcRoom(world, state, id) !== null && isAwake(world, state, id) && !isNpcHidden(world, state, id),
  );
  const [id = null] = fuzzyCandidates(target, heard.map((id) => ({ id, name: world.npcs[id]?.name ?? id, aliases: world.npcs[id]?.aliases })));
  return id;
}

function order(npc: string, action: ParsedAction, world: World, state: GameState): EngineResult {
  const person = world.npcs[npc];
  const refusal = person.refuseOrder ?? `${person.name} ignores you.`;
  // Only the character addressed answers, and for its order rules the order's words stay
  // words: they aren't resolved as things (“give me the key” mustn't ask which key).
  setCommand(state, { verb: 'order', target: npc, words: { target: action.target!, indirect: action.indirect } });
  const rule = findRule(world, state, 'instead', 'order', { target: null, indirect: null, room: state.currentRoom, npcs: [npc] }, []);
  if (rule) return applyRule(rule, world, state);
  if (!person.orders && !person.obeys) return ok([refusal]);
  const parsed = action.indirect ? fallbackParse(action.indirect, world.verbs) : null;
  // Someone else's command the parser can't read: the LLM can't read it better, so no miss.
  if (!parsed) return ok([refusal]);
  const inner = giveMe(parsed);
  const room = npcRoom(world, state, npc) ?? state.currentRoom;
  const scope = npcScope(world, state, npc);
  // Resolve the inner objects before anything changes: one that names nothing in reach is a miss.
  const ids: { target?: string; indirect?: string } = {};
  for (const slot of ['target', 'indirect'] as const) {
    const word = inner[slot];
    // GO's target is a direction, not a thing.
    if (word === undefined || (slot === 'target' && inner.action === 'go')) continue;
    const found = orderObject(word, slot, scope, room, npc, inner, world, state);
    if (typeof found !== 'string') return found;
    ids[slot] = found;
  }
  // Rules are keyed by the inner verb, or by the word typed (PUSH reads as USE, but `orders.push` answers it).
  const typed = action.indirect!.trim().split(/\s+/)[0].toLowerCase();
  // Own keys only: “constructor” typed first must not find Object's.
  const has = (key: string) => Boolean(person.orders && Object.hasOwn(person.orders, key));
  const verb = has(inner.action) || !has(typed) ? inner.action : typed;
  setCommand(state, {
    verb,
    actor: npc,
    target: ids.target,
    indirect: ids.indirect,
    number: inner.number,
    direction: inner.action === 'go' ? inner.target : inner.direction,
    text: inner.text,
    words: { target: inner.target, indirect: inner.indirect },
    order: inner,
  });
  const ordered = findRule(world, state, 'orders', verb, { ...ids, room, prep: inner.prep, actor: npc }, [...scope, PLAYER]);
  if (ordered && !ordered.continue) return applyRule(ordered, world, state);
  const before = ordered ? applyRule(ordered, world, state) : null;
  if (before && (turnHalted(state) || state.gameOver)) return before;
  const obeyed = person.obeys?.find((v) => v === inner.action);
  const rest = obeyed ? obey(obeyed, npc, room, inner, ids, world, state) : ok([refusal]);
  if (!before) return rest;
  // The character has answered, so a built-in it then can't carry out is no miss: it says so, as
  // Zork's actor does after its acknowledgement (and the rule may have changed things).
  return { ...rest, lines: [...before.lines, ...rest.lines], mutated: before.mutated || rest.mutated, understood: true };
}

/** “give me the sock”: GIVE with ME as the second object, said first. */
function giveMe(inner: ParsedAction): ParsedAction {
  const m = inner.action === 'give' && !inner.indirect ? inner.target?.match(/^(?:me|myself)\s+(?:(?:the|a|an)\s+)?(.+)$/i) : null;
  return m ? { ...inner, target: m[1], indirect: PLAYER } : inner;
}

/** An inner object, in the character's reach: an item, a typed number, ME (the speaker), or someone in its room. Else a result to return. */
function orderObject(
  word: string,
  slot: 'target' | 'indirect',
  scope: string[],
  room: string,
  npc: string,
  inner: ParsedAction,
  world: World,
  state: GameState,
): string | EngineResult {
  if (word === 'number' && inner.number !== undefined) return 'number';
  if (isSelfWord(word)) return PLAYER;
  try {
    const item = pickItem(word, scope, world, slot, state);
    if (item) return item;
  } catch (e) {
    if (!(e instanceof AskSignal) || e.ask.kind !== 'which') throw e;
    // Several things match: ask, taking no time. The answer is a fresh order. Zork's parser
    // never asks on another's behalf (CANT-ORPHAN).
    if (world.style === 'infocom') return { ...ok(['“I don’t understand! What are you referring to?”']), free: true };
    return { ...ok([whichQuestion(world, e.ask.word, e.ask.candidates)]), free: true };
  }
  const others = npcsSeen(world, state, room).filter((id) => id !== npc);
  const [person] = fuzzyCandidates(word, others.map((id) => ({ id, name: world.npcs[id]?.name ?? id, aliases: world.npcs[id]?.aliases })));
  if (person) return person;
  // Zork's parser, for another actor: the default not-here printer.
  if (world.style === 'infocom') return miss(`The ${world.npcs[npc]?.name ?? npc} seems confused. “I don’t see any ${word} here!”`);
  return miss(`You don’t see a “${word}” here.`);
}

/** A built-in order carried out, or a miss that changes nothing when it can't be. */
function obey(
  verb: 'go' | 'take' | 'drop' | 'give',
  npc: string,
  room: string,
  inner: ParsedAction,
  ids: { target?: string; indirect?: string },
  world: World,
  state: GameState,
): EngineResult {
  const person = world.npcs[npc];
  const refusal = person.refuseOrder ?? `${person.name} ignores you.`;
  const done = () => ok([person.obeyReplies?.[verb] ?? 'Okay.'], true);
  const infocom = world.style === 'infocom';
  const item = ids.target && world.items[ids.target] ? ids.target : null;
  const holds = item !== null && isInside(state, item, npc);
  switch (verb) {
    case 'go': {
      const way = npcExit(inner.target, room, world, state);
      // Infocom's actor walks as the player does (V-WALK): no exit is the player's miss line; an exit
      // that refuses says its own refusal, understood and changing nothing.
      if (infocom && !way) return miss('You can’t go that way.');
      if (infocom && way && 'refused' in way) return ok([way.refused]);
      if (!way || !('to' in way)) return miss(refusal);
      const to = way.to;
      // Stamped on the sequence things' placings share, as the moveNpc effect does.
      Object.assign(npcStateOf(state, npc), { room: to, seq: nextPlacing(state) });
      return done();
    }
    case 'take':
      // Infocom's actor takes as the player does: PRE-TAKE, then ITAKE's refusal (understood, no change).
      if (infocom && item && holds) return ok(['You already have that!']);
      if (infocom && item && !world.items[item].portable) return ok([world.items[item].refusal ?? `You can’t take the ${world.items[item].name}.`]);
      if (!item || holds || !world.items[item].portable) return miss(refusal);
      moveItem(state, item, npc);
      return done();
    case 'drop':
      if (!item || !holds) return miss(refusal);
      moveItem(state, item, room);
      return done();
    case 'give':
      // Only to the speaker: handing things to others is no built-in.
      if (ids.indirect !== PLAYER) return ok([refusal]);
      if (!item || !holds) return miss(refusal);
      moveItem(state, item, PLAYER);
      return done();
  }
}

/**
 * The character's exit for `dir`, judged as the player's exits are: where it leads, or the
 * refusal the player would hear (a denial, a failing `if`, a closed door); null if there's no exit.
 */
function npcExit(dir: string | undefined, room: string, world: World, state: GameState): { to: string } | { refused: string } | null {
  const exits = world.rooms[room]?.exits ?? {};
  const label = dir ? fuzzyMatchExit(dir, exits) : null;
  if (!label) return null;
  const exit = exits[label];
  if (typeof exit !== 'string') {
    const denied = exit.denials?.find((d) => evaluateCondition(d.if, state, world));
    if (denied) return { refused: denied.text };
    if (exit.if && !evaluateCondition(exit.if, state, world)) return { refused: exit.denial ?? 'You can’t go that way.' };
    if (exit.door && !isOpen(world, state, exit.door)) return { refused: `The ${world.items[exit.door]?.name ?? exit.door} is closed.` };
  }
  const to = exitTarget(exit);
  return to && world.rooms[to] ? { to } : { refused: (typeof exit !== 'string' && exit.denial) || 'You can’t go that way.' };
}
