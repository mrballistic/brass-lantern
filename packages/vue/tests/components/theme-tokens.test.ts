import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(`${import.meta.dirname}/../../src/styles/crt.css`, 'utf8');
// The tokens block: the first .crt-shell rule (the shell is the theme root; nothing is set on :root).
const rootMatch = css.match(/^\.crt-shell\s*\{([\s\S]*?)\n\}/m);
const rootBlock = rootMatch ? rootMatch[1] : '';
const rest = css.replace(/^\.crt-shell\s*\{[\s\S]*?\n\}/m, '');

function rootValue(name: string): string | undefined {
  const m = rootBlock.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m?.[1].trim();
}

// Today's amber values (the 1.13.0 :root block, now the shell's).
const DEFAULTS: Record<string, string> = {
  '--bl-fg': '#ffb000',
  '--bl-fg-bright': '#ffc833',
  '--bl-fg-dim': 'rgba(255, 176, 0, 0.6)',
  '--bl-glow': 'rgba(255, 176, 0, 0.3)',
  '--bl-glow-strong': 'rgba(255, 176, 0, 0.6)',
  '--bl-bg': '#0a0a08',
  '--bl-border': '#332800',
  '--bl-input': '#88ffaa',
  '--bl-location': '#ffc833',
  '--bl-event': '#ff8844',
  '--bl-decorative': '#ffd866',
  '--bl-system': 'rgba(255, 176, 0, 0.6)',
  '--bl-scanline': 'rgba(0, 0, 0, 0.15)',
  '--bl-shade': '#000000',
  '--bl-decay-fresh': '1',
  '--bl-decay-recent': '0.92',
  '--bl-decay-old': '0.85',
  '--bl-boot-line': '#ffd866',
  '--bl-boot-flash': '#ffffff',
  '--bl-boot-duration': '2000ms',
  '--bl-type-fast': '10ms',
  '--bl-type-normal': '18ms',
  '--bl-type-medium': '12ms',
  '--bl-type-line-pause': '150ms',
  '--bl-flicker-base': '3.7s',
  '--bl-flicker-secondary': '2.3s',
  '--bl-glitch-interval-min': '15s',
  '--bl-glitch-interval-max': '30s',
};

describe('theme tokens in crt.css', () => {
  it('has no --crt- names left', () => {
    expect(css).not.toMatch(/--crt-/);
  });

  it('has no rgba() literal outside the tokens block', () => {
    expect(rootBlock).not.toBe('');
    expect(rest).not.toMatch(/rgba\(/);
  });

  it.each(Object.entries(DEFAULTS))('%s defaults to today’s value', (name, value) => {
    expect(rootValue(name)).toBe(value);
  });

  it('every var(--bl-*) used is defined in the tokens block', () => {
    const used = new Set([...rest.matchAll(/var\((--bl-[a-z-]+)\)/g)].map(m => m[1]));
    for (const name of used) expect(rootValue(name), name).toBeDefined();
  });
});
