import type { World } from './world.ts';

/** A native Brass Lantern world. */
export interface WorldCartridge {
  kind: 'world';
  id: string;
  title: string;
  world: World;
  /** Where its save lives. Defaults to `<storagePrefix>:save:<id>`. */
  saveKey?: string;
}

/** A Z-machine story file. */
export interface ZCodeCartridge {
  kind: 'zcode';
  id: string;
  title: string;
  /** The story file's URL, relative to the site's base (e.g. "stories/zork1.z3"). */
  story: string;
  /** Shown in the menu, e.g. "Z-machine v3". */
  format: string;
  /** Loaded by the player from their own computer and kept in the browser; `story` is unused. */
  local?: boolean;
}

export type Cartridge = WorldCartridge | ZCodeCartridge;
