import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the published engine’s licensing', () => {
  it('ships THIRD_PARTY_NOTICES.md with the Zork I and glkapi.js notices', () => {
    const pkg = JSON.parse(read('package.json')) as { files: string[] };
    expect(pkg.files).toContain('THIRD_PARTY_NOTICES.md');
    const notices = read('THIRD_PARTY_NOTICES.md');
    expect(notices).toContain('Copyright (c) 2025 Microsoft');
    expect(notices).toContain('Andrew Plotkin');
    // Each component's full MIT permission notice, not just a name.
    expect(notices.match(/Permission is hereby granted, free of charge/g)).toHaveLength(2);
    expect(notices.match(/THE SOFTWARE IS PROVIDED "AS IS"/g)).toHaveLength(2);
  });

  it('keeps internal history out of the shipped Zork I header', () => {
    const header = read('src/worlds/zork1.ts').split('*/')[0];
    expect(header).not.toMatch(/stage|parity/i);
    expect(header).toContain('Copyright (c) 2025 Microsoft');
  });
});
