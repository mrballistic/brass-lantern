// @brass-lantern/vue: the CRT terminal, the game store and themes for Vue 3.
// The stylesheet is a separate entry: import '@brass-lantern/vue/style.css'.

export { default as BrassLantern } from './components/BrassLantern.vue';
export { default as Terminal } from './components/Terminal.vue';
export { default as CrtBootSequence } from './components/CrtBootSequence.vue';
export { default as ConsentBanner } from './components/ConsentBanner.vue';
export { mountGame } from './mount';
export { createGameStore, setDownload } from './stores/game';
export { createCatalog, type Catalog } from './stores/catalog';
export { useTypewriter, type RenderedLine, type UseTypewriter } from './composables/useTypewriter';
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
} from './theme/themes';
export { useTheme, type UseThemeOptions } from './theme/useTheme';
export { DEFAULT_TERMINAL_NAME, type GameEvent, type GameOptions } from './options';
export { createPersistenceService, type PersistenceService } from './services/persistence';
