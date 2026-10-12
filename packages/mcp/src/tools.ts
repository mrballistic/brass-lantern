import type { Game, World } from '@brass-lantern/engine';
import type { ResolvedEngine } from './engine.ts';
import type { LoadedWorld } from './load.ts';

export const MAX_COMMANDS = 500;
export const MAX_LINES = 2000;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The lines every engine tool opens with: which world, which engine. */
function header(loaded: LoadedWorld, resolved: ResolvedEngine): string[] {
  const whose = resolved.source === 'project' ? 'the project’s' : 'bundled with the MCP server';
  return [
    `World: ${loaded.exportName} in ${loaded.file}`,
    `Engine: @brass-lantern/engine ${resolved.version} (${whose})`,
    ...(resolved.note ? [`Note: ${resolved.note}`] : []),
  ];
}

export function auditReport(loaded: LoadedWorld, resolved: ResolvedEngine): string {
  const w = loaded.world;
  const problems = resolved.engine.auditWorld(w);
  const size = [
    count(Object.keys(w.rooms).length, 'room', 'rooms'),
    count(Object.keys(w.items).length, 'item', 'items'),
    count(Object.keys(w.npcs).length, 'character', 'characters'),
    count(Object.keys(w.events ?? {}).length, 'event', 'events'),
  ].join(', ');
  return [
    ...header(loaded, resolved),
    `Size: ${size}`,
    '',
    problems.length === 0 ? 'No problems.' : `${count(problems.length, 'problem', 'problems')}:`,
    ...problems.map((p) => `- ${p}`),
  ].join('\n');
}

/** The pieces of a typed line the regex parser can’t read (what the intent server would be asked about). */
function unread(resolved: ResolvedEngine, world: World, line: string): string[] {
  const { splitCommands, fallbackParse, andNames } = resolved.engine;
  if (!splitCommands || !fallbackParse) return [];
  return splitCommands(line, world.verbs, andNames?.(world)).filter((piece) => !fallbackParse(piece, world.verbs));
}

/** The score SCORE reports: the `scoring` entries that hold, plus `vars.score` (null when the world never scores). */
function scoreOf(resolved: ResolvedEngine, world: World, state: Game['state']): number | null {
  const entries = world.scoring ?? [];
  const base = state.vars?.score;
  if (entries.length === 0) return base ?? null;
  const { evaluateCondition } = resolved.engine;
  const earned = (e: (typeof entries)[number]) => (e.flag ? Boolean(state.flags[e.flag]) : e.if && evaluateCondition ? evaluateCondition(e.if, state, world) : false);
  return entries.reduce((sum, e) => sum + (earned(e) ? e.points : 0), base ?? 0);
}

export function playReport(loaded: LoadedWorld, resolved: ResolvedEngine, commands: string[], seed = 1): string {
  const world = loaded.world;
  const game = resolved.engine.createGame(world, { seed });
  const run = commands.slice(0, MAX_COMMANDS);
  const transcript: string[] = [...game.opening];
  let awaiting = false;
  let ran = 0;
  let over = game.state.gameOver;
  for (const command of run) {
    if (over) break;
    transcript.push(`> ${command}`);
    // An answer to “Which do you mean?” isn’t a command, so it isn’t checked as one.
    const missed = awaiting ? [] : unread(resolved, world, command);
    if (missed.length > 0) {
      transcript.push(`[not understood by the parser: ${missed.map((p) => `“${p}”`).join(', ')}. With the intent server running, an LLM would get a chance to read it.]`);
    }
    const reply = game.send(command);
    transcript.push(...reply.lines);
    awaiting = reply.awaiting;
    over = reply.gameOver;
    ran += 1;
  }
  const shown = transcript.length > MAX_LINES ? [...transcript.slice(0, MAX_LINES), `[… ${transcript.length - MAX_LINES} more lines cut (over ${MAX_LINES})]`] : transcript;
  const s = game.state;
  const state = {
    room: `${world.rooms[s.currentRoom]?.name ?? s.currentRoom} (${s.currentRoom})`,
    inventory: Object.entries(s.locations ?? {})
      .filter(([, place]) => place === 'player')
      .map(([id]) => world.items[id]?.name ?? id),
    flags: Object.keys(s.flags).filter((f) => s.flags[f]).sort(),
    score: scoreOf(resolved, world, s),
    moves: s.moveCount,
    gameOver: s.gameOver,
  };
  const notes = [
    ...(commands.length > MAX_COMMANDS ? [`Only the first ${MAX_COMMANDS} commands ran.`] : []),
    ...(over && ran < run.length ? [`Game over after ${ran} of ${run.length} commands.`] : []),
  ];
  return [...header(loaded, resolved), `Seed: ${seed}`, '', ...shown, '', ...notes, 'Final state:', '```json', JSON.stringify(state, null, 2), '```'].join('\n');
}
