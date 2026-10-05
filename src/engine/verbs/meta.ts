import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { ok, type EngineResult } from '../result';

export function scoreLines(world: World, state: GameState): string[] {
  const scoring = world.scoring ?? [];
  if (scoring.length === 0) return [];
  const max = scoring.reduce((sum, s) => sum + s.points, 0);
  const score = scoring.reduce((sum, s) => sum + (state.flags[s.flag] ? s.points : 0), 0);
  const rank = [...(world.ranks ?? [])].sort((a, b) => b.min - a.min).find((r) => score >= r.min);
  const lines = [`[Score: ${score} of ${max}, in ${state.moveCount} moves.]`];
  if (rank) lines.push(`[Rank: ${rank.title}]`);
  return lines;
}

export function handleHint(world: World, state: GameState): EngineResult {
  const hint = (world.hints ?? []).find((h) => evaluateCondition(h.if, state, world));
  return ok([hint ? `[Hint] ${hint.text}` : '[Hint] You’re on your own here. Try LOOK.']);
}

export function handleScore(world: World, state: GameState): EngineResult {
  const lines = scoreLines(world, state);
  return ok(lines.length > 0 ? lines : [`[Moves: ${state.moveCount}]`]);
}

export function handleHelp(world: World): EngineResult {
  const own = Object.entries(world.verbs ?? {}).map(
    ([id, v]) => `${id.toUpperCase().padEnd(25)}${v.words.filter((w) => w !== id).join(', ')}`.trimEnd(),
  );
  return ok([
    '═══════ COMMANDS ═══════',
    'GO <direction|place>     N / S / E / W also work',
    'LOOK                     Re-describe the current location',
    'TAKE <item>              Pick up an item (synonyms: GET, GRAB; TAKE ALL)',
    'DROP <item>              Drop an item from your inventory',
    'EXAMINE <item|npc>       Inspect (synonyms: INSPECT, LOOK AT)',
    'USE <item> [ON <thing>]  Use an item, or use it on something',
    'OPEN / CLOSE <thing>     Containers and doors',
    'LOCK / UNLOCK <thing> WITH <key>',
    'PUT <item> IN|ON <thing> Put something in a container or on a surface',
    'TAKE <item> FROM <thing> Take something out',
    'LOOK IN <thing>          See what’s inside (also SEARCH)',
    'GIVE <item> TO <npc>     Hand something over',
    'WEAR <item>              Put on a wearable',
    'TALK TO <npc>            Speak with someone (synonyms: ASK)',
    'INVENTORY / I            List what you are carrying',
    'SMASH <target>           Apply violence',
    'WAIT / Z                 Let time pass',
    'HINT                     A nudge in the right direction',
    'SCORE                    Your score so far',
    'SAVE / LOAD              Local terminal memory',
    'RESTART                  Wipe save and start over',
    'COOKIES                  Analytics settings',
    'HELP / ?                 This screen',
    ...own,
    '════════════════════════',
    'Chain commands: TAKE KEY AND WALLET, WEST THEN LOOK.',
    'You can also just type what you want to do in plain English.',
  ]);
}

export function handleUnknown(world: World, state: GameState): EngineResult {
  const pool = world.confused ?? [];
  const misses = state.misses ?? 0;
  state.misses = misses + 1;
  const line =
    pool.length > 0
      ? pool[misses % pool.length]
      : 'I don’t understand that. Type HELP for commands, or try saying it differently.';
  return { lines: [line], mutated: false, understood: false };
}
