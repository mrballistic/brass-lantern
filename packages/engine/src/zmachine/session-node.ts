// '@brass-lantern/engine/zmachine/session' in Node (the "node" export
// condition): session.ts, after checking that the optional ifvms peer is
// installed (see node.ts). Types come from session.d.ts.
import { requireIfvms } from './require-ifvms.ts';

await requireIfvms();

export const { ZMachineSession } = await import('./session.ts');
