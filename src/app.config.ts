// Everything that makes this build *this* game collection rather than the
// engine. The rest of src/ is world-agnostic.
import type { Cartridge } from '@/types/cartridge';
import { tutorial } from '@/worlds/tutorial';
import { zork1 } from '@/worlds/zork1';

/** What the cartridge menu offers. With one cartridge, the terminal boots straight into it. */
export const cartridges: Cartridge[] = [
  // saveKey: 1.0.0 saved here, before cartridges had their own keys.
  { kind: 'world', id: 'snack-attack', title: 'SNACK ATTACK', world: tutorial, saveKey: 'brass-lantern:save' },
  // Zork I, Release 119. Source and story file released under the MIT License by Microsoft (2025).
  { kind: 'zcode', id: 'zork1', title: 'ZORK I', story: 'stories/zork1.z3', format: 'Z-machine v3' },
  { kind: 'zcode', id: 'zork2', title: 'ZORK II', story: 'stories/zork2.z3', format: 'Z-machine v3' },
  { kind: 'zcode', id: 'zork3', title: 'ZORK III', story: 'stories/zork3.z3', format: 'Z-machine v3' },
  // The same Zork I, rebuilt as a native world (engine-parity stage 1: above ground only).
  { kind: 'world', id: 'zork1-native', title: 'ZORK I · NATIVE', world: zork1 },
];

/** Shown in the terminal header. */
export const appName = 'BRASS LANTERN';

/** Namespaces saves, consent and analytics IDs in localStorage. */
export const storagePrefix = 'brass-lantern';
