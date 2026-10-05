import type { World } from './world';

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
}

export type Cartridge = WorldCartridge | ZCodeCartridge;
