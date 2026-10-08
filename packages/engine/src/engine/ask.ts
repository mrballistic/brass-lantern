import type { ParsedAction } from '../types/game.ts';
import type { World } from '../types/world.ts';
import type { Ask } from './result.ts';

// How the engine words its questions back to the player.

/** The verb as the player would say it, for “What do you want to …?”. */
const VERB_WORDS: Record<string, string> = {
  turn_on: 'turn on',
  turn_off: 'turn off',
  search: 'look in',
  talk: 'talk to',
};

/** Second-object questions: “unlock the chest with”, “put the lamp in”. */
const INDIRECT_PREP: Record<string, string> = { unlock: 'with', lock: 'with', put: 'in', give: 'to', use: 'on' };

function listThe(world: World, ids: string[]): string {
  const names = ids.map((id) => `the ${world.items[id]?.name ?? id}`);
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, or ${names.at(-1)}`;
}

export function whichQuestion(world: World, word: string, candidates: string[]): string {
  return world.style === 'infocom'
    ? `Which ${word} do you mean, ${listThe(world, candidates)}?`
    : `Which do you mean: ${listThe(world, candidates)}?`;
}

export function whatQuestion(action: ParsedAction, slot: Ask['slot'], targetName?: string): string {
  const verb = VERB_WORDS[action.action] ?? action.action.replace(/_/g, ' ');
  if (slot === 'indirect' && targetName) {
    return `What do you want to ${verb} the ${targetName} ${INDIRECT_PREP[action.action] ?? 'with'}?`;
  }
  return `What do you want to ${verb}?`;
}
