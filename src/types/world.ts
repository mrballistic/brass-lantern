export interface Room {
  name: string;
  description: string;
  exits: Record<string, string>;
  /**
   * Exit labels to show the player, in order. Rooms carry many synonym exits
   * (east, cubicles, cubicle_farm) so the parser is forgiving; listing them
   * all reads as noise. Omit to list every exit.
   */
  listExits?: string[];
  items: string[];
  npcs: string[];
  onEnter: EventTrigger[];
  requires?: string;
  /** Shown when `requires` fails. Falls back to a generic refusal. */
  denial?: string;
}

export interface EventTrigger {
  if: string;
  then: string;
}

/**
 * One way an item can be used. Rules are tried in order and the first whose
 * conditions hold wins. A rule fires an event (`then`), prints lines (`say`),
 * or both.
 */
export interface UseRule {
  /** Condition string (see conditions.ts). */
  if?: string;
  /** Another item that must be visible or carried for this rule to apply. */
  with?: string;
  then?: string;
  say?: string[];
}

export interface Item {
  name: string;
  /** Other words the parser should accept for this item ("disk", "virus"). */
  aliases?: string[];
  description: string;
  portable: boolean;
  tags: string[];
  /** Shown when the player tries to take a non-portable item. */
  refusal?: string;
  onTake?: string;
  onSmash?: string;
  onSnooze?: string;
  onUse?: UseRule[];
  /** Event fired the first time the item is worn. Wearable items only. */
  onWear?: string;
  /** Items that start inside or on this one. */
  contains?: string[];
}

export interface NPC {
  name: string;
  description: string;
  /** Item ID → event fired when the player gives that item. The item is handed over. */
  onGive?: Record<string, string>;
  /** Item ID → line for a specific gift they won't take. The player keeps the item. */
  refuse?: Record<string, string>;
  /** Shown when the player offers something not in `onGive` or `refuse`. */
  refuseGift?: string;
}

export interface NPCDialogue {
  default: string;
  [flagCondition: string]: string;
}

export type EventScripts = Record<string, string[]>;
export type DialogueMap = Record<string, NPCDialogue>;

export interface Hint {
  if: string;
  text: string;
}

export interface ScoreEntry {
  flag: string;
  points: number;
}

export interface Rank {
  /** Minimum score for this rank. */
  min: number;
  title: string;
}

export interface World {
  rooms: Record<string, Room>;
  items: Record<string, Item>;
  npcs: Record<string, NPC>;
  events: EventScripts;
  dialogue: DialogueMap;
  startRoom: string;
  /**
   * Friendly labels used in `[Flag set: …]` event lines, lowercased, mapped to
   * the flag IDs that conditions test.
   */
  flagLabels: Record<string, string>;
  /** First hint whose condition holds is shown for HINT. */
  hints?: Hint[];
  /** Points awarded per flag; SCORE and the epilogue total them. */
  scoring?: ScoreEntry[];
  /** Highest `min` the score reaches wins. */
  ranks?: Rank[];
  /** Reply to QUIT. */
  quit?: string;
  /** Reply to WAIT or SIT where they don’t lead anywhere. Defaults to “Time passes.” */
  idle?: string;
  /** Replies for input nobody could understand, rotated so they don’t repeat. */
  confused?: string[];
  /** The win condition. See Finale. */
  finale?: Finale;
  /** Lines that interrupt on a timer while a condition holds (a ringing phone). */
  ambient?: Ambient[];
}

/**
 * Every `every` turns while `if` holds, print the next line from `lines`,
 * cycling. A turn is any command the engine acted on.
 */
export interface Ambient {
  if: string;
  every: number;
  lines: string[];
}

/**
 * Smashing `item` in `room` while carrying `with` fires `event`, then every
 * epilogue trigger whose condition holds, then the score, then `footer`, and
 * ends the game.
 */
export interface Finale {
  room: string;
  item: string;
  with: string;
  event: string;
  epilogue: EventTrigger[];
  footer: string;
  /** One-shot event for smashing `item` without `with`. */
  bareHanded?: string;
  /** Shown on later bare-handed attempts. */
  bareHandedAgain?: string;
  /** Shown when carrying `with` but somewhere other than `room`. */
  wrongRoom?: string;
}
