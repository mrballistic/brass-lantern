import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { fuzzyCandidates } from '../fuzzy';
import { childrenOf, closedAround, inventoryOf, isCarried, setResolveById, visibleItems } from '../model';
import { ok, type EngineResult } from '../result';
import { withRules } from '../rules';
import { handlePut } from './containers';
import { handleDrop, handleTake } from './objects';

const NOTHING: Record<string, string> = {
  take: 'There is nothing here to take.',
  drop: 'You aren’t carrying anything to drop.',
  put: 'You aren’t carrying anything to put there.',
};

/** The items ALL covers for a verb, before EXCEPT. */
function covered(verb: string, action: ParsedAction, world: World, state: GameState): string[] {
  if (verb === 'take' && world.style === 'infocom') {
    // Zork's ALL is what's directly in the room, fixed things too (each says why it can't be taken);
    // not things inside containers, nor doors and walls shared with other rooms.
    return childrenOf(world, state, state.currentRoom);
  }
  if (verb === 'take') {
    return visibleItems(world, state).filter(
      (id) => !isCarried(state, id) && world.items[id]?.portable && !world.items[id]?.scenery && !closedAround(world, state, id) && !insideCarried(world, state, id),
    );
  }
  const carried = inventoryOf(world, state);
  return verb === 'put' ? carried.filter((id) => id !== action.indirect) : carried;
}

function insideCarried(world: World, state: GameState, id: string): boolean {
  for (let p = state.locations[id]; p && world.items[p]; p = state.locations[p]) if (isCarried(state, p)) return true;
  return false;
}

/** “Taken: lamp.” → “Taken.”, for the “lamp: Taken.” form. */
function short(line: string): string {
  return line.replace(/^(Taken|Dropped): .+\.$/, '$1.');
}

/** TAKE ALL, DROP ALL, PUT ALL IN X, each with BUT/EXCEPT. One “name: reply” line per item. */
export function handleAll(action: ParsedAction, world: World, state: GameState): EngineResult {
  const verb = action.action;
  let ids = covered(verb, action, world, state);
  const named = ids.map((id) => ({ id, name: world.items[id]?.name ?? id, aliases: world.items[id]?.aliases }));
  // EXCEPT words that match nothing are ignored, as in Zork.
  const excepted = new Set((action.except ?? []).flatMap((word) => fuzzyCandidates(word, named)));
  ids = ids.filter((id) => !excepted.has(id));
  if (ids.length === 0) return ok([NOTHING[verb] ?? NOTHING.take]);

  const lines: string[] = [];
  // These are item IDs, so they resolve by ID (no “which one?” mid-list).
  setResolveById(state, true);
  try {
    for (const id of ids) {
      const one: ParsedAction = { action: verb, target: id };
      if (action.indirect) one.indirect = action.indirect;
      if (action.prep) one.prep = action.prep;
      const run = () =>
        verb === 'take' ? handleTake(id, world, state) : verb === 'drop' ? handleDrop(id, world, state) : handlePut(id, action.indirect, world, state);
      const result = withRules(verb, one, world, state, run);
      const [first = '', ...rest] = result.lines;
      lines.push(`${world.items[id]?.name ?? id}: ${short(first)}`, ...rest);
    }
  } finally {
    setResolveById(state, false);
  }
  return ok(lines, true);
}
