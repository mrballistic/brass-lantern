// The parts of the GlkOte display protocol Brass Lantern uses.
// Reference: https://eblong.com/zarf/glk/glkote/docs.html

/** A run list: flat [style, text, style, text…] or {style, text} objects. */
export type GlkRuns = Array<string | { style?: string; text: string }>;

/** One paragraph of a buffer window. `{}` is a blank line. */
export interface GlkParagraph {
  append?: boolean;
  flowbreak?: boolean;
  content?: GlkRuns;
}

/** One changed line of a grid window (the status line is grid line 0). */
export interface GlkGridLine {
  line: number;
  content?: GlkRuns;
}

export interface GlkWindow {
  id: number;
  type: 'buffer' | 'grid' | 'graphics' | 'pair';
  rock: number;
  gridwidth?: number;
  gridheight?: number;
}

export interface GlkContent {
  id: number;
  clear?: boolean;
  text?: GlkParagraph[];
  lines?: GlkGridLine[];
}

export interface GlkInputRequest {
  id: number;
  type: 'line' | 'char';
  gen: number;
  maxlen?: number;
  initial?: string;
}

/** The game wants a file: SAVE (write) or RESTORE (read). */
export interface FilePrompt {
  type: 'fileref_prompt';
  filemode: 'read' | 'write' | 'readwrite' | 'writeappend';
  filetype: string;
  gameid?: string;
}

export interface GlkUpdate {
  type: 'update' | 'exit' | 'error' | 'pass';
  gen?: number;
  windows?: GlkWindow[] | null;
  content?: GlkContent[];
  input?: GlkInputRequest[];
  specialinput?: FilePrompt;
  disable?: boolean;
  message?: string;
}

/** The status line, split: location on the left, score or time on the right. */
export interface StatusLine {
  location: string;
  detail: string;
}
