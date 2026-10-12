import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLlms } from '../../../scripts/llms.ts';
import { llmsDescription, llmsTitle, sidebar, site } from '../../../docs/.vitepress/sidebar.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

/** The docs of this version, as the docs tool reads them: llms.txt, pages.json and each page’s markdown. */
export function bundleDocs(outDir: string): void {
  const rendered = renderLlms({
    srcDir: join(ROOT, 'docs'),
    site,
    title: llmsTitle,
    description: llmsDescription,
    sections: sidebar.map((s) => ({ text: s.text, items: s.items.map((i) => ({ title: i.text, link: i.link })) })),
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'llms.txt'), rendered.index);
  writeFileSync(join(outDir, 'pages.json'), JSON.stringify(rendered.pages.map((p) => ({ path: p.relative.replace(/\.md$/, ''), title: p.title })), null, 2));
  for (const page of rendered.pages) {
    const file = join(outDir, 'pages', page.relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, page.markdown);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) bundleDocs(resolve(import.meta.dirname, '../dist/docs'));
