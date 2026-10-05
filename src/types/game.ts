import { storagePrefix } from '@/app.config';

export interface GameState {
  currentRoom: string;
  inventory: string[];
  flags: Record<string, boolean>;
  moveCount: number;
  gameOver: boolean;
  /** Items dropped or removed from world after start, keyed by room ID. */
  itemsRemoved: Record<string, string[]>;
  /** Items added to a room after start (e.g. dropped from inventory). */
  itemsAdded: Record<string, string[]>;
  /** Event scripts that have already fired (gates one-shot events). */
  firedEvents: string[];
  /** Commands nobody understood; rotates the confused replies. Absent in older saves. */
  misses?: number;
  /** Commands the engine acted on; drives timed ambient lines. Absent in older saves. */
  turns?: number;
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
}

export interface SavedState {
  version: string;
  savedAt: string;
  gameState: GameState;
  outputHistory: OutputLine[];
}

export const SAVE_KEY = `${storagePrefix}:save`;
export const SAVE_VERSION = '1.0' as const;
