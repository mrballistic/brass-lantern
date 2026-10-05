// Everything that makes this build *this* game rather than the engine.
// The rest of src/ is world-agnostic; change these three to run a different
// world (see docs/guide/your-first-world.md).
import type { World } from '@/types/world';
import { tutorial } from '@/worlds/tutorial';

/** The world the SPA plays. */
export const world: World = tutorial;

/** Shown in the terminal header. */
export const appName = 'BRASS LANTERN';

/** Namespaces saves, consent and analytics IDs in localStorage. */
export const storagePrefix = 'brass-lantern';
