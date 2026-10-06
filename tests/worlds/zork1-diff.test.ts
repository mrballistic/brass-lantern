// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { newConversation } from '@/engine/conversation';
import { initialState, openingLines } from '@/engine/engine';
import { zork1 } from '@/worlds/zork1';
import { nativeTurn, normalize, openOriginal, THIEF } from './zsession';
import { ALLOWED, SYNC, WALKTHROUGH } from './zork1-allowlist';

// Native Zork I against the real story file, reply by reply. The yardstick for
// the engine-parity work: a mismatch here is either a bug in the native world
// or the engine, or a known gap listed (with its reason) in the allowlist.

const TROLL_BLOWS = Object.values(zork1.npcs.troll.combat?.messages ?? {})
  .flat()
  .map((m) => normalize([m.replace('{weapon}', 'sword')]));
const struckFirst = (reply: string[]) => TROLL_BLOWS.some((b) => normalize(reply).includes(b));
const died = (reply: string[]) => normalize(reply).includes('you have died');
const trollDied = (reply: string[]) => normalize(reply).includes('almost as soon as the troll breathes his last breath');

class Restart extends Error {}

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

async function originalOnce(commands: string[], seed: number): Promise<string[][]> {
  const { send: raw } = await openOriginal(seed);
  const send = async (c: string) => {
    const reply = await raw(c);
    // The thief wanders the underground at random from the start. A run he turns up in starts over.
    if (THIEF.test(reply.join(' '))) throw new Restart();
    return reply;
  };
  const replies: string[][] = [];
  for (const c of commands) replies.push(c in SYNC ? await sync(c, send) : await send(c));
  return replies;
}

/** The original's replies. Its dice aren't ours, so a run that misses a sync point starts over. */
async function original(commands: string[]): Promise<string[][]> {
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      // Seeded, so the run is the same every time: attempt n plays seed n.
      return await originalOnce(commands, attempt + 1);
    } catch (e) {
      if (!(e instanceof Restart)) throw e;
      localStorage.clear();
    }
  }
  throw new Error('the original never got through the sync points');
}

/** The native replies, from a fixed seed; a run the native thief turns up in starts over with the next. */
function native(commands: string[]): string[][] {
  for (let seed = 1; seed <= 400; seed++) {
    const replies = nativeOnce(commands, seed);
    if (replies && !replies.some((reply) => THIEF.test(reply.join(' ')))) return replies;
  }
  throw new Error('the native thief turned up in every run');
}

/** The game store's turn, minus the LLM: questions, AGAIN and OOPS included. */
/** Null when the thief took anything along the way (he can do it unseen). */
function nativeOnce(commands: string[], seed: number): string[][] | null {
  let state = initialState(zork1);
  state.rng = seed;
  // The thief roams as in the original: a run he turns up in starts over with the next seed, on
  // both sides (stage 5d; his arrival rate is checked by zork1-thief-timing.test.ts).
  openingLines(zork1, state);
  let conv = newConversation();
  const turn = nativeTurn;
  const replies: string[][] = [];
  for (const c of commands) {
    const pilfered = () => Object.entries(state.locations).some(([id, place]) => place === 'thief' && !['stiletto', 'large_bag'].includes(id));
    if (!(c in SYNC)) {
      replies.push(turn(c, state, conv));
      if (pilfered()) return null;
      continue;
    }
    // Try seeds until this side gets through, then carry on from there.
    let done = false;
    for (let attempt = 1; attempt <= 500 && !done; attempt++) {
      const st = structuredClone(state);
      const cv = structuredClone(conv);
      // The run's own seed stays in play past the fight, so each run differs after it too.
      st.rng = seed * 1000 + attempt;
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

  it('allowlisted and sync commands appear once (they’re looked up by name)', () => {
    for (const c of [...ALLOWED.map((a) => a.command), ...Object.keys(SYNC)]) expect(WALKTHROUGH.filter((w) => w === c)).toHaveLength(1);
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
    // The luck line only shows once the mirror's broken.
    const message = (zork1.death?.message ?? []).filter((m): m is string => typeof m === 'string');
    const ours = [...message, ...(zork1.death?.resurrection ?? [])];
    expect(normalize(death)).toContain(normalize(ours));
  }, 180_000);
});
