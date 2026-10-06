// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { interpret, newConversation, remember, resolvePronouns } from '@/engine/conversation';
import { execute, initialState, openingLines, type EngineResult } from '@/engine/engine';
import type { GameState, ParsedAction } from '@/types/game';
import { fallbackParse } from '@/engine/parser';
import { zork1 } from '@/worlds/zork1';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { ZMachineSession } from '@/zmachine/session';
import { ALLOWED, RANDOM_LINES, SYNC, WALKTHROUGH } from './zork1-allowlist';

// Native Zork I against the real story file, reply by reply. The yardstick for
// the engine-parity work: a mismatch here is either a bug in the native world
// or the engine, or a known gap listed (with its reason) in the allowlist.

const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));

/** Same text, give or take case, spacing, quote style and the room marker. */
function normalize(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/📍 /g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const TROLL_BLOWS = Object.values(zork1.npcs.troll.combat?.messages ?? {})
  .flat()
  .map((m) => normalize([m.replace('{weapon}', 'sword')]));
const struckFirst = (reply: string[]) => TROLL_BLOWS.some((b) => normalize(reply).includes(b));
const died = (reply: string[]) => normalize(reply).includes('you have died');
const trollDied = (reply: string[]) => normalize(reply).includes('almost as soon as the troll breathes his last breath');

class Restart extends Error {}

const THIEF = /large bag|seedy-looking|\bthief\b/i;

/** Plays one sync point on a side, through `send`; throws Restart if this attempt can't satisfy it. */
async function sync(name: string, send: (command: string) => Promise<string[]> | string[]): Promise<string[]> {
  const point = SYNC[name];
  if (point.until === 'noFirstStrike') {
    const reply = await send(point.command);
    if (struckFirst(reply) || died(reply)) throw new Restart();
    return reply;
  }
  for (let i = 0; i < 30; i++) {
    const reply = await send(point.command);
    if (died(reply)) throw new Restart();
    if (trollDied(reply)) return [];
  }
  throw new Restart();
}

/** The same sync point, for the native side, which answers at once: the reply, or null to try another seed. */
function syncNow(name: string, send: (command: string) => string[]): string[] | null {
  const point = SYNC[name];
  if (point.until === 'noFirstStrike') {
    const reply = send(point.command);
    return struckFirst(reply) || died(reply) ? null : reply;
  }
  for (let i = 0; i < 30; i++) {
    const reply = send(point.command);
    if (died(reply)) return null;
    if (trollDied(reply)) return [];
  }
  return null;
}

async function originalOnce(commands: string[]): Promise<string[][]> {
  const replies: string[][] = [];
  let lines: string[] = [];
  let waiting = false;
  const session = new ZMachineSession(story, new LocalStorageDialog('diff'), {
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
  const settle = async () => {
    const start = Date.now();
    while (!waiting) {
      if (Date.now() - start > 4000) throw new Error('the original stopped answering');
      await new Promise((r) => setTimeout(r, 5));
    }
    waiting = false;
    const out = lines;
    lines = [];
    return out;
  };
  const send = async (c: string) => {
    session.submit(c);
    const reply = (await settle()).filter((l) => !RANDOM_LINES.includes(l));
    // The thief wanders the underground at random from the start; he's stage 4b. A run he turns up in starts over.
    if (THIEF.test(reply.join(' '))) throw new Restart();
    return reply;
  };
  session.start();
  await settle(); // the banner and the first room
  for (const c of commands) replies.push(c in SYNC ? await sync(c, send) : await send(c));
  return replies;
}

/** The original's replies. Its dice aren't ours, so a run that misses a sync point starts over. */
async function original(commands: string[]): Promise<string[][]> {
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      return await originalOnce(commands);
    } catch (e) {
      if (!(e instanceof Restart)) throw e;
      localStorage.clear();
    }
  }
  throw new Error('the original never got through the sync points');
}

/** The game store's turn, minus the LLM: questions, AGAIN and OOPS included. */
function native(commands: string[]): string[][] {
  let state = initialState(zork1);
  openingLines(zork1, state);
  let conv = newConversation();
  const turn = (c: string, st: GameState, cv: ReturnType<typeof newConversation>): string[] => {
    const run = (action: ParsedAction): EngineResult => {
      const result = execute(action, { world: zork1, state: st });
      remember(cv, action, result);
      return result;
    };
    const step = interpret(c, cv, zork1, st);
    if ('reply' in step) return step.reply;
    if ('run' in step) return run(step.run).lines;
    const parsed = fallbackParse(step.parse, zork1.verbs);
    const result = run(parsed ? resolvePronouns(parsed, cv) : { action: 'unknown' });
    cv.lastUnknown = result.understood === false ? step.parse : null;
    return [...(step.note ?? []), ...result.lines];
  };
  const replies: string[][] = [];
  for (const c of commands) {
    if (!(c in SYNC)) {
      replies.push(turn(c, state, conv));
      continue;
    }
    // Try seeds until this side gets through, then carry on from there.
    let done = false;
    for (let seed = 1; seed <= 500 && !done; seed++) {
      const st = structuredClone(state);
      const cv = structuredClone(conv);
      st.rng = seed;
      const reply = syncNow(c, (cmd) => turn(cmd, st, cv));
      if (reply) {
        replies.push(reply);
        state = st;
        conv = cv;
        done = true;
      }
    }
    if (!done) throw new Error(`no seed got the native side through ${c}`);
  }
  return replies;
}
describe('native Zork I against the original', () => {
  beforeEach(() => localStorage.clear());

  it('the walkthrough has no repeated commands', () => {
    expect(new Set(WALKTHROUGH).size).toBe(WALKTHROUGH.length);
  });

  it('matches reply for reply along the walkthrough, apart from listed differences', async () => {
    const theirs = await original(WALKTHROUGH);
    const ours = native(WALKTHROUGH);
    const allowed = new Set(ALLOWED.map((a) => a.command));
    const mismatches: string[] = [];
    WALKTHROUGH.forEach((command, i) => {
      if (allowed.has(command) || normalize(ours[i]) === normalize(theirs[i])) return;
      mismatches.push(`> ${command}\n  native:   ${ours[i].join(' / ')}\n  original: ${theirs[i].join(' / ')}`);
    });
    expect(mismatches.join('\n\n')).toBe('');
  }, 180_000);

  it('every allowlisted difference is still a difference', async () => {
    const theirs = await original(WALKTHROUGH);
    const ours = native(WALKTHROUGH);
    for (const { command, random } of ALLOWED) {
      const i = WALKTHROUGH.indexOf(command);
      if (random) {
        expect(i, `allowlisted “${command}” isn’t in the walkthrough`).toBeGreaterThanOrEqual(0);
        continue;
      }
      expect(i, `allowlisted “${command}” isn’t in the walkthrough`).toBeGreaterThanOrEqual(0);
      expect(normalize(ours[i]), `“${command}” now matches; remove it from the allowlist`).not.toBe(normalize(theirs[i]));
    }
  }, 180_000);

  it('dies with the original’s words', async () => {
    // Into the dark cellar without a light, then blunder east until the grue strikes.
    const path = ['n', 'e', 'open window', 'w', 'w', 'move rug', 'open trap door', 'd'];
    const theirs = await original([...path, ...Array.from({ length: 20 }, () => 'e')]);
    const death = theirs.slice(path.length).find((reply) => reply.some((l) => l.includes('You have died')));
    if (!death) {
      console.warn('The original never died in 20 tries; skipping the death-text comparison.');
      return;
    }
    const ours = [...(zork1.death?.message ?? []), ...(zork1.death?.resurrection ?? [])];
    expect(normalize(death)).toContain(normalize(ours));
  }, 180_000);
});
