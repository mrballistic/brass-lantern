import { onBeforeUnmount, ref, toValue, watchEffect, type MaybeRefOrGetter, type Ref } from 'vue';
import { resolveTheme, type Theme, type ThemeName, type ThemeOverrides } from './themes.ts';

export interface UseThemeOptions {
  theme: MaybeRefOrGetter<ThemeName | Theme | string>;
  custom?: MaybeRefOrGetter<Record<string, Theme>>;
  overrides?: MaybeRefOrGetter<ThemeOverrides>;
}

function query(q: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null;
}

/**
 * Resolves a theme and applies its effect classes and colour variables to `root`.
 * Re-applies when the theme, overrides, or the player's colour-scheme and
 * reduced-motion preferences change. Variables live on the element, so two
 * terminals on one page keep their own.
 */
export function useTheme(root: Ref<HTMLElement | null>, options: UseThemeOptions) {
  const prefersDark = ref(false);
  const reducedMotion = ref(false);
  let applied: { classes: string[]; vars: string[] } = { classes: [], vars: [] };
  const cleanups: (() => void)[] = [];

  function watchQuery(q: string, target: Ref<boolean>): void {
    const mql = query(q);
    if (!mql) return;
    target.value = mql.matches;
    const onChange = (e: MediaQueryListEvent) => { target.value = e.matches; };
    mql.addEventListener?.('change', onChange);
    cleanups.push(() => mql.removeEventListener?.('change', onChange));
  }

  // Read synchronously, before the first apply, so dark-mode and reduced-motion
  // visitors never see a frame of the wrong theme.
  watchQuery('(prefers-color-scheme: dark)', prefersDark);
  watchQuery('(prefers-reduced-motion: reduce)', reducedMotion);

  const resolved = ref(resolveTheme('crt-amber', {}, {}, { prefersDark: false, reducedMotion: false }));

  watchEffect(() => {
    const next = resolveTheme(
      toValue(options.theme),
      toValue(options.custom) ?? {},
      toValue(options.overrides) ?? {},
      { prefersDark: prefersDark.value, reducedMotion: reducedMotion.value },
    );
    resolved.value = next;
    const el = root.value;
    if (!el) return;
    el.classList.remove(...applied.classes);
    for (const v of applied.vars) el.style.removeProperty(v);
    el.classList.add(...next.classes);
    for (const [k, v] of Object.entries(next.vars)) el.style.setProperty(k, v);
    applied = { classes: next.classes, vars: Object.keys(next.vars) };
  }, { flush: 'post' });
  onBeforeUnmount(() => cleanups.forEach(fn => fn()));

  return { resolved };
}
