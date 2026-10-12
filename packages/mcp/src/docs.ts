import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DocPage {
  /** 'reference/world-schema', 'guide/building-worlds/index'. */
  path: string;
  title: string;
  markdown: string;
}

export interface Docs {
  index: string;
  pages: DocPage[];
}

const MAX_SECTIONS = 5;
const MAX_SECTION_CHARS = 4000;

/** Reads a bundle written by scripts/bundle-docs.ts. */
export function readDocs(dir: string): Docs {
  const list = JSON.parse(readFileSync(join(dir, 'pages.json'), 'utf8')) as Array<{ path: string; title: string }>;
  return {
    index: readFileSync(join(dir, 'llms.txt'), 'utf8'),
    pages: list.map((p) => ({ ...p, markdown: readFileSync(join(dir, 'pages', `${p.path}.md`), 'utf8') })),
  };
}

/** A page name as an agent might type it, as a bundle path. */
export function normalizePage(page: string): string {
  const trimmed = page.trim().replace(/^\/+/, '').replace(/\.md$/, '');
  if (trimmed === '' || trimmed.endsWith('/')) return `${trimmed}index`;
  return trimmed;
}

/** A page split at its headings: each heading with the text under it. */
function sections(page: DocPage): Array<{ heading: string; text: string }> {
  const out: Array<{ heading: string; text: string }> = [];
  let current = { heading: page.title, text: '' };
  // The open fence, if any. A fence opens on ``` or ~~~ (with an optional info string) and closes
  // only on a bare fence of the same character at least as long, so a ```json line shown inside a
  // ````text block doesn't end it.
  let fence: { char: string; length: number } | undefined;
  for (const line of page.markdown.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      const run = marker[1];
      if (!fence) fence = { char: run[0], length: run.length };
      else if (run[0] === fence.char && run.length >= fence.length && marker[2].trim() === '') fence = undefined;
    }
    const heading = !fence && /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) {
      if (current.text.trim()) out.push(current);
      current = { heading: heading[1].trim(), text: `${line}\n` };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim()) out.push(current);
  return out;
}

/** Counts how often `term` appears in `text`, up to `cap`, without a regex (both are plain lowercase strings). */
function occurrences(text: string, term: string, cap: number): number {
  let n = 0;
  for (let at = text.indexOf(term); at !== -1 && n < cap; at = text.indexOf(term, at + term.length)) n += 1;
  return n;
}

export function docsReport(docs: Docs, args: { page?: string; query?: string }): { text: string; isError: boolean } {
  if (args.page !== undefined) {
    const wanted = normalizePage(args.page);
    const page = docs.pages.find((p) => p.path === wanted);
    if (!page) return { isError: true, text: `No page “${args.page}”. Pages:\n${docs.pages.map((p) => `- ${p.path} (${p.title})`).join('\n')}` };
    return { isError: false, text: page.markdown };
  }
  if (args.query !== undefined && args.query.trim() !== '') {
    const terms = [...new Set(args.query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3))];
    const scored = docs.pages
      .flatMap((page) => sections(page).map((s) => ({ page, ...s })))
      .map((s) => {
        const heading = s.heading.toLowerCase();
        const body = s.text.toLowerCase();
        const score = terms.reduce((sum, t) => sum + (heading.includes(t) ? 3 : 0) + occurrences(body, t, 5), 0);
        return { ...s, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SECTIONS);
    if (scored.length === 0) return { isError: false, text: `No sections matched “${args.query}”. Try other words, or call docs with no arguments for the index.` };
    return {
      isError: false,
      text: scored
        .map((s) => `## ${s.page.title} › ${s.heading}\nSource: ${s.page.path}\n\n${s.text.length > MAX_SECTION_CHARS ? `${s.text.slice(0, MAX_SECTION_CHARS)}\n[… cut; ask for the page “${s.page.path}” for all of it]` : s.text.trim()}`)
        .join('\n\n'),
    };
  }
  return { isError: false, text: `${docs.index}\n\nAsk for a page with “page” (e.g. reference/world-schema), or search with “query”.` };
}
