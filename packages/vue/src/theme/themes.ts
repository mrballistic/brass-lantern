// Themes: a palette (twelve colour roles) plus seven effect switches.
// Pure data and a pure resolver; useTheme.ts applies the result to the DOM.

export type PaletteName = 'amber' | 'green' | 'light' | 'dark';

export interface Palette {
  fg: string;
  fgBright: string;
  fgDim: string;
  glow: string;
  glowStrong: string;
  bg: string;
  border: string;
  input: string;
  location: string;
  event: string;
  decorative: string;
  system: string;
}

export interface Effects {
  bloom: boolean;
  scanlines: boolean;
  flicker: boolean;
  vignette: boolean;
  noise: boolean;
  glitch: boolean;
  decay: boolean;
}

export interface Theme {
  palette: PaletteName | Palette;
  effects: Effects;
}

export type ThemeName = 'crt-amber' | 'crt-green' | 'simple' | 'simple-light' | 'simple-dark';

/** Every role is set explicitly: glows and the dim/system colours are not derived from fg. */
export const PALETTES: Record<PaletteName, Palette> = {
  // Equals the amber custom properties on .crt-shell in src/styles/crt.css.
  amber: {
    fg: '#ffb000',
    fgBright: '#ffc833',
    fgDim: 'rgba(255, 176, 0, 0.6)',
    glow: 'rgba(255, 176, 0, 0.3)',
    glowStrong: 'rgba(255, 176, 0, 0.6)',
    bg: '#0a0a08',
    border: '#332800',
    input: '#88ffaa',
    location: '#ffc833',
    event: '#ff8844',
    decorative: '#ffd866',
    system: 'rgba(255, 176, 0, 0.6)',
  },
  green: {
    fg: '#33ff66',
    fgBright: '#7dff9e',
    fgDim: 'rgba(51, 255, 102, 0.6)',
    glow: 'rgba(51, 255, 102, 0.3)',
    glowStrong: 'rgba(51, 255, 102, 0.6)',
    bg: '#050a06',
    border: '#0f3318',
    input: '#ffd866',
    location: '#aaffc0',
    event: '#ff9966',
    decorative: '#66ffd9',
    system: 'rgba(51, 255, 102, 0.6)',
  },
  light: {
    fg: '#1a1a1a',
    fgBright: '#000000',
    fgDim: '#5c5c5c',
    glow: 'transparent',
    glowStrong: 'transparent',
    bg: '#f7f5ef',
    border: '#cfcabd',
    input: '#0b5cad',
    location: '#000000',
    event: '#b3410b',
    decorative: '#6a3d9a',
    system: '#666666',
  },
  dark: {
    fg: '#d4d4d4',
    fgBright: '#ffffff',
    fgDim: '#8a8a8a',
    glow: 'transparent',
    glowStrong: 'transparent',
    bg: '#121212',
    border: '#333333',
    input: '#7ec8ff',
    location: '#ffffff',
    event: '#ff9966',
    decorative: '#c3a6ff',
    system: '#8a8a8a',
  },
};

const ALL_ON: Effects = { bloom: true, scanlines: true, flicker: true, vignette: true, noise: true, glitch: true, decay: true };
const ALL_OFF: Effects = { bloom: false, scanlines: false, flicker: false, vignette: false, noise: false, glitch: false, decay: false };

export const PRESETS: Record<ThemeName, Theme> = {
  'crt-amber': { palette: 'amber', effects: { ...ALL_ON } },
  'crt-green': { palette: 'green', effects: { ...ALL_ON } },
  // 'simple' follows prefers-color-scheme; the palette here is its light default.
  simple: { palette: 'light', effects: { ...ALL_OFF } },
  'simple-light': { palette: 'light', effects: { ...ALL_OFF } },
  'simple-dark': { palette: 'dark', effects: { ...ALL_OFF } },
};

/** The player's BLOOM and EFFECTS commands. */
export interface ThemeOverrides {
  bloom?: boolean;
  effects?: boolean;
}

export interface ThemeEnv {
  prefersDark: boolean;
  reducedMotion: boolean;
}

export interface ResolvedTheme {
  palette: Palette;
  effects: Effects;
  classes: string[];
  vars: Record<string, string>;
}

