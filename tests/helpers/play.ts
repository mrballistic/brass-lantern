import { execute, initialState, openingLines } from '@/engine/engine';
import { fallbackParse, splitCommands } from '@/engine/parser';
import type { World } from '@/types/world';

/** Plays typed lines through the real parser and engine. Returns the state and the transcript. */
export function play(world: World, lines: string[]) {
  const state = initialState(world);
  const log = [...openingLines(world, state)];
  for (const line of lines) {
    log.push(`> ${line}`);
    for (const command of splitCommands(line, world.verbs)) {
      const parsed = fallbackParse(command, world.verbs);
      if (!parsed) throw new Error(`unparsed: ${command}`);
      log.push(...execute(parsed, { world, state }).lines);
    }
  }
  return { state, text: log.join('\n') };
}
