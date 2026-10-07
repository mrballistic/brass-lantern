import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { interpret, newConversation, remember, resolvePronouns } from '@/engine/conversation';
import { captureLine, execute, initialState, openingLines, type EngineResult } from '@/engine/engine';
import { fallbackParse } from '@/engine/parser';
import type { GameState, ParsedAction } from '@/types/game';
import { zork1 } from '@/worlds/zork1';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { ZMachineSession } from '@/zmachine/session';
import { RANDOM_LINES } from './zork1-allowlist';

// Runs commands through native Zork I and through the real story file, both seeded,
// for the differential tests. Callers need the happy-dom environment (saves use localStorage).

export const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));

/** Same text, give or take case, spacing, quote style and the room marker. */
export function normalize(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/📍 /g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export const THIEF = /large bag|seedy-looking|\bthief\b|\brobber\b/i;

/** A fresh session of the original, past its banner. `send` answers with the reply's lines. */
export async function openOriginal(seed?: number): Promise<{ send: (command: string) => Promise<string[]> }> {
  let lines: string[] = [];
  let waiting = false;
  const session = new ZMachineSession(
    story,
    new LocalStorageDialog('diff'),
    {
      onLines: (l) => lines.push(...l),
      onStatus: () => {},
      onExit: () => {},
      onWaiting: () => {
        waiting = true;
      },
      onError: (m) => {
        throw new Error(m);
      },
    },
    { seed },
  );
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
  session.start();
  await settle(); // the banner and the first room
  return {
    send: async (c: string) => {
      session.submit(c);
      return (await settle()).filter((l) => !RANDOM_LINES.includes(l));
    },
  };
}

export async function originalRun(commands: string[], seed: number): Promise<string[][]> {
  localStorage.clear();
  const { send } = await openOriginal(seed);
  const replies: string[][] = [];
  for (const c of commands) replies.push(await send(c));
  return replies;
}

/** The game store's turn, minus the LLM: questions, AGAIN and OOPS included. */
export function nativeTurn(c: string, state: GameState, conv: ReturnType<typeof newConversation>): string[] {
  const run = (action: ParsedAction): EngineResult => {
    const result = execute(action, { world: zork1, state });
    remember(conv, action, result);
    return result;
  };
  if (!conv.pending) {
    const captured = captureLine(zork1, state, c);
    if (captured) return captured.lines;
  }
  const step = interpret(c, conv, zork1, state);
  if ('reply' in step) return step.reply;
  if ('run' in step) return run(step.run).lines;
  const parsed = fallbackParse(step.parse, zork1.verbs);
  const result = run(parsed ? resolvePronouns(parsed, conv) : { action: 'unknown' });
  conv.lastUnknown = result.understood === false ? step.parse : null;
  return [...(step.note ?? []), ...result.lines];
}

/** A fresh native game from a seed. */
export function openNative(seed: number): { state: GameState; send: (command: string) => string[] } {
  const state = initialState(zork1);
  state.rng = seed;
  openingLines(zork1, state);
  const conv = newConversation();
  return { state, send: (c) => nativeTurn(c, state, conv) };
}

export function nativeRun(commands: string[], seed: number): string[][] {
  const { send } = openNative(seed);
  return commands.map((c) => send(c));
}

/** West of House to the Round Room with the lamp lit, the sword, the bottle and the rope; `@fight` fights the troll to the death. */
export const PREFIX = [
  'north', 'east', 'open window', 'west', 'take bottle', 'west', 'take sword', 'take lamp', 'turn on lamp',
  'east', 'up', 'take rope', 'down', 'west', 'move rug', 'open trap door', 'down', 'north', '@fight', 'east', 'east',
];

/** Other openings a session can ask for with a first command `@prefix:<name>` (5c). */
export const PREFIXES: Record<string, string[]> = {
  // The garlic from the kitchen's sack, for the bat.
  garlic: [...PREFIX.slice(0, 5), 'open sack', 'take garlic', ...PREFIX.slice(5)],
  // The lunch from the kitchen's sack, for the cyclops.
  lunch: [...PREFIX.slice(0, 5), 'open sack', 'take lunch', ...PREFIX.slice(5)],
  // Into the house and the lamp lit, but still above ground (5d).
  surface: PREFIX.slice(0, 9),
};

const died = (reply: string[]) => normalize(reply).includes('you have died');
const trollDied = (reply: string[]) => normalize(reply).includes('almost as soon as the troll breathes his last breath');

export type Side = 'native' | 'original';

/** “Almost as soon as the troll breathes his last breath…”: a character's death line in a fight. */
const foeDied = (reply: string[], foe: string) => normalize(reply).includes(`almost as soon as the ${foe} breathes his last breath`);

/**
 * Plays commands, with fights as sync points: `@fight <foe> with <weapon>` attacks until the foe's
 * death line (at most 15 blows), as one reply. Null if the player died in a fight or one didn't end.
 */
export async function playCommands(send: (c: string) => Promise<string[]> | string[], commands: string[]): Promise<string[][] | null> {
  const replies: string[][] = [];
  for (const c of commands) {
    const fight = c.match(/^@fight (\w+) with (.+)$/);
    if (!fight) {
      replies.push(await send(c));
      continue;
    }
    const [, foe, weapon] = fight;
    const blows: string[] = [];
    let over = false;
    for (let i = 0; i < 15 && !over; i++) {
      const reply = await send(`kill ${foe} with ${weapon}`);
      blows.push(...reply);
      if (died(reply)) return null;
      over = foeDied(reply, foe);
    }
    if (!over) return null;
    replies.push(blows);
  }
  return replies;
}

/** Plays an opening (PREFIX's `@fight` kills the troll); its replies, or null if the player died, the troll lived, or something was stolen. */
export async function playPrefix(send: (c: string) => Promise<string[]> | string[], opening: string[] = PREFIX, pilfered: () => boolean = () => false): Promise<string[][] | null> {
  const seen: string[][] = [];
  for (const c of opening) {
    if (c !== '@fight') {
      seen.push(await send(c));
      if (pilfered()) return null;
      continue;
    }
    let dead = false;
    for (let i = 0; i < 12 && !dead; i++) {
      const reply = await send('kill troll with sword');
      seen.push(reply);
      if (died(reply)) return null;
      dead = trollDied(reply);
    }
    if (!dead) return null;
  }
  return seen;
}

/**
 * PREFIX, then `commands`; the replies to `commands` only. Null if the player died
 * in the prefix, the troll survived, or the thief showed up anywhere.
 */
export async function prefixed(side: Side, commands: string[], seed: number): Promise<string[][] | null> {
  const named = commands[0]?.startsWith('@prefix:') ? commands[0].slice('@prefix:'.length) : undefined;
  const opening = named ? PREFIXES[named] : PREFIX;
  if (named) commands = commands.slice(1);
  let send: (c: string) => Promise<string[]> | string[];
  // The thief can steal without a word; natively that shows in the state.
  let pilfered = () => false;
  if (side === 'original') {
    localStorage.clear();
    send = (await openOriginal(seed)).send;
  } else {
    const game = openNative(seed);
    send = game.send;
    pilfered = () => Object.entries(game.state.locations).some(([id, place]) => place === 'thief' && !['stiletto', 'large_bag'].includes(id));
  }
  const seen = await playPrefix(send, opening, pilfered);
  if (!seen) return null;
  const replies: string[][] = [];
  for (const c of commands) {
    replies.push(await send(c));
    if (pilfered()) return null;
  }
  if (seen.some(died) || [...seen, ...replies].some((r) => THIEF.test(r.join(' ')))) return null;
  return replies;
}

/** The first seed (1..tries) whose run gets through and is accepted. For choosing a session's pinned seed. */
export async function findSeed(side: Side, commands: string[], accept: (replies: string[][]) => boolean = () => true, tries = 300): Promise<number> {
  for (let seed = 1; seed <= tries; seed++) {
    const replies = await prefixed(side, commands, seed);
    if (replies && accept(replies)) return seed;
  }
  throw new Error(`no ${side} seed got through`);
}

/** Mismatch reports, one per differing reply; empty when the sides agree. */
export function compare(native: string[][], original: string[][], commands: string[]): string[] {
  const out: string[] = [];
  // SCORE's move count depends on how long each side's troll fight in PREFIX ran.
  const same = (r: string[]) => normalize(r).replace(/, in \d+ moves?\./g, ', in # moves.');
  if (commands[0]?.startsWith('@prefix:')) commands = commands.slice(1);
  commands.forEach((command, i) => {
    if (same(native[i] ?? []) === same(original[i] ?? [])) return;
    out.push(`> ${command}\n  native:   ${(native[i] ?? []).join(' / ')}\n  original: ${(original[i] ?? []).join(' / ')}`);
  });
  return out;
}

/**
 * Chapter `k` of a chaptered walkthrough (stage 5d): plays chapters 0..k from the start of the
 * game and returns chapter k's replies. Null if the player died or a fight didn't end, or if the
 * thief showed himself in a chapter that doesn't allow him.
 */
export async function chapterRun(
  side: Side,
  chapters: Array<{ name: string; commands: string[]; thief?: boolean }>,
  k: number,
  seed: number,
): Promise<string[][] | null> {
  if (side === 'original') localStorage.clear();
  const game = side === 'original' ? await openOriginal(seed) : openNative(seed);
  let last: string[][] | null = null;
  for (const chapter of chapters.slice(0, k + 1)) {
    last = await playCommands(game.send, chapter.commands);
    if (!last || (!chapter.thief && last.some((r) => THIEF.test(r.join(' '))))) return null;
  }
  return last;
}

/** Both sides' chapter replies, or an error naming the chapter (a seed that no longer gets through). */
export function requireRuns(name: string, native: string[][] | null, original: string[][] | null): [string[][], string[][]] {
  if (!native || !original) throw new Error(`${name}: a pinned seed no longer gets through (native ${Boolean(native)}, original ${Boolean(original)}); re-run the chapter seed search`);
  return [native, original];
}

/**
 * A chapter's differences, fights (`@…`) aside. `exact`: reply by reply (`compare`); `lines`:
 * every native line must be one the original printed somewhere in the chapter.
 */
export function chapterProblems(commands: string[], native: string[][], original: string[][], mode: 'exact' | 'lines'): string[] {
  const keep = commands.map((c) => !c.startsWith('@'));
  const cmds = commands.filter((_, i) => keep[i]);
  const n = native.filter((_, i) => keep[i]);
  const o = original.filter((_, i) => keep[i]);
  if (mode === 'exact') return compare(n, o, cmds);
  const theirs = new Set(o.flat().map((l) => normalize([l])).filter(Boolean));
  const missing = [...new Set(n.flat().map((l) => normalize([l])).filter((l) => l && !theirs.has(l)))];
  return missing.map((l) => `native line not in the original: ${l}`);
}
