// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import { zork1 } from '@/worlds/zork1';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { localStorageSaveStore } from '@/zmachine/save-store';
import { ZMachineSession } from '@/zmachine/session';

// Fights are random, and our dice aren't Zork's, so the walkthrough can't
// compare them reply for reply. Instead: fight the real troll many times,
// collect everything it printed, and require every line our fights print to
// be something the original printed too.

const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));

/** The quickest way to the troll with the sword and a lit lamp. */
const TO_THE_TROLL = ['n', 'e', 'open window', 'w', 'w', 'take lamp', 'take sword', 'move rug', 'open trap door', 'turn on lamp', 'd', 'n'];
const ATTACK = 'kill troll with sword';
const MAX_BLOWS = 30;
/** Real fights to collect. Deaths and knock-outs are rare, so this has to be a good many. */
const FIGHTS = 300;

const normalize = (text: string) =>
  text
    .replace(/📍 /g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const LOST_SWORD = (zork1.npcs.troll.combat?.messages?.loseWeapon ?? []).map((m) => normalize(m.replace('{weapon}', 'sword')));
/** The troll knocked the sword away: pick it up, as a player would. */
const lostSword = (text: string) => LOST_SWORD.some((m) => normalize(text).includes(m));
const over = (text: string) => /breathes his last breath|carcass disappears|you have died/.test(normalize(text));

/** One real fight: everything printed from entering the Troll Room to the end. */
async function originalFight(): Promise<string> {
  let lines: string[] = [];
  let waiting = false;
  const session = new ZMachineSession(story, new LocalStorageDialog(localStorageSaveStore('fight:')), {
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
    const out = lines.join('\n');
    lines = [];
    return out;
  };
  session.start();
  await send(); // the banner and the first room
  let printed = '';
  for (const c of TO_THE_TROLL) {
    const reply = await send(c);
    printed = reply; // keeps the last: walking into the Troll Room (the troll may strike first)
  }
  printed += '\n';
  for (let i = 0; i < MAX_BLOWS; i++) {
    const reply = await send(ATTACK);
    printed += reply + '\n';
    if (over(reply)) break;
    if (lostSword(reply)) {
      const again = await send('take sword');
      printed += again + '\n';
      if (over(again)) break;
    }
  }
  localStorage.clear();
  return printed;
}

/** The lines one native fight prints, for a seed. */
function nativeFight(seed: number): string[] {
  const state = initialState(zork1);
  openingLines(zork1, state);
  const run = (c: string) => execute(fallbackParse(c, zork1.verbs) ?? { action: 'unknown' }, { world: zork1, state }).lines;
  for (const c of TO_THE_TROLL.slice(0, -1)) run(c);
  state.rng = seed;
  const printed = [...run('n')];
  for (let i = 0; i < MAX_BLOWS; i++) {
    const reply = run(ATTACK);
    printed.push(...reply);
    if (over(reply.join('\n'))) break;
    if (lostSword(reply.join('\n'))) {
      const again = run('take sword');
      printed.push(...again);
      if (over(again.join('\n'))) break;
    }
  }
  return printed.filter((l) => l.trim() !== '');
}

/** Every message the troll and the hero can print, by kind of result, from the world's own tables. */
function messagesByResult(): Array<{ result: string; texts: string[] }> {
  const fill = (m: string) => normalize(m.replace('{weapon}', 'sword').replace('{defender}', 'troll'));
  const out: Array<{ result: string; texts: string[] }> = [];
  for (const [owner, messages] of [['troll', zork1.npcs.troll.combat?.messages], ['hero', zork1.combat?.messages]] as const) {
    for (const [result, texts] of Object.entries(messages ?? {})) out.push({ result: `${owner}:${result}`, texts: (texts ?? []).map(fill) });
  }
  return out;
}

/** A fight's lines up to its end: after a death, where things scatter is random, and the death texts are checked elsewhere. */
function untilDeath(lines: string[]): string[] {
  const i = lines.findIndex((l) => /you have died/i.test(l));
  return i < 0 ? lines : lines.slice(0, i + 1);
}

describe('the troll fight against the original', () => {
  it('prints nothing the original never prints', async () => {
    // Every line the original printed, and how often.
    const seen = new Map<string, number>();
    for (let i = 0; i < FIGHTS; i++) {
      try {
        for (const line of untilDeath((await originalFight()).split('\n'))) seen.set(normalize(line), (seen.get(normalize(line)) ?? 0) + 1);
      } catch (e) {
        throw new Error(`fight ${i}: ${(e as Error).message}`, { cause: e });
      }
    }
    // How often each line turns up in our own fights.
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const line of untilDeath(nativeFight(seed))) counts.set(line, (counts.get(line) ?? 0) + 1);
    }
    // A message variant that never turned up in the original is excused when its kind of result
    // did turn up, but too seldom (under COMMON times) for a fair pick to be sure of showing every
    // variant. (The original's dice aren't fair across consecutive rolls: of 18 deaths, one used
    // its second death message.) Variants of common kinds, like misses, must match.
    const COMMON = 20;
    const kindCount = (texts: string[]) => texts.reduce((n, t) => n + (seen.get(t) ?? 0), 0);
    const excusedKinds = messagesByResult().filter((k) => kindCount(k.texts) > 0 && kindCount(k.texts) < COMMON);
    const excused = (line: string) => excusedKinds.some((k) => k.texts.includes(line));
    const strays = [...counts.keys()].filter((line) => !seen.has(normalize(line)) && !excused(normalize(line)));
    expect(strays).toEqual([]);
  }, 300_000);
});
