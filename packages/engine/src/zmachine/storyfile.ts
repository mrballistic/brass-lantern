/** A story file the player loaded from their own computer. */
export interface LoadedStory {
  /** Stable per release: the same file loaded twice is the same cartridge. */
  id: string;
  title: string;
  format: string;
  version: number;
  /** The Z-code itself, unwrapped from a Blorb if it came in one. */
  bytes: Uint8Array;
}

export type StoryFileResult =
  | { ok: true; story: LoadedStory }
  | { ok: false; error: 'not-story' | 'glulx' | 'too-big' }
  | { ok: false; error: 'version'; version: number };

/** What ifvms runs. */
const SUPPORTED = [3, 4, 5, 8];
/** The Z-machine's own size limits, by version. */
const MAX_BYTES: Record<number, number> = { 3: 128 * 1024, 4: 256 * 1024, 5: 256 * 1024, 8: 512 * 1024 };
const HEADER = 64;
const MAX_TITLE = 24;

const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4));

/** Finds the executable chunk in a Blorb (an IFF FORM of type IFRS). */
function unwrapBlorb(b: Uint8Array): { type: string; data: Uint8Array } | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let at = 12; at + 8 <= b.length; ) {
    const type = fourcc(b, at);
    const length = view.getUint32(at + 4);
    if (type === 'ZCOD' || type === 'GLUL') return { type, data: b.subarray(at + 8, at + 8 + length) };
    at += 8 + length + (length % 2);
  }
  return null;
}

function titleFrom(filename: string): string {
  const base = filename.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!base) return 'UNTITLED STORY';
  return base.length > MAX_TITLE ? `${base.slice(0, MAX_TITLE - 1).trimEnd()}…` : base;
}

/** Reads a file the player chose: raw Z-code, or Z-code in a Blorb. */
export function readStoryFile(file: Uint8Array, filename: string): StoryFileResult {
  let bytes = file;
  if (file.length >= 12 && fourcc(file, 0) === 'FORM' && fourcc(file, 8) === 'IFRS') {
    const exec = unwrapBlorb(file);
    if (!exec) return { ok: false, error: 'not-story' };
    if (exec.type === 'GLUL') return { ok: false, error: 'glulx' };
    bytes = exec.data;
  }
  if (bytes.length >= 4 && fourcc(bytes, 0) === 'Glul') return { ok: false, error: 'glulx' };

  const version = bytes[0];
  // A Z-code header is 64 bytes, and its serial number is six ASCII digits or letters.
  const serial = String.fromCharCode(...bytes.subarray(0x12, 0x18));
  if (bytes.length < HEADER || version < 1 || version > 8 || !/^[0-9A-Za-z]{6}$/.test(serial)) {
    return { ok: false, error: 'not-story' };
  }
  if (!SUPPORTED.includes(version)) return { ok: false, error: 'version', version };
  if (bytes.length > MAX_BYTES[version]) return { ok: false, error: 'too-big' };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const release = view.getUint16(2);
  const checksum = view.getUint16(0x1c).toString(16).padStart(4, '0');
  return {
    ok: true,
    story: {
      id: `local-r${release}-${serial}-${checksum}`,
      title: titleFrom(filename),
      format: `Z-machine v${version}`,
      version,
      bytes: bytes.slice(),
    },
  };
}
