/** A command whose native reply is allowed to differ from the original, and why. */
export interface AllowedDifference {
  command: string;
  reason: string;
  /** Depends on chance, so it may happen to match: not required to differ. */
  random?: boolean;
}

/**
 * One pass through the stage-1 slice. Commands must be unique (the allowlist
 * keys on them), so repeated moves use synonyms: north, n, go north.
 */
export const WALKTHROUGH: string[] = [
  'look',
  'examine mailbox',
  'open mailbox',
  'take leaflet',
  'read leaflet',
  'drop leaflet',
  'north',
  'east',
  'examine window',
  'open window',
  'west',
  'open sack',
  'take sack',
  'take bottle',
  'w',
  'take lamp',
  'turn on lamp',
  'move rug',
  'open trap door',
  'close trap door',
  'e',
  'up',
  'take rope',
  'take knife',
  'd',
  'go east',
  'n',
  'go north',
  'u',
  'take egg',
  'go down',
  'inventory',
  // Stage 2: back into the house, and down the trap door with the lamp lit.
  's',
  'walk east',
  'go west',
  'walk west',
  'turn off lamp',
  'turn on brass lantern',
  'open the trap door',
  'down',
  'south',
  'run east',
  'take painting',
  'walk north',
  'climb up',
  'drop sack',
  'drop bottle',
  'drop rope',
  'drop knife',
  'drop egg',
  'go up',
  'run west',
  'open case',
  'put painting in case',
  'verbose',
  'l',
  'brief',
  'score',
  // Stage 3: the parser. Questions and their answers, AGAIN, OOPS, ALL.
  'examine case',
  'g',
  'examine lanturn',
  'oops lantern',
  'take',
  'the sword',
  'open door',
  'trap',
  'drop all',
  'take all',
  // Stage 4a: down to the troll with the sword, fight him, and go on east.
  // Repeated moves use another case (Zork ignores it) to keep commands unique.
  'walk down',
  '@enter-troll-room',
  '@fight',
  'take axe',
  'go e',
  'East',
  'LOOK',
  'diagnose',
  'SCORE',
  'West',
  'WEST',
  // Stage 4b: through the maze to the cyclops, ULYSSES, and the Strange Passage home.
  'west',
  'south',
  'east',
  'up',
  'take key',
  'take coins',
  'take rusty knife',
  'southwest',
  'east',
  'south',
  'southeast',
  'throw axe at cyclops',
  'wait',
  'wait',
  'ulysses',
  'east',
  'east',
  'put coins in case',
];

/**
 * Sync points. Each side keeps retrying one of these until the condition holds:
 * the original by starting its session again, the native port by trying the
 * next seed. Randomness differs between the two, so these are where they're
 * brought back into step.
 */
export const SYNC: Record<string, { command: string; until: 'noFirstStrike' | 'trollDead' }> = {
  // Walking in, the troll may strike first (a third of the time).
  '@enter-troll-room': { command: 'run north', until: 'noFirstStrike' },
  // Attack until the troll is dead; a side whose player dies starts over.
  '@fight': { command: 'kill troll with sword', until: 'trollDead' },
};

// The walkthrough carries the sword from stage 4a on; the egg-and-sword load is checked in zork1.test.ts.
export const ALLOWED: AllowedDifference[] = [
  { command: '@fight', random: true, reason: 'A random fight: compared line by line in zork1-fight.test.ts instead.' },
  { command: 'diagnose', random: true, reason: 'Wounds depend on how the random fight went.' },
  { command: 'SCORE', random: true, reason: 'The move count depends on how long the random fight ran.' },
  {
    command: 'examine lanturn',
    reason: 'Unknown words differ by design: Zork names the word, the native engine says it didn’t understand and asks the LLM.',
  },
];

/**
 * Lines the original prints at random, removed from its replies before
 * comparing. Seeded randomness (and the songbird with it) is stage 2.
 */
export const RANDOM_LINES: string[] = ['You hear in the distance the chirping of a song bird.'];
