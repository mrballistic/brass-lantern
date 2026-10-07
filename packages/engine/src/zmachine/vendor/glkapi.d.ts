/** The Glk API object glkapi.js builds. We call init(); ifvms uses the rest. */
export interface GlkApi {
  init(options: Record<string, unknown>): void;
}

/** A fresh, independent Glk instance. */
export function createGlk(): GlkApi;
