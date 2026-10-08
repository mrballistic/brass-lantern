// localStorage that never throws. Blocked, full or missing storage costs the
// feature that wanted it (a resume on reload, a transcript, the player's
// theme), never the game.

export function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Silent: see above.
  }
}

export function removeItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Silent: see above.
  }
}
