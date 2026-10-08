import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The stylesheet ships to other people's pages: it must style the game and
// nothing else. No page-level selectors, no unscoped universal rules, nothing
// fixed to the viewport (the shell sizes to its container; its overlays sit
// inside it). The site's own full-viewport rules live in apps/site.

const css = readFileSync(`${import.meta.dirname}/../../src/styles/crt.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector in every style rule (inside @media too); keyframe steps aren't selectors. */
function selectors(): string[] {
  const found: string[] = [];
  const keyframes = /@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
  const body = css.replace(keyframes, '');
  for (const m of body.matchAll(/([^{};]+)\{[^{}]*\}/g)) {
    const prelude = m[1].trim();
    if (prelude.startsWith('@')) continue;
    found.push(...prelude.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return found;
}

describe('crt.css stays inside the game', () => {
  it('finds the stylesheet’s selectors', () => {
    expect(selectors().length).toBeGreaterThan(50);
    expect(selectors()).toContain('.crt-shell');
  });

  it('targets no html, body, :root or #app', () => {
    const page = selectors().filter((s) => /(^|[\s>+~])(html|body|:root|#app)\b/.test(s));
    expect(page).toEqual([]);
  });

  it('has no unscoped universal selector', () => {
    expect(selectors().filter((s) => /^\*/.test(s))).toEqual([]);
  });

  it('scopes box-sizing to the shell', () => {
    expect(selectors()).toEqual(expect.arrayContaining(['.crt-shell *']));
  });

  it('fixes nothing to the viewport and sizes nothing by it', () => {
    expect(css).not.toMatch(/position\s*:\s*fixed/);
    expect(css).not.toMatch(/\d(vw|vh|vmin|vmax|dvh|svh|lvh)\b/);
  });

  it('sizes the shell to its container', () => {
    const shell = [...css.matchAll(/(?:^|\})\s*\.crt-shell\s*\{([^}]*)\}/g)].map((m) => m[1]).join('\n');
    expect(shell).toMatch(/width:\s*100%/);
    expect(shell).toMatch(/height:\s*100%/);
    expect(shell).toMatch(/position:\s*relative/);
    expect(shell).toMatch(/overflow:\s*hidden/);
  });
});
