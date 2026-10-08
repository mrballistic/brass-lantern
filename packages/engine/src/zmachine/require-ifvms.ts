// ifvms is an optional peer dependency: the core engine and ./zmachine never
// need it; only ./zmachine/session loads it. In Node, that entry
// (session-node.ts, chosen by the "node" export condition) calls this before
// loading the session, so a missing install is an error that names the
// package and the fix, not a resolver message from deep inside dist/. Browser
// bundles import the session itself: their bundler reports a missing ifvms
// at build time, and the interpreter stays in one lazy chunk.

export const MISSING_IFVMS =
  '@brass-lantern/engine/zmachine/session needs the optional peer dependency ifvms to run story files. ' +
  'Install it next to the engine: npm install ifvms';

/** Loads ifvms (and the dispatcher the session uses), or throws MISSING_IFVMS with the resolver's error as the cause. */
export async function requireIfvms(load: () => Promise<unknown> = loadIfvms): Promise<void> {
  try {
    await load();
  } catch (cause) {
    throw new Error(MISSING_IFVMS, { cause });
  }
}

function loadIfvms(): Promise<unknown> {
  return Promise.all([import('ifvms'), import('ifvms/src/zvm/dispatch.js')]);
}
