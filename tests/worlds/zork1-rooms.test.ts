import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zork1 } from '@/worlds/zork1';
import { storyRooms } from '../helpers/zobjects';

const story = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../fixtures/zork1.z3')));
const bare = (name: string) => name.replace(/^The /, '');

describe('native Zork I’s rooms', () => {
  it('reads the story file’s rooms', () => {
    const rooms = storyRooms(story);
    expect(rooms.length).toBeGreaterThan(100);
    expect(rooms).toContain('West of House');
    expect(rooms).toContain('The Troll Room');
  });

  it('are listed in the story file’s order (the thief walks it)', () => {
    const order = storyRooms(story).map(bare);
    // A subsequence: each native room is the next story room with its name (Forest, Maze and Dead End repeat).
    let at = -1;
    const missing: string[] = [];
    for (const [id, room] of Object.entries(zork1.rooms)) {
      const next = order.findIndex((o, k) => k > at && o === bare(room.name));
      if (next < 0) missing.push(id);
      else at = next;
    }
    expect(missing).toEqual([]);
  });
});
