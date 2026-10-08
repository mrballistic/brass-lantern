// @brass-lantern/vue: the CRT terminal for Vue 3, as one component and a mount
// helper, with themes. The stylesheet is a separate entry:
// import '@brass-lantern/vue/style.css'.
//
// Deliberately small: the terminal's parts (Terminal, the boot sequence, the
// stores) are internal, so they can change without a major version. Adding an
// export later is not a breaking change; removing one would be.

export { default as BrassLantern } from './components/BrassLantern.vue';
export { default as ConsentBanner } from './components/ConsentBanner.vue';
export { mountGame } from './mount.ts';
export { useTypewriter, type RenderedLine, type UseTypewriter } from './composables/useTypewriter.ts';
export {
  PALETTES,
  PRESETS,
  UnknownTheme,
  resolveTheme,
  type Effects,
  type Palette,
  type PaletteName,
  type ResolvedTheme,
  type Theme,
  type ThemeEnv,
  type ThemeName,
  type ThemeOverrides,
} from './theme/themes.ts';
export type { GameEvent, GameOptions } from './options.ts';
// The cartridge types GameOptions names, so a Vue app can type its options from this package alone.
export type { Cartridge, WorldCartridge, ZCodeCartridge } from '@brass-lantern/engine';
