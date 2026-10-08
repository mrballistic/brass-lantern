import { describe, expect, it, vi } from 'vitest';
import { checkAuthorThemes, PALETTES, PRESETS, resolveTheme, UnknownTheme, type Theme } from '../../src/theme/themes';

const light = { prefersDark: false, reducedMotion: false };
const dark = { prefersDark: true, reducedMotion: false };
const ALL_OFF = ['bloom', 'scanlines', 'flicker', 'vignette', 'noise', 'glitch', 'decay'].map(e => `bl-${e}-off`);

describe('resolveTheme', () => {
  it('crt-amber is today’s defaults with no classes', () => {
    const r = resolveTheme('crt-amber', {}, {}, light);
    expect(r.classes).toEqual([]);
    expect(r.palette).toEqual(PALETTES.amber);
    expect(r.vars['--bl-fg']).toBe('#ffb000');
    expect(r.vars['--bl-fg-dim']).toBe('rgba(255, 176, 0, 0.6)');
    expect(r.vars['--bl-glow-strong']).toBe('rgba(255, 176, 0, 0.6)');
    expect(r.vars['--bl-bg']).toBe('#0a0a08');
    expect(r.vars['--bl-boot-line']).toBe('#ffd866');
    expect(Object.keys(r.vars)).toHaveLength(13);
  });

  it('crt-green has its own glows and system colour', () => {
    const r = resolveTheme('crt-green', {}, {}, light);
    expect(r.classes).toEqual([]);
    expect(r.palette).toEqual(PALETTES.green);
    for (const k of ['fg', 'fgDim', 'glow', 'glowStrong', 'system'] as const) {
      expect(r.palette[k]).not.toBe(PALETTES.amber[k]);
      expect(r.palette[k]).toMatch(/51, 255, 102|#33ff66/);
    }
  });

  it('simple-light and simple-dark have every effect off', () => {
    const l = resolveTheme('simple-light', {}, {}, dark);
    const d = resolveTheme('simple-dark', {}, {}, light);
    expect(l.palette).toEqual(PALETTES.light);
    expect(d.palette).toEqual(PALETTES.dark);
    expect(l.classes).toEqual(ALL_OFF);
    expect(d.classes).toEqual(ALL_OFF);
  });

  it('the boot line follows the palette', () => {
    expect(resolveTheme('crt-green', {}, {}, light).vars['--bl-boot-line']).toBe(PALETTES.green.decorative);
  });

  it('simple flips with prefersDark', () => {
    expect(resolveTheme('simple', {}, {}, light).palette).toEqual(PALETTES.light);
    expect(resolveTheme('simple', {}, {}, dark).palette).toEqual(PALETTES.dark);
  });

  it('every palette sets every role', () => {
    for (const p of Object.values(PALETTES)) {
      expect(Object.keys(p).sort()).toEqual(Object.keys(PALETTES.amber).sort());
      for (const v of Object.values(p)) expect(v).toBeTruthy();
    }
  });

  it('reduced motion turns off flicker, glitch and noise even for crt-green', () => {
    const r = resolveTheme('crt-green', {}, {}, { prefersDark: false, reducedMotion: true });
    expect(r.classes).toEqual(['bl-flicker-off', 'bl-noise-off', 'bl-glitch-off']);
    expect(r.effects).toMatchObject({ flicker: false, glitch: false, noise: false, bloom: true, scanlines: true });
  });

  it('{ effects: false } adds every -off class', () => {
    expect(resolveTheme('crt-amber', {}, { effects: false }, light).classes).toEqual(ALL_OFF);
  });

  it('{ bloom: false } adds only bl-bloom-off; { bloom: true } restores it', () => {
    expect(resolveTheme('crt-amber', {}, { bloom: false }, light).classes).toEqual(['bl-bloom-off']);
    expect(resolveTheme('simple-dark', {}, { bloom: true }, light).effects.bloom).toBe(true);
  });

  it('resolves a custom palette object and a named custom theme', () => {
    const palette = { ...PALETTES.dark, fg: '#ff00ff' };
    const t: Theme = { palette, effects: { ...PRESETS['crt-amber'].effects, scanlines: false } };
    const r = resolveTheme(t, {}, {}, light);
    expect(r.vars['--bl-fg']).toBe('#ff00ff');
    expect(r.classes).toEqual(['bl-scanlines-off']);
    expect(resolveTheme('mine', { mine: t }, {}, light).vars['--bl-fg']).toBe('#ff00ff');
  });

  it('throws UnknownTheme for an unknown name', () => {
    expect(() => resolveTheme('purple', {}, {}, light)).toThrow(UnknownTheme);
    expect(() => resolveTheme('toString', {}, {}, light)).toThrow(UnknownTheme);
  });
});

describe('an unknown palette name', () => {
  const bad = { palette: 'mauve', effects: { ...PRESETS['crt-amber'].effects } } as unknown as Theme;

  it('resolveTheme falls back to amber with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = resolveTheme(bad, {}, {}, light);
    expect(r.palette).toEqual(PALETTES.amber);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('checkAuthorThemes repairs a theme object and a custom theme, so resolving never warns again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const checked = checkAuthorThemes(bad, { mine: bad });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockClear();
    expect((checked.theme as Theme).palette).toBe('amber');
    expect(checked.themes.mine.palette).toBe('amber');
    expect(resolveTheme(checked.theme, checked.themes, {}, light).palette).toEqual(PALETTES.amber);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
