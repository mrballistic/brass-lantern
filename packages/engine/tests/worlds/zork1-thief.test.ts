// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute, initialState, openingLines } from '../../src/engine/engine';
import { fallbackParse } from '../../src/engine/parser';
import { zork1 } from '../../src/worlds/zork1';
import { LocalStorageDialog } from '../../src/zmachine/dialog';
import { localStorageSaveStore } from '../../src/zmachine/save-store';
import { ZMachineSession } from '../../src/zmachine/session';

// The thief is random, and his route is three times shorter natively until the
// whole map exists, so he's checked by his lines: wait in the dark cellar with
// a treasure, many times in the real game, and require every line the native
// thief prints there to be one the original prints too.

const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));

/** Down to the dark cellar with the lamp lit and the painting in hand. */
const TO_THE_CELLAR = ['n', 'e', 'open window', 'w', 'w', 'take lamp', 'move rug', 'open trap door', 'turn on lamp', 'd', 's', 'e', 'take painting', 'w', 'n'];
const WAITS = 80;
const SESSIONS = 60;

const normalize = (text: string) =>
  text.replace(/📍 /g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

async function originalWait(): Promise<string[]> {
  let lines: string[] = [];
  let waiting = false;
  const session = new ZMachineSession(story, new LocalStorageDialog(localStorageSaveStore('thief:')), {
    onLines: (l) => lines.push(...l),
    onStatus: () => {},
    onExit: () => {},
    onWaiting: () => {
      waiting = true;
    },
    onError: (m) => {
      throw new Error(m);
    },
  });
  const send = async (c?: string) => {
    if (c) session.submit(c);
    const start = Date.now();
    while (!waiting) {
      if (Date.now() - start > 4000) throw new Error('the original stopped answering');
      await new Promise((r) => setTimeout(r, 2));
    }
    waiting = false;
    const out = lines;
    lines = [];
    return out;
  };
  session.start();
  await send();
  for (const c of TO_THE_CELLAR) await send(c);
  const printed: string[] = [];
  for (let i = 0; i < WAITS; i++) {
    const reply = await send('wait');
    printed.push(...reply);
    if (reply.some((l) => /You have died/.test(l))) break;
  }
  localStorage.clear();
  return printed;
}

function nativeWait(seed: number): string[] {
  const state = initialState(zork1);
  openingLines(zork1, state);
  const run = (c: string) => execute(fallbackParse(c, zork1.verbs) ?? { action: 'unknown' }, { world: zork1, state }).lines;
  for (const c of TO_THE_CELLAR) run(c);
  state.rng = seed;
  const printed: string[] = [];
  for (let i = 0; i < WAITS; i++) {
    const reply = run('wait');
    printed.push(...reply);
    if (reply.some((l) => /You have died/.test(l))) break;
  }
  return printed;
}

/** Up to and including a death: after it, where things scatter is random. */
const untilDeath = (lines: string[]) => {
  const i = lines.findIndex((l) => /you have died/i.test(l));
  return (i < 0 ? lines : lines.slice(0, i + 1)).filter((l) => l.trim() !== '');
};

describe('the thief against the original', () => {
  it('prints nothing the original never prints', async () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < SESSIONS; i++) for (const l of untilDeath(await originalWait())) seen.set(normalize(l), (seen.get(normalize(l)) ?? 0) + 1);
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 100; seed++) for (const l of untilDeath(nativeWait(seed))) counts.set(l, (counts.get(l) ?? 0) + 1);
    // As for the troll: an unseen variant of a kind of blow the original showed rarely is excused.
    const COMMON = 20;
    const kinds = Object.values(zork1.npcs.thief.combat?.messages ?? {}).map((texts) => (texts ?? []).map((t) => normalize(t.replace('{weapon}', 'painting'))));
    const kindCount = (texts: string[]) => texts.reduce((n, t) => n + (seen.get(t) ?? 0), 0);
    const excused = (line: string) => kinds.some((k) => k.includes(line) && kindCount(k) > 0 && kindCount(k) < COMMON);
    const thiefLines = [...counts.keys()].filter((l) => !seen.has(normalize(l)) && !excused(normalize(l)));
    expect(thiefLines).toEqual([]);
    // And the original's thief did turn up, so the comparison means something.
    expect([...seen.keys()].some((l) => l.includes('large bag'))).toBe(true);
    expect([...counts.keys()].some((l) => l.includes('large bag'))).toBe(true);
  }, 600_000);
});
