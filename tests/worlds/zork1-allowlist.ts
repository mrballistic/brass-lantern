/** A command whose native reply is allowed to differ from the original, and why. */
export interface AllowedDifference {
  command: string;
  reason: string;
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
  'score',
];

// The walkthrough skips the sword: with it, Zork's weight limit refuses the egg
// (“Your load is too heavy.”), and carrying weight is stage 4.
export const ALLOWED: AllowedDifference[] = [];

/**
 * Lines the original prints at random, removed from its replies before
 * comparing. Seeded randomness (and the songbird with it) is stage 2.
 */
export const RANDOM_LINES: string[] = ['You hear in the distance the chirping of a song bird.'];
