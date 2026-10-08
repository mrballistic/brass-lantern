// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

describe('the public barrel', () => {
  it('exports the component, mountGame, the consent banner, the themes and useTypewriter, and nothing internal', async () => {
    const api = await import('../src/index');
    expect(Object.keys(api).sort()).toEqual(
      ['BrassLantern', 'ConsentBanner', 'PALETTES', 'PRESETS', 'UnknownTheme', 'mountGame', 'resolveTheme', 'useTypewriter'].sort(),
    );
  });
});
