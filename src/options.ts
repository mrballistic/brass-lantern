import type { Cartridge } from '@/types/cartridge';
import type { Theme, ThemeName } from '@/theme/themes';

/** What a game reports to the app's analytics. */
export type GameEvent = 'game_start' | 'game_completed' | 'session_resumed';

/**
 * One game on the page: what `createGameStore`, `<BrassLantern :options>` and
 * `mountGame` take.
 *
 * `storagePrefix` namespaces everything the game keeps in the browser (saves,
 * transcripts, the player's theme, the story shelf) and its Pinia stores. Two
 * games on one page need two prefixes: the same prefix twice is the same game,
 * sharing its stores and saves.
 */
export interface GameOptions {
  /** One or more native worlds or Z-machine story files. With more than one, the terminal shows a menu. */
  cartridges: Cartridge[];
  /** Shown in the terminal header. Default 'BRASS LANTERN'. */
  terminalName?: string;
  storagePrefix: string;
  /** Where misses go for the LLM's reading (POST, see the server package). null: misses get the engine's reply only. Default null. */
  intentEndpoint?: string | null;
  /** The author's default theme; the player's THEME command wins over it. Default 'crt-amber'. */
  theme?: ThemeName | Theme;
  /** Extra named themes, offered by THEME beside the presets. */
  themes?: Record<string, Theme>;
  /** The app's (consent-gated) analytics. */
  analytics?: {
    onEvent(name: GameEvent, params?: Record<string, unknown>): void;
    /**
     * Opens the app's consent settings. Given, the header shows a [ COOKIES ]
     * link and the COOKIES command calls it; without it, COOKIES says nothing
     * is collected.
     */
    openConsent?(): void;
  };
  /** Shown in the header after the terminal name (the site passes its release). */
  version?: string;
}

export const DEFAULT_TERMINAL_NAME = 'BRASS LANTERN';

/** The terminal's name, and its version if it has one: `BRASS LANTERN v2.0.0`. */
export function terminalTitle(options: GameOptions): string {
  const name = options.terminalName ?? DEFAULT_TERMINAL_NAME;
  return options.version ? `${name} v${options.version}` : name;
}

/** Tells the app's analytics; a callback that throws is logged, never breaks the game. */
export function reportEvent(options: GameOptions, name: GameEvent, params?: Record<string, unknown>): void {
  const analytics = options.analytics;
  if (!analytics) return;
  try {
    if (params) analytics.onEvent(name, params);
    else analytics.onEvent(name);
  } catch (error) {
    console.error('Analytics callback failed:', error);
  }
}

/** The intent server to ask, or null: an unset or empty endpoint means none. */
export function intentEndpointOf(options: GameOptions): string | null {
  return options.intentEndpoint || null;
}

/** The COOKIES command: open the app's consent settings, or say there's nothing to consent to. */
export function cookiesReply(options: GameOptions): string {
  const open = options.analytics?.openConsent;
  if (!open) return '[This build has no analytics. Nothing is collected.]';
  open();
  return '[Analytics settings opened]';
}
