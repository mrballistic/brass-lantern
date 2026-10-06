import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { interpret, newConversation, remember, resolvePronouns } from '@/engine/conversation';
import { execute, initialState, openingLines, type EngineResult } from '@/engine/engine';
import type { ParsedAction } from '@/types/game';
import { fallbackParse } from '@/engine/parser';
import { zork1 } from '@/worlds/zork1';
import { LocalStorageDialog } from '@/zmachine/dialog';
import { ZMachineSession } from '@/zmachine/session';
import { ALLOWED, RANDOM_LINES, WALKTHROUGH } from './zork1-allowlist';

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

async function original(commands: string[]): Promise<string[][]> {
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
  session.start();
  await settle(); // the banner and the first room
  for (const c of commands) {
    session.submit(c);
    replies.push((await settle()).filter((l) => !RANDOM_LINES.includes(l)));
  }
  return replies;
}

/** The game store's turn, minus the LLM: questions, AGAIN and OOPS included. */
function native(commands: string[]): string[][] {
  const state = initialState(zork1);
  openingLines(zork1, state);
  const conv = newConversation();
  const run = (action: ParsedAction): EngineResult => {
    const result = execute(action, { world: zork1, state });
    remember(conv, action, result);
    return result;
  };
  return commands.map((c) => {
    const step = interpret(c, conv, zork1, state);
    if ('reply' in step) return step.reply;
    if ('run' in step) return run(step.run).lines;
    const parsed = fallbackParse(step.parse, zork1.verbs);
    const result = run(parsed ? resolvePronouns(parsed, conv) : { action: 'unknown' });
    conv.lastUnknown = result.understood === false ? step.parse : null;
    return [...(step.note ?? []), ...result.lines];
  });
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
  }, 30_000);

  it('every allowlisted difference is still a difference', async () => {
    const theirs = await original(WALKTHROUGH);
    const ours = native(WALKTHROUGH);
    for (const { command } of ALLOWED) {
      const i = WALKTHROUGH.indexOf(command);
      expect(i, `allowlisted “${command}” isn’t in the walkthrough`).toBeGreaterThanOrEqual(0);
      expect(normalize(ours[i]), `“${command}” now matches; remove it from the allowlist`).not.toBe(normalize(theirs[i]));
    }
  }, 30_000);

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
  }, 30_000);
});
