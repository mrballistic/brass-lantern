import type { ParsedAction } from '@/types/game';
import type { World, Room } from '@/types/world';

export interface IntentContext {
  roomName: string;
  exits: string[];
  items: string[];
  npcs: string[];
  inventory: string[];
  /** The world's own verbs, which the server accepts alongside its built-in list. */
  verbs: string[];
}

/** "red_stapler (red Swingline stapler)": the ID the engine matches exactly, plus what the player sees. */
function label(id: string, name: string | undefined): string {
  return name && name !== id ? `${id} (${name})` : id;
}

export function buildContext(
  room: Room,
  world: World,
  inventory: string[],
  visibleItemIds: string[],
): IntentContext {
  return {
    roomName: room.name,
    exits: Object.keys(room.exits),
    items: visibleItemIds.map((id) => label(id, world.items[id]?.name)),
    npcs: room.npcs.map((id) => label(id, world.npcs[id]?.name)),
    inventory: inventory.map((id) => label(id, world.items[id]?.name)),
    verbs: Object.keys(world.verbs ?? {}),
  };
}

const ENDPOINT = '/api/parse-intent';
// A little over the server's own 5s Gemini deadline, so the server's
// fallback answer arrives instead of the client giving up first.
const TIMEOUT_MS = 6000;

export async function parseIntentRemote(
  input: string,
  context: IntentContext,
): Promise<ParsedAction> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, context }),
      signal: controller.signal,
    });
    if (!res.ok) return { action: 'unknown' };
    const json = (await res.json()) as Partial<ParsedAction> & { fallback?: ParsedAction };
    if (json.fallback) return json.fallback;
    if (typeof json.action !== 'string') return { action: 'unknown' };
    const out: ParsedAction = { action: json.action };
    if (typeof json.target === 'string') out.target = json.target;
    if (typeof json.indirect === 'string') out.indirect = json.indirect;
    return out;
  } catch {
    return { action: 'unknown' };
  } finally {
    clearTimeout(timer);
  }
}
