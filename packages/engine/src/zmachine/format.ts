import type { GlkGridLine, GlkParagraph, GlkRuns, StatusLine } from './types.ts';

/** The text of a run list, leaving out runs in any of the given styles. */
export function runsText(runs: GlkRuns | undefined, skip: readonly string[] = []): string {
  if (!runs) return '';
  let out = '';
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (typeof run === 'string') {
      // The flat form alternates style and text: ['normal', 'Hello', 'input', 'look'].
      const text = runs[i + 1];
      i++;
      if (typeof text === 'string' && !skip.includes(run)) out += text;
    } else if (!skip.includes(run.style ?? 'normal')) {
      out += run.text;
    }
  }
  return out;
}

const PROMPT_AT_END = /\s*>\s*$/;

/**
 * Buffer-window paragraphs as terminal lines. The game's echo of the
 * player's command (style "input") is dropped, because the terminal echoes
 * input itself; so are blank lines, and the ">" prompt the game prints
 * before waiting, on its own line or at the end of the last one.
 */
export function paragraphsToLines(paragraphs: readonly GlkParagraph[]): string[] {
  const lines = paragraphs.map((p) => runsText(p.content, ['input'])).filter((t) => t.trim() !== '');
  const last = lines.length - 1;
  if (last >= 0 && PROMPT_AT_END.test(lines[last])) {
    const trimmed = lines[last].replace(PROMPT_AT_END, '');
    if (trimmed.trim() === '') lines.pop();
    else lines[last] = trimmed;
  }
  return lines;
}

/** The status line from the top grid window: location on the left, score or time on the right. */
export function statusFromGrid(lines: readonly GlkGridLine[] | undefined): StatusLine | null {
  const top = lines?.find((l) => l.line === 0);
  if (!top) return null;
  const text = runsText(top.content).trim();
  if (text === '') return null;
  const m = text.match(/^(.*?)\s{2,}(\S.*)$/);
  if (!m) return { location: text, detail: '' };
  return { location: m[1], detail: m[2].replace(/\s{2,}/g, '  ') };
}
