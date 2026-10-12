import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { bundleDocs } from '../scripts/bundle-docs.ts';
import { docsReport, normalizePage, readDocs, type Docs } from '../src/docs.ts';

let docs: Docs;
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'bl-mcp-docs-'));
  bundleDocs(dir);
  docs = readDocs(dir);
});

describe('docs', () => {
  it('no arguments: the index, with how to ask for more', () => {
    const r = docsReport(docs, {});
    expect(r.isError).toBe(false);
    expect(r.text).toContain('# Brass Lantern');
    expect(r.text).toContain('reference/world-schema');
    expect(r.text).toMatch(/page.*query/);
  });
  it('a page by name, however it is typed', () => {
    for (const name of ['reference/world-schema', '/reference/world-schema', 'reference/world-schema.md']) {
      expect(docsReport(docs, { page: name }).text, name).toContain('typoReplies');
    }
    expect(docsReport(docs, { page: 'guide/building-worlds/' }).text).toContain('How names are matched');
  });
  it('an unknown page lists the real ones', () => {
    const r = docsReport(docs, { page: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('reference/conditions-and-events');
  });
  it('a query returns the best sections first, with their page', () => {
    const r = docsReport(docs, { query: 'typo replies misspelling' });
    expect(r.isError).toBe(false);
    expect(r.text.indexOf('typoReplies')).toBeGreaterThan(-1);
    expect(r.text).toMatch(/Source: \S+/);
  });
  it('a query that matches nothing says so', () => {
    expect(docsReport(docs, { query: 'xylophonequux' }).text).toMatch(/No sections matched “xylophonequux”/);
  });
  it('a fence inside a longer fence doesn’t end it, so the headings after it stay searchable', () => {
    const markdown = [
      '# Guide',
      '````text',
      'Example:',
      '```json',
      '# not a heading',
      '```',
      '````',
      '## Zebra crossings',
      'Stripes.',
      '~~~',
      '```',
      '## still code',
      '~~~',
      '## Okapi notes',
      'Shy.',
    ].join('\n');
    const page = { path: 'guide/x', title: 'Guide', markdown };
    const fake: Docs = { index: '', pages: [page] };
    expect(docsReport(fake, { query: 'zebra' }).text).toContain('## Guide › Zebra crossings');
    expect(docsReport(fake, { query: 'okapi' }).text).toContain('## Guide › Okapi notes');
    expect(docsReport(fake, { query: 'heading' }).text).not.toMatch(/› not a heading/);
    expect(docsReport(fake, { query: 'still code' }).text).not.toMatch(/› still code/);
  });
  it('finds the coding-agents guide’s “Safety and limits” section', () => {
    const r = docsReport(docs, { query: 'safety limits loops forever' });
    expect(r.text).toMatch(/› Safety and limits\nSource: guide\/coding-agents/);
  });
  it('normalizePage', () => {
    expect(normalizePage('/reference/world-schema.md')).toBe('reference/world-schema');
    expect(normalizePage('guide/building-worlds/')).toBe('guide/building-worlds/index');
    expect(normalizePage('')).toBe('index');
  });
});
