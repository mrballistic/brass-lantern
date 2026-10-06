import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { inventoryOf, matchNpc, moveItem, needObject, npcsSeen, pickItem } from '../model';
import { miss, ok, type EngineResult } from '../result';
import { runEvent } from '../rules';

export function handleTalk(target: string | undefined, world: World, state: GameState): EngineResult {
  const present = npcsSeen(world, state, state.currentRoom);
  if (!target) {
    if (present.length !== 1) return ok(['Talk to whom?']);
    target = present[0];
  }
  const npcId = matchNpc(target, world, state);
  if (!npcId) return miss(`There is no “${target}” here to talk to.`);
  const dialogue = world.dialogue[npcId];
  if (!dialogue) return ok(['They have nothing to say.']);

  // Pick the most specific (last-matching) condition-gated line; fall back to default.
  let chosen = dialogue.default;
  for (const [key, value] of Object.entries(dialogue)) {
    if (key === 'default') continue;
    if (evaluateCondition(key, state, world)) chosen = value;
  }
  return ok([chosen]);
}

export function handleGive(
  target: string | undefined,
  indirect: string | undefined,
  world: World,
  state: GameState,
): EngineResult {
  if (!target) needObject();
  const itemId = pickItem(target, inventoryOf(world, state), world, 'target', state);
  if (!itemId) return miss(`You aren’t carrying a “${target}”.`);

  const present = npcsSeen(world, state, state.currentRoom);
  let npcId: string | null;
  if (indirect) {
    npcId = matchNpc(indirect, world, state);
    if (!npcId) return miss(`There is no “${indirect}” here to give it to.`);
  } else if (present.length === 1) {
    npcId = present[0];
  } else {
    return ok([present.length === 0 ? 'There is nobody here to give it to.' : 'Give it to whom?']);
  }

  const npc = world.npcs[npcId];
  const item = world.items[itemId];
  const refusal = npc.refuse?.[itemId];
  if (refusal) return ok([refusal]);
  const event = npc.onGive?.[itemId];
  if (!event) {
    return ok([npc.refuseGift ?? `${npc.name} doesn’t want your ${item.name}.`]);
  }
  moveItem(state, itemId, null);
  return ok(runEvent(event, world, state), true);
}
