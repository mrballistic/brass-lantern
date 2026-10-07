import type { GameState } from '@/types/game';
import type { World, WorldVerb } from '@/types/world';
import { evaluateCondition } from '../conditions';
import { BUILT_IN_WORDS } from '../parser';
import { ok, type EngineResult } from '../result';

/** The score so far: scoring entries earned, plus the `score` var. */
export { currentScore } from '../score';
import { currentScore } from '../score';

/** The header's status: Zork's room, score and moves in Infocom style; MOVES (or SCORE and MOVES) in brass. */
export function statusText(world: World, state: GameState): string {
  if (world.style === 'infocom') {
    const room = world.rooms[state.currentRoom]?.name ?? '';
    return `${room}  Score: ${currentScore(world, state)}  Moves: ${state.moveCount}`;
  }
  if (world.statusLine === 'score') return `SCORE: ${currentScore(world, state)}  MOVES: ${state.moveCount}`;
  return `MOVES: ${state.moveCount}`;
}

/** What SCRIPT and UNSCRIPT say: Zork's wording when the world has a title, brackets otherwise. */
export function scriptLines(world: World, which: 'start' | 'stop'): string[] {
  if (world.style === 'infocom' && world.title) {
    return [`Here ${which === 'start' ? 'begins' : 'ends'} a transcript of interaction with`, world.title];
  }
  return [which === 'start' ? '[Transcript started.]' : '[Transcript saved.]'];
}

export function scoreLines(world: World, state: GameState): string[] {
  const scoring = world.scoring ?? [];
  // A world keeps score with `scoring`, or with the `score` effect and a `maxScore`.
  if (scoring.length === 0 && world.maxScore === undefined) return [];
  const max = world.maxScore ?? scoring.reduce((sum, s) => sum + Math.max(0, s.points), 0);
  const score = currentScore(world, state);
  const rank = [...(world.ranks ?? [])].sort((a, b) => b.min - a.min).find((r) => score >= r.min);
  const infocom = world.style === 'infocom';
  // Zork reports the turns before this one.
  const moves = infocom ? (state.turns ?? 0) : state.moveCount;
  const fill = (template: string) =>
    template
      .replace(/\{score\}/g, String(score))
      .replace(/\{max\}/g, String(max))
      .replace(/\{moves\}/g, `${moves} move${moves === 1 ? '' : 's'}`)
      .replace(/\{rank\}/g, rank?.title ?? '');
  const lines = [
    world.scoreLine
      ? fill(world.scoreLine)
      : infocom
        ? `Your score is ${score} (total of ${max} points), in ${moves} move${moves === 1 ? '' : 's'}.`
        : `[Score: ${score} of ${max}, in ${moves} move${moves === 1 ? '' : 's'}.]`,
  ];
  if (rank) lines.push(world.rankLine ? fill(world.rankLine) : infocom ? `This gives you the rank of ${rank.title}.` : `[Rank: ${rank.title}]`);
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
  // An afterBuiltIns verb's built-in words are the built-in verb's to list; one with only those isn't listed.
  const words = (v: WorldVerb) => (v.afterBuiltIns ? v.words.filter((w) => !BUILT_IN_WORDS.has(w.toLowerCase())) : v.words);
  const own = Object.entries(world.verbs ?? {})
    .filter(([, v]) => words(v).length > 0)
    .map(([id, v]) => `${id.toUpperCase().padEnd(25)}${words(v).filter((w) => w !== id).join(', ')}`.trimEnd());
  return ok([
    '═══════ COMMANDS ═══════',
    'GO <direction|place>     N S E W NE NW SE SW U D also work',
    'ENTER / CLIMB <thing>    Go in, or up',
    'LOOK                     Re-describe the current location',
    'TAKE <item>              Pick up an item (synonyms: GET, GRAB; TAKE ALL)',
    'DROP <item>              Drop an item from your inventory',
    'EXAMINE <item|npc>       Inspect (synonyms: INSPECT, LOOK AT, X)',
    'READ <thing>             Read what’s written on it (also READ … THROUGH <lens>)',
    'TURN ON / OFF <thing>    Lamps and the like (also LIGHT)',
    'TURN <thing> TO <n>      Set a dial or the like (also SET … TO)',
    'BURN <thing> WITH <item> Set it alight (also LIGHT … WITH)',
    'BOARD / GET OUT <thing>  Get in or out of a vehicle (also DISEMBARK, EXIT)',
    'USE <item> [ON <thing>]  Use an item, or use it on something',
    'OPEN / CLOSE <thing>     Containers and doors',
    'LOCK / UNLOCK <thing> WITH <key>',
    'PUT <item> IN|ON <thing> Put something in a container or on a surface',
    'PUT <item> UNDER|BEHIND <thing>',
    'THROW <item> OFF|OVER <thing>',
    'PUSH <thing> <direction> Or PUSH <thing> TO <place>',
    'TAKE <item> FROM <thing> Take something out',
    'LOOK IN <thing>          See what’s inside (also SEARCH)',
    'GIVE <item> TO <npc>     Hand something over',
    'WEAR <item>              Put on a wearable',
    'TALK TO <npc>            Speak with someone (synonyms: ASK)',
    'INVENTORY / I            List what you are carrying',
    'SMASH <target>           Apply violence',
    'ATTACK <someone> WITH <weapon>  Fight (also KILL, STAB)',
    'THROW <item> [AT <target>]      Throw something',
    'DIAGNOSE                 How badly you’re hurt',
    'ASK <someone> ABOUT <thing>     Ask (or TELL) about something',
    '<someone>, <command>     Tell someone to do something',
    'WAIT / Z                 Let time pass',
    'HINT                     A nudge in the right direction',
    'SCORE                    Your score so far',
    'VERBOSE / BRIEF / SUPERBRIEF  How much rooms describe themselves',
    'AGAIN / G                Do the last thing again',
    'OOPS <word>              Fix a mistyped word in the last line',
    'UNDO                     Take back the last move',
    'SCRIPT / UNSCRIPT        Start, then download, a transcript',
    'VERSION                  What you’re playing, and its credits',
    'SAVE <name>              Save the game under a name',
    'RESTORE <name>           Go back to a named save',
    'LOAD                     Go back to the autosave',
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
