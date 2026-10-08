// '@brass-lantern/engine/zmachine' in Node (the "node" export condition):
// index.ts, after checking that the optional ifvms peer is installed. A static
// re-export would load ifvms before this module ran, so the runtime is
// imported dynamically and its exports listed here. tests/zmachine/node-entries.test.ts
// checks the list against index.ts. Types come from index.d.ts.
import { requireIfvms } from './require-ifvms.ts';

await requireIfvms();
const runtime = await import('./index.ts');

export const { ZMachineSession, readStoryFile, IndexedDbShelf, localStorageSaveStore, LocalStorageDialog } = runtime;
