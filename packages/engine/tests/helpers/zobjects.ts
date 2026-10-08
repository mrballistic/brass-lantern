// Reads a version 3 story file's object tree and short names, enough to list
// its rooms in the game's own order (what Zork's thief walks with NEXT?).

const A0 = 'abcdefghijklmnopqrstuvwxyz';
const A1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// Code 6 in A2 is the ZSCII escape, code 7 a newline.
const A2 = '\0\n0123456789.,!?_#\'"/\\-:()';

const word = (m: Uint8Array, a: number) => (m[a] << 8) | m[a + 1];

/** A Z-encoded string at `addr` (abbreviations expanded). */
export function zstring(m: Uint8Array, addr: number, depth = 0): string {
  const codes: number[] = [];
  for (let a = addr; ; a += 2) {
    const w = word(m, a);
    codes.push((w >> 10) & 31, (w >> 5) & 31, w & 31);
    if (w & 0x8000) break;
  }
  const abbrevs = word(m, 0x18);
  let out = '';
  let alphabet = 0;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) out += ' ';
    else if (c >= 1 && c <= 3) {
      const entry = word(m, abbrevs + 2 * (32 * (c - 1) + codes[++i]));
      if (depth === 0) out += zstring(m, entry * 2, 1);
    } else if (c === 4) {
      alphabet = 1;
      continue;
    } else if (c === 5) {
      alphabet = 2;
      continue;
    } else if (alphabet === 2 && c === 6) {
      out += String.fromCharCode((codes[i + 1] << 5) | codes[i + 2]);
      i += 2;
    } else out += [A0, A1, A2][alphabet][c - 6];
    alphabet = 0;
  }
  return out;
}

/** Object `n`'s parent, sibling, child and short name (v3: 9-byte entries after 31 default words). */
function object(m: Uint8Array, n: number) {
  const entry = word(m, 0x0a) + 62 + (n - 1) * 9;
  const props = word(m, entry + 7);
  return { parent: m[entry + 4], sibling: m[entry + 5], child: m[entry + 6], name: m[props] ? zstring(m, props + 1) : '' };
}

/** The rooms, in the game's order: the children of West of House's parent, by sibling links. */
export function storyRooms(story: Uint8Array): string[] {
  let westOfHouse = 0;
  for (let n = 1; n < 255 && !westOfHouse; n++) if (object(story, n).name === 'West of House') westOfHouse = n;
  if (!westOfHouse) throw new Error('no West of House in this story file');
  const rooms: string[] = [];
  for (let n = object(story, object(story, westOfHouse).parent).child; n; n = object(story, n).sibling) rooms.push(object(story, n).name);
  return rooms;
}
