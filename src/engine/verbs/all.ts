import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { fuzzyCandidates } from '../fuzzy';
import { canReachInside, childrenOf, closedAround, inventoryOf, isCarried, isLit, pickItem, setResolveById, shown, visibleItems } from '../model';
import { turnHalted } from '../effects';
import { miss, ok, type EngineResult } from '../result';
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
  // TAKE ALL FROM X: what's in X (Zork's ALL with a second object).
  if (verb === 'take' && action.indirect) {
    const from = pickItem(action.indirect, visibleItems(world, state), world, 'indirect', state);
    if (!from || closedAround(world, state, from) || !canReachInside(world, state, from)) return [];
    return childrenOf(world, state, from).filter((id) => shown(state)(id) && !world.items[id]?.scenery);
  }
  if (verb === 'take' && world.style === 'infocom' && isLit(world, state)) {
    // Zork's ALL is what's directly in the room, fixed things too (each says why it can't be taken);
    // not things inside containers, nor doors and walls shared with other rooms.
    return childrenOf(world, state, state.currentRoom).filter(shown(state));
  }
  if (verb === 'take') {
    return visibleItems(world, state).filter(
      (id) => !isCarried(state, id) && world.items[id]?.portable && !world.items[id]?.scenery && !closedAround(world, state, id) && !insideCarried(world, state, id),
    );
  }
  const carried = inventoryOf(world, state);
  if (verb !== 'put') return carried;
  // The destination as the verb resolves it, so PUT ALL IN GLASS JAR leaves the jar out.
  const dest = action.indirect ? pickItem(action.indirect, visibleItems(world, state), world, 'indirect', state) : null;
  return carried.filter((id) => id !== dest && id !== action.indirect);
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
  // TAKE ALL FROM something not here: a miss, so the intent server can read it.
  if (verb === 'take' && action.indirect && !pickItem(action.indirect, visibleItems(world, state), world, 'indirect', state)) return miss(`You don’t see a “${action.indirect}” here.`);
  let ids = covered(verb, action, world, state);
  const named = ids.map((id) => ({ id, name: world.items[id]?.name ?? id, aliases: world.items[id]?.aliases }));
  // EXCEPT words that match nothing are ignored, as in Zork.
  const excepted = new Set((action.except ?? []).flatMap((word) => fuzzyCandidates(word, named)));
  ids = ids.filter((id) => !excepted.has(id));
  if (ids.length === 0) return ok([NOTHING[verb] ?? NOTHING.take]);

  const lines: string[] = [];
  let changed = false;
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
      changed ||= result.mutated;
      // A death or an ending partway through ends the list too.
      if (turnHalted(state) || state.gameOver) break;
    }
  } finally {
    setResolveById(state, false);
  }
  return ok(lines, changed);
}
