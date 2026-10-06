import { describe, expect, it } from 'vitest';
import { twoRooms } from '@/worlds/examples/two-rooms';
import { play } from '../../helpers/play';

// The game built in docs/guide/building-worlds/two-rooms.md. If this breaks, that page is wrong.

const TRANSCRIPT = `You’re back at the old house at last. You’re sure you left the key somewhere obvious.
📍 Front Porch
A creaky porch in front of an old house. A doormat lies at your feet.
Exits: north.
> north
The front door is closed.
> examine mat
You lift a corner of the mat. Underneath: a brass key.
> take key
Taken: brass key.
> unlock door with key
Unlocked.
> open door
Opened.
> north
📍 Hall
A dusty hall that smells of old books. The front door is south.
Sitting on the side table is:
  A letter
Exits: south.
> take letter
Taken: letter.
> read letter
“Dear me,” it begins. “If you’re reading this, you remembered the mat. Welcome home.”
✨ You’re home.
Type RESTART to play again.`;

describe('the two-room game', () => {
  it('plays to the end', () => {
    const { state, text } = play(twoRooms, [
      'north',
      'examine mat',
      'take key',
      'unlock door with key',
      'open door',
      'north',
      'take letter',
      'read letter',
    ]);
    expect(text).toBe(TRANSCRIPT);
    expect(state.gameOver).toBe(true);
  });

  it('can be won the short way shown on the Building worlds page', () => {
    const { state } = play(twoRooms, ['examine mat', 'take key', 'unlock door with key', 'open door', 'north', 'read letter']);
    expect(state.gameOver).toBe(true);
  });
});
