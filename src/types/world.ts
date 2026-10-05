export interface Room {
  name: string;
  description: string;
  /** Replaces `description` on the first visit only. */
  firstDescription?: string;
  /** Descriptions that depend on the state of things; the first whose `if` holds replaces `description`. */
  descriptions?: Array<{ if: string; text: string }>;
  /** Label → a room ID, or an Exit for conditions, messages and doors. */
  exits: Record<string, string | Exit>;
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
  /** Rules that replace a verb's default here. */
  instead?: RuleTable;
  /** Rules that run after a verb's default succeeds here. */
  after?: RuleTable;
  /** Items present here without being in the room: doors, windows, the sky. Never listed. */
  scenery?: string[];
}

/**
 * A rule on an item or room. The first rule whose `if` holds (and whose `with`
 * matches the other object, when given) wins. It runs an event, prints lines,
 * or both.
 */
export interface Rule {
  /** Condition string (see conditions.ts). */
  if?: string;
  /** The other item, for two-object commands. Must be in reach. */
  with?: string;
  then?: string;
  say?: string[];
}

/** Verb → rules. */
export type RuleTable = Record<string, Rule[]>;

/** A verb the world declares. It does nothing by default: rules give it meaning. */
export interface WorldVerb {
  /** Words and phrases that mean it ("pray", "hit the snooze button"). */
  words: string[];
  target: 'none' | 'optional' | 'required';
  /** Prepositions that introduce a second object ("with", "on"). */
  indirect?: string[];
  /** Printed when no rule applies. Defaults to “Nothing happens.” */
  reply?: string;
  /** Treat it as GO: through the target exit, or the exit labeled with the verb's ID when bare. */
  go?: boolean;
}

/** An exit with conditions. Without `to`, it only prints `denial`. */
export interface Exit {
  to?: string;
  /** Condition for this exit alone. */
  if?: string;
  /** Shown when `if` fails, or always if there's no `to`. (A closed door always says “The <door> is closed.”) */
  denial?: string;
  /** An item (with `door: true`) that must be open. */
  door?: string;
}

export interface EventTrigger {
  if: string;
  then: string;
}

/** One way an item can be used: a Rule, under its older name. */
export type UseRule = Rule;

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
  onUse?: UseRule[];
  /** Rules that replace a verb's default for this item. */
  instead?: RuleTable;
  /** Rules that run after a verb's default succeeds on this item. */
  after?: RuleTable;
  /** Event fired the first time the item is worn. Wearable items only. */
  onWear?: string;
  /** Items that start inside or on this one. */
  contains?: string[];
  /** Makes the item a container; doors use the same block for openable/open/locked/key. */
  container?: Container;
  /** Things can be put on it, and what's on it is always visible and reachable. */
  surface?: boolean;
  /** Present but never listed in the room (the house, the forest). Still examinable. */
  scenery?: boolean;
  /** A door between rooms: exits name it, and pass only while it's open. */
  door?: boolean;
  /** "a", "an", "some", or "" in listings. Defaults by the name's first letter. */
  article?: string;
  /** Heading over this item's contents in listings. */
  contentsHeading?: string;
  /** What READ shows. Defaults to the description. */
  text?: string;
  /** Its own sentence in a room until the player first takes it (Zork's FDESC). */
  initialDescription?: string;
  /** Its own sentence in a room after that (Zork's LDESC). */
  roomDescription?: string;
  /** TURN ON / TURN OFF work on it. */
  switchable?: boolean;
  /** Gives light while on (stage 2 uses it for darkness; listings say “providing light”). */
  light?: boolean;
}

export interface Container {
  /** Has a lid or door. Containers that aren't openable are always open. */
  openable?: boolean;
  /** Starts open. */
  open?: boolean;
  /** Starts locked. */
  locked?: boolean;
  /** The item that locks and unlocks it. */
  key?: string;
  /** You can see inside even when it's closed. */
  transparent?: boolean;
  /** How many items fit directly inside. */
  capacity?: number;
  /** Printed when it opens, instead of the default. */
  opened?: string;
  /** Printed when it closes, instead of the default. */
  closed?: string;
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

/** A step in an event: a line to print (bracket lines also act), or an effect. */
export type EventStep = string | Effect;
export type EventScripts = Record<string, EventStep[]>;

/** What an event step can do besides print. See docs/reference/conditions-and-events.md. */
export type Effect =
  | { say: string }
  | { set: string }
  | { clear: string }
  /** To a room, 'player', an item, or null (offstage). */
  | { move: string; to: string | null }
  | { open: string }
  | { close: string }
  | { lock: string }
  | { unlock: string }
  | { switch: string; on: boolean }
  | { add: string; by: number }
  | { setVar: string; to: number }
  /** Adds to the `score` variable. */
  | { score: number }
  /** Moves the player there and describes it. */
  | { go: string }
  /** Runs an event after this many acted-on turns. */
  | { schedule: string; in: number }
  | { cancel: string }
  | { chance: number; then?: EventStep[]; else?: EventStep[] }
  | { run: string }
  | { die: string }
  | { end: string };
export type DialogueMap = Record<string, NPCDialogue>;

export interface Hint {
  if: string;
  text: string;
}

/** Points for a flag, or for a condition while it holds (a treasure in the case). */
export interface ScoreEntry {
  flag?: string;
  if?: string;
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
  /** The total SCORE reports. Defaults to the sum of `scoring`. */
  maxScore?: number;
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
  /** Starting values for numeric variables (conditions: var:NAME<=N). */
  vars?: Record<string, number>;
  /** Seeds the random generator, for reproducible games. Default: the clock. */
  seed?: number;
  /** Verbs this world adds. They need no engine or intent-server changes. */
  verbs?: Record<string, WorldVerb>;
  /** Output conventions: 'brass' (default) or 'infocom' (Zork's listings and replies). */
  style?: 'brass' | 'infocom';
  /** INVENTORY with nothing carried. Defaults to “You are empty-handed.” */
  emptyInventory?: string;
  /** SMASH where nothing can be smashed. */
  smashRefusal?: string;
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
