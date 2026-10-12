import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// The docs for agents (https://llmstxt.org): llms.txt is an index of the pages, each page also
// ships as plain markdown beside its HTML, and llms-full.txt is every page in one file, in
// sidebar order. Code the pages pull in with `<<< file#region{lang}` is inlined, VitePress
// containers become plain text and relative links become absolute, so each file stands alone.
// Anything that can't be resolved fails the build rather than shipping a broken page.

export interface LlmsPage {
  /** Sidebar title. */
  title: string;
  /** Site link, as in the sidebar: '/guide/getting-started', '/guide/building-worlds/'. */
  link: string;
}

export interface LlmsSection {
  text: string;
  items: LlmsPage[];
}

export interface LlmsOptions {
  /** The docs source directory. */
  srcDir: string;
  /** Where the built site is written. */
  outDir: string;
  /** The published site's absolute URL, without a trailing slash. */
  site: string;
  /** Site title and one-line summary for the top of llms.txt. */
  title: string;
  description: string;
  sections: LlmsSection[];
}

/** '/guide/building-worlds/' → 'guide/building-worlds/index.md'; '/guide/testing' → 'guide/testing.md'. */
export function sourceOf(link: string): string {
  const path = link.replace(/^\//, '');
  return path === '' || path.endsWith('/') ? `${path}index.md` : `${path}.md`;
}

/** The lines of `file` between `#region name` and `#endregion name` (or the whole file), markers dropped. */
export function regionOf(text: string, region: string | undefined, where: string): string {
  const lines = text.split('\n');
  const marker = (line: string) => /^\s*(?:\/\/|\/\*|<!--|#)\s*#(?:end)?region\b/.test(line);
  if (!region) return lines.filter((line) => !marker(line)).join('\n').trimEnd();
  const start = lines.findIndex((line) => new RegExp(`#region ${region}\\b`).test(line));
  const end = lines.findIndex((line, i) => i > start && new RegExp(`#endregion ${region}\\b`).test(line));
  if (start === -1 || end === -1) throw new Error(`llms: ${where}: no region “${region}”`);
  return lines.slice(start + 1, end).filter((line) => !marker(line)).join('\n').trimEnd();
}

/**
 * One page's markdown, made to stand alone: frontmatter and `<script>` blocks dropped, `<<<` code
 * includes inlined, `::: kind Title` containers turned into a bold title line, and relative
 * links made absolute against the page's own URL.
 */
export function standalone(markdown: string, file: string, pageUrl: string, site: string): string {
  const out: string[] = [];
  let inScript = false;
  let inFence = false;
  const close = markdown.startsWith('---\n') ? markdown.indexOf('\n---\n', 4) : -1;
  const front = close === -1 ? '' : markdown.slice(4, close);
  const body = homeHero(front) + (close === -1 ? markdown : markdown.slice(close + 5));
  for (const line of body.split('\n')) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^<script\b/.test(line)) inScript = true;
    if (inScript) {
      if (/<\/script>/.test(line)) inScript = false;
      continue;
    }
    const include = /^<<<\s+(\S+?)(?:#([\w-]+))?(?:\{(\w+)\})?\s*$/.exec(line);
    if (include) {
      const [, path, region, lang] = include;
      const source = resolve(dirname(file), path);
      const code = regionOf(readFileSync(source, 'utf8'), region, `${file} → ${path}`);
      out.push(`\`\`\`${lang ?? ''}`, code, '```');
      continue;
    }
    const container = /^:::\s*(\w+)\s*(.*)$/.exec(line);
    if (container) {
      const [, kind, title] = container;
      const label = title.trim() || kind[0].toUpperCase() + kind.slice(1);
      out.push(`**${label}**`);
      continue;
    }
    if (/^:::\s*$/.test(line)) continue;
    // Layout wrappers (`<div class="npm-home">`) carry no text.
    if (/^<\/?div\b[^>]*>\s*$/.test(line)) continue;
    out.push(line.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (_, href: string) => `](${href.startsWith('/') ? site + href : new URL(href, pageUrl).href})`));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * A `layout: home` page keeps its words in frontmatter: the hero's name, text and tagline, and the
 * feature cards. Rendered as markdown so the home page says something to an agent too.
 */
export function homeHero(front: string): string {
  if (!/^layout:\s*home\s*$/m.test(front)) return '';
  const field = (key: string) => new RegExp(`^\\s+${key}:\\s*(.+)$`, 'm').exec(front)?.[1]?.trim() ?? '';
  const out = [`# ${field('name')}: ${field('text')}`.replace(/^# : $/, ''), '', field('tagline'), ''];
  let title = '';
  for (const line of front.split('\n')) {
    const t = /^\s+- title:\s*(.+)$/.exec(line);
    if (t) title = t[1].trim();
    const d = /^\s+details:\s*(.+)$/.exec(line);
    if (d && title) out.push(`- **${title}.** ${d[1].trim()}`);
  }
  return out.join('\n') + '\n\n';
}

/** The page's first prose paragraph, flattened to one line, for its llms.txt entry. */
export function summaryOf(markdown: string): string {
  const paragraph = markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(#|```|<<<|:::|<|\||-|\*|\d+\.|>)/.test(block));
  return (paragraph ?? '').replace(/\s+/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/** Writes llms.txt, llms-full.txt and a .md copy of every page into the built site. */
export function writeLlms(opts: LlmsOptions): void {
  const index: string[] = [`# ${opts.title}`, '', `> ${opts.description}`, ''];
  index.push(`The whole documentation in one file: [llms-full.txt](${opts.site}/llms-full.txt)`, '');
  const full: string[] = [`# ${opts.title}`, '', `> ${opts.description}`, ''];
  const pages = [{ text: 'Start here', items: [{ title: 'Home', link: '/' }] }, ...opts.sections];
  for (const section of pages) {
    index.push(`## ${section.text}`, '');
    for (const page of section.items) {
      const relative = sourceOf(page.link);
      const file = join(opts.srcDir, relative);
      const pageUrl = `${opts.site}${page.link}`;
      const markdown = standalone(readFileSync(file, 'utf8'), file, pageUrl, opts.site);
      mkdirSync(dirname(join(opts.outDir, relative)), { recursive: true });
      writeFileSync(join(opts.outDir, relative), markdown);
      const summary = summaryOf(markdown);
      index.push(`- [${page.title}](${opts.site}/${relative})${summary ? `: ${summary}` : ''}`);
      full.push('---', '', `Source: ${pageUrl}`, '', markdown);
    }
    index.push('');
  }
  const all = full.join('\n');
  let fenced = false;
  const leftovers = all.split('\n').filter((line) => {
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    return !fenced && /^<<<|^:::|^<script|\]\((?!https?:|mailto:|#)/.test(line);
  });
  if (leftovers.length > 0) throw new Error(`llms: unresolved markdown in llms-full.txt:\n${leftovers.join('\n')}`);
  const offSite = [...all.matchAll(/https:\/\/mrballistic\.github\.io\/[^\s)]*/g)].map((m) => m[0]).filter((url) => !url.startsWith(`${opts.site}/`));
  if (offSite.length > 0) throw new Error(`llms: links outside ${opts.site}:\n${offSite.join('\n')}`);
  writeFileSync(join(opts.outDir, 'llms.txt'), index.join('\n'));
  writeFileSync(join(opts.outDir, 'llms-full.txt'), all);
}