export class UnknownTheme extends Error {
  constructor(name: string) {
    super(`Unknown theme “${name}”.`);
    this.name = 'UnknownTheme';
  }
}

const EFFECT_KEYS = Object.keys(ALL_ON) as (keyof Effects)[];

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}

function isPreset(name: string): name is ThemeName {
  return Object.prototype.hasOwnProperty.call(PRESETS, name);
}

function isPaletteName(name: string): name is PaletteName {
  return Object.prototype.hasOwnProperty.call(PALETTES, name);
}

/** A theme whose palette names nothing gets amber, with one warning. */
function repairTheme(theme: Theme, label: string): Theme {
  if (typeof theme.palette !== 'string' || isPaletteName(theme.palette)) return theme;
  console.warn(`Brass Lantern: ${label} names the palette “${theme.palette}”, which doesn’t exist, so it uses amber.`);
  return { ...theme, palette: 'amber' };
}

export function resolveTheme(
  base: ThemeName | Theme | string,
  custom: Record<string, Theme>,
  overrides: ThemeOverrides,
  env: ThemeEnv,
): ResolvedTheme {
  let theme: Theme;
  let paletteOverride: PaletteName | undefined;
  if (typeof base !== 'string') {
    theme = base;
  } else if (Object.prototype.hasOwnProperty.call(custom, base)) {
    theme = custom[base];
  } else if (isPreset(base)) {
    theme = PRESETS[base];
    if (base === 'simple') paletteOverride = env.prefersDark ? 'dark' : 'light';
  } else {
    throw new UnknownTheme(base);
  }

  const chosen = paletteOverride ?? theme.palette;
  let palette: Palette;
  if (typeof chosen !== 'string') palette = chosen;
  else if (isPaletteName(chosen)) palette = PALETTES[chosen];
  else {
    console.warn(`Brass Lantern: there’s no palette called “${chosen}”, so the theme uses amber.`);
    palette = PALETTES.amber;
  }

  const effects: Effects = { ...theme.effects };
  if (env.reducedMotion) {
    effects.flicker = false;
    effects.glitch = false;
    effects.noise = false;
  }
  if (overrides.effects === false) for (const k of EFFECT_KEYS) effects[k] = false;
  if (overrides.bloom !== undefined) effects.bloom = overrides.bloom;

  const classes = EFFECT_KEYS.filter(k => !effects[k]).map(k => `bl-${k}-off`);
  const vars: Record<string, string> = {};
  for (const [role, value] of Object.entries(palette)) vars[`--bl-${kebab(role)}`] = value;

  // The boot ignition line follows the palette (amber's decorative is today's #ffd866).
  vars['--bl-boot-line'] = palette.decorative;

  return { palette: { ...palette }, effects, classes, vars };
}

/**
 * The author's theme options, checked once when a game is made: a custom
 * theme named like a preset is dropped (THEME would list the name twice and
 * the preset would win anyway), and an author theme that names nothing falls
 * back to crt-amber. Each problem is one console warning, never an error.
 */
export function checkAuthorThemes(
  theme: ThemeName | Theme | string | undefined,
  themes: Record<string, Theme> | undefined,
): { theme: ThemeName | Theme | string; themes: Record<string, Theme> } {
  const custom: Record<string, Theme> = {};
  const presetNames = Object.keys(PRESETS).map((n) => n.toLowerCase());
  for (const [name, value] of Object.entries(themes ?? {})) {
    if (presetNames.includes(name.toLowerCase())) {
      console.warn(`Brass Lantern: the custom theme “${name}” has a preset’s name, so it is ignored. Give it another name.`);
      continue;
    }
    custom[name] = repairTheme(value, `the custom theme “${name}”`);
  }
  const author = typeof theme === 'object' && theme !== null ? repairTheme(theme, 'the theme') : (theme ?? 'crt-amber');
  if (typeof author === 'string' && !isPreset(author) && !Object.prototype.hasOwnProperty.call(custom, author)) {
    console.warn(`Brass Lantern: there’s no theme called “${author}”, so the game uses crt-amber. Try one of: ${[...Object.keys(PRESETS), ...Object.keys(custom)].join(', ')}.`);
    return { theme: 'crt-amber', themes: custom };
  }
  return { theme: author, themes: custom };
}
