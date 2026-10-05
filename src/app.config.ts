// Everything that makes this build *this* game collection rather than the
// engine. The rest of src/ is world-agnostic.
import type { Cartridge } from '@/types/cartridge';
import { tutorial } from '@/worlds/tutorial';

/** What the cartridge menu offers. With one cartridge, the terminal boots straight into it. */
export const cartridges: Cartridge[] = [
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial },
  // Zork I, Release 119. Source and story file released under the MIT License by Microsoft (2025).
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
];

/** Shown in the terminal header. */
export const appName = 'BRASS LANTERN';

/** Namespaces saves, consent and analytics IDs in localStorage. */
export const storagePrefix = 'brass-lantern';
