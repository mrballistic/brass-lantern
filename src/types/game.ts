import { storagePrefix } from '@/app.config';

/** Where an item is: a room ID, 'player', another item's ID, or null (offstage). */
export type Place = string | null;

/** What changes about an item during play. */
export interface ItemState {
  /** Present but not listed (the `unlist` effect). */
  unlisted?: boolean;
  open?: boolean;
  locked?: boolean;
  on?: boolean;
  /** The player has picked it up at least once. */
  moved?: boolean;
  /** Present but unseen (Zork's INVISIBLE): not listed, matched or reached. */
  hidden?: boolean;
}

/** A character's state. Absent fields mean the defaults: where its room lists it, conscious, not fighting. */
export interface NpcState {
  /** Where it is; null when it's gone. Absent: the room that lists it. */
  room?: string | null;
  /** Combat strength. Negative while unconscious; 0 is dead. Absent: its combat strength. */
  strength?: number;
  fighting?: boolean;
  staggered?: boolean;
  /** Percent chance to wake next turn while unconscious (Zork's V-PROB). */
  wake?: number;
  /** In the room but unseen: not listed, matched, reached or fought (Zork's INVISIBLE). */
  hidden?: boolean;
  /** When it last moved rooms, on the same sequence as things' placings (`placed`): listed before anything placed earlier (Zork's object order). */
  seq?: number;
}

/** The player's condition, once anything has hurt them. */
export interface PlayerState {
  /** Strength lost to wounds. */
  wounds?: number;
  /** The carry limit now; absent means the world's limit. */
  load?: number;
  /** Acted-on turns until the next wound heals. */
  cureIn?: number;
  /** Lost the next attack to a blow. */
  staggered?: boolean;
}

export interface GameState {
  /** The vehicle the player is in (Zork's VEHBIT), if any. */
  aboard?: string;
  currentRoom: string;
  /** Every item's parent. Inventory and room contents are derived from it. */
  locations: Record<string, Place>;
  itemState: Record<string, ItemState>;
  /** Rooms entered, in order, each once. */
  visited: string[];
  /** When each item last moved (a counter), so listings can keep pickup order. Absent in older saves. */
  placed?: Record<string, number>;
  /** Numeric variables (`score`, `deaths`, and the world's own). Absent in older saves. */
  vars?: Record<string, number>;
  /** The random generator's state. */
  rng?: number;
  /** VERBOSE, BRIEF or SUPERBRIEF. Unset: brass worlds are verbose, Infocom-style ones brief. */
  verbosity?: 'verbose' | 'brief' | 'superbrief';
  /** Pending one-off events: key → acted-on turns left. */
  fuses?: Record<string, number>;
  flags: Record<string, boolean>;
  moveCount: number;
  gameOver: boolean;
  /** Event scripts that have already fired (gates one-shot events). */
  firedEvents: string[];
  /** Commands nobody understood; rotates the confused replies. Absent in older saves. */
  misses?: number;
  /** Commands the engine acted on; drives timed ambient lines. Absent in older saves. */
  turns?: number;
  /** The player's condition: wounds, the carry limit they lower, healing. Absent in older saves. */
  player?: PlayerState;
  /** Characters' places and states. Absent in older saves. */
  npcs?: Record<string, NpcState>;
}

export type OutputLineType =
  | 'input'
  | 'location'
  | 'event'
  | 'decorative'
  | 'system'
  | 'prose';

export interface OutputLine {
  id: string;
  text: string;
  timestamp: number;
  type: OutputLineType;
}

export interface ParsedAction {
  action: string;
  target?: string;
  /** Second object: the NPC in "give X to Y", the item in "use X on Y". */
  indirect?: string;
  /** For PUT: in or on. */
  prep?: 'in' | 'on';
  /** TAKE ALL BUT …: the words after BUT/EXCEPT. */
  except?: string[];
  /** DISEMBARK reached by STAND or a bare GET OUT/OFF: Zork guesses the vehicle only for DISEMBARK itself. */
  via?: 'stand' | 'out';
  /** CLIMB UP / CLIMB DOWN a thing: the direction to climb it in. */
  direction?: 'up' | 'down';
  /** Bare EXIT (a direction, out), which aboard gets out of the vehicle (Zork's V-EXIT). */
  exit?: boolean;
  /** The targets are IDs (the intent server's answer), so they resolve by ID first. */
  byId?: boolean;
}

export interface SavedState {
  version: string;
  savedAt: string;
  gameState: GameState;
  outputHistory: OutputLine[];
}

export const SAVE_KEY = `${storagePrefix}:save`;
export const SAVE_VERSION = '2.0' as const;
