import type { Script } from '@/engine/scripts';

export interface Room {
  name: string;
  description: string;
  /** Replaces `description` on the first visit only. */
  firstDescription?: string;
  /** Needs a light source to see in. */
  dark?: boolean;
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
  /** Refusals with their own reasons, checked first: the first whose `if` holds refuses with `text`. */
  denials?: Array<{ if: string; text: string }>;
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
  /** Weight, for worlds with `carry` (Zork's SIZE). Default 5. */
  size?: number;
  /** Something to fight with. */
  weapon?: boolean;
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
  /** Gives light while on: dark rooms are lit by it; listings say “providing light”. */
  light?: boolean;
  /** Where it goes if the player dies carrying it (Zork's lamp goes back to the living room). */
  home?: string;
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
  /** The total weight it holds (Zork's CAPACITY). */
  weight?: number;
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
  /** Items it holds at the start. Things a character holds aren't visible or reachable. */
  holds?: string[];
  /** Descriptions that depend on the state of things; the first whose condition holds wins. */
  descriptions?: Array<{ if: string; text: string }>;
  /** Rules for verbs aimed at this character (THROW X AT it, GIVE, ATTACK…). */
  instead?: RuleTable;
  after?: RuleTable;
  /** Makes it someone the player can fight. */
  combat?: Combatant;
}

/** What a blow did (Zork's blow results). */
export type BlowResult =
  | 'missed'
  | 'unconscious'
  | 'killed'
  | 'lightWound'
  | 'seriousWound'
  | 'stagger'
  | 'loseWeapon'
  | 'hesitate'
  | 'sittingDuck';

/** For each result, the messages one is picked from. `{weapon}` and `{defender}` are filled in. */
export type BlowMessages = Partial<Record<BlowResult, string[]>>;

/** A character's side of a fight (Zork's VILLAINS table and its ACTION modes). */
export interface Combatant {
  strength: number;
  /** The item it fights with, while it holds it. */
  weapon?: string;
  /** The player's weapon that weakens it, and by how much. */
  fears?: { item: string; by: number };
  /** Percent added each turn to its chance of waking while unconscious. */
  wake?: number;
  /** Percent chance each turn to start a fight while the player is here. */
  firstStrike?: number;
  /** Its blows at the player. */
  messages?: BlowMessages;
  /** Events run when it dies, is knocked out, wakes, or would swing but its weapon is on the floor. */
  onDeath?: string;
  onUnconscious?: string;
  onWake?: string;
  onBusy?: string;
}

/** Fixed lines of a fight, overridable per world. */
export type CombatText =
  | 'bareHands'
  | 'notHolding'
  | 'notWeapon'
  | 'notPerson'
  | 'notCombatant'
  | 'recovering'
  | 'defenceless'
  | 'dies'
  | 'regainsFeet'
  | 'stillHave'
  | 'death';

/** The player's side of fights. */
export interface CombatRules {
  /** The player's blows. */
  messages?: BlowMessages;
  /** Strength from `min` at no score to `max` at `maxScore`. */
  strength?: { min: number; max: number };
  /** Acted-on turns for one wound to heal. */
  cureWait?: number;
  texts?: Partial<Record<CombatText, string>>;
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
  /** To a room, 'player', 'here' (the player's room), an item, a character, or null (offstage). */
  | { move: string; to: string | null }
  /** A character to a room, or null (gone). */
  | { moveNpc: string; to: string | null }
  /** Sets a character's combat state. */
  | { npcState: string; fighting?: boolean; staggered?: boolean; strength?: number }
  /** Runs one of the world's scripts and the steps it returns. */
  | { script: string; arg?: string }
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

/** How much the player can carry (Zork's LOAD-MAX and the fumble rule). */
export interface Carry {
  /** The total weight the player can carry when healthy. */
  limit: number;
  /** The player's own weight, counted in the load (Zork's ADVENTURER SIZE, 5). Default 0. */
  self?: number;
  /** Carrying more than `over` things, each TAKE has `count × chance` percent to fumble. */
  fumble?: { over: number; chance: number };
  tooHeavy?: string;
  /** When wounds have lowered the limit. */
  tooHeavyHurt?: string;
  fumbled?: string;
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
  /** Brass style's header: MOVES (the default), or SCORE and MOVES. Infocom style always shows the room, score and moves. */
  statusLine?: 'moves' | 'score';
  /** The game's full title, for VERSION and transcripts. */
  title?: string;
  /** Lines VERSION prints after the title (copyright, authors). */
  credits?: string[];
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
  /** Texts and behavior for dark rooms. */
  darkness?: {
    /** LOOK and arriving in an unlit dark room. Default: “It is pitch black.” */
    look?: string;
    /** Acting on something you can't see. Default: “It’s too dark to see.” */
    tooDark?: string;
    /** The room going dark around you. Default: “It is now pitch black.” */
    fall?: string;
    /** Run when the player tries a direction with no exit in the dark (Zork's grue). */
    blunder?: EventStep[];
  };
  /** Named endings, played by the `end` effect: lines, then the score if `score`, then the footer. */
  endings?: Record<string, { lines: EventStep[]; score?: boolean; footer?: EventStep[] }>;
  /** What dying does. Without it, dying ends the game. */
  death?: {
    /** Printed after the cause. */
    message?: string[];
    /** Added to the score (Zork: -10). */
    penalty?: number;
    /** Deaths survived before the final one (Zork: 2). */
    lives?: number;
    /** Where the player wakes. */
    respawn?: string;
    resurrection?: string[];
    /** Rooms carried things are spread over, at random. Things with a `home` go there instead. */
    scatter?: string[];
    /** Printed on the last death, which ends the game. */
    final?: string[];
  };
  /** Run after every acted-on turn while their condition holds (a lamp burning down). */
  daemons?: Array<{ if: string; then: string | EventStep[] }>;
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
  /** The code hatch: named functions that return steps. See `src/engine/scripts.ts`. */
  scripts?: Record<string, Script>;
  /** Carrying weight. Without it there's no limit. */
  carry?: Carry;
  /** Fights: the player's blows, strength and healing. */
  combat?: CombatRules;
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
