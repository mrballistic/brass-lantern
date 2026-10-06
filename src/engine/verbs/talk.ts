import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { fuzzyCandidates } from '../fuzzy';
import { matchNpc, needObject } from '../model';
import { miss, ok, type EngineResult } from '../result';
import { applyRule, findRule, runEvent } from '../rules';
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
  return world.events[entry.text] ? ok(runEvent(entry.text, world, state), true) : ok([entry.text]);
}

/** “X, do this”: the character's order rules, its refuseOrder line, or “X ignores you.” No one obeys yet. */
export function handleOrder(action: ParsedAction, world: World, state: GameState): EngineResult {
  if (!action.target) needObject();
  const npc = matchNpc(action.target, world, state);
  if (!npc) return miss(`There is no “${action.target}” here.`);
  const person = world.npcs[npc];
  // Only the character addressed answers, and the order's words stay words: they
  // aren't resolved as things (“give me the key” mustn't ask which key).
  setCommand(state, { verb: 'order', target: npc, words: { target: action.target, indirect: action.indirect } });
  const rule = findRule(world, state, 'instead', 'order', { target: null, indirect: null, room: state.currentRoom, npcs: [npc] }, []);
  return rule ? applyRule(rule, world, state) : ok([person.refuseOrder ?? `${person.name} ignores you.`]);
}
