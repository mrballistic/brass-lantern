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

// What the server accepts (server/src/routes/parse-intent.ts). A verb outside
// this would get the whole request rejected, so it's left out instead.
const VERB_ID = /^[a-z0-9_]{1,48}$/;
const MAX_VERBS = 50;

function sendableVerbs(world: World): string[] {
  return Object.keys(world.verbs ?? {})
    .filter((id) => VERB_ID.test(id))
    .slice(0, MAX_VERBS);
}

export function buildContext(
  room: Room,
  world: World,
  inventory: string[],
  visibleItemIds: string[],
  dark = false,
): IntentContext {
  // In the dark the player can't see where they are or who's there, so neither does the LLM.
  return {
    roomName: dark ? 'darkness' : room.name,
    exits: Object.keys(room.exits),
    items: visibleItemIds.map((id) => label(id, world.items[id]?.name)),
    npcs: dark ? [] : room.npcs.map((id) => label(id, world.npcs[id]?.name)),
    inventory: inventory.map((id) => label(id, world.items[id]?.name)),
    verbs: sendableVerbs(world),
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
