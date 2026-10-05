import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute } from '@/engine/engine';
import { reachableItems, visibleItems } from '@/engine/model';
import { fallbackParse } from '@/engine/parser';
import type { GameState, ParsedAction } from '@/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const shed = () => stateWith(world, { room: 'shed', carrying: ['key'] });
const run = (s: GameState, action: string, target?: string, indirect?: string, prep?: 'in' | 'on') => {
  const a: ParsedAction = { action };
  if (target) a.target = target;
  if (indirect) a.indirect = indirect;
  if (prep) a.prep = prep;
  return execute(a, { world, state: s });
};
/** The command changes nothing but the turn counter. */
function unchanged(s: GameState, f: () => void): void {
  const before = structuredClone(s);
  f();
  expect({ ...s, turns: 0 }).toEqual({ ...before, turns: 0 });
}

describe('reach and sight', () => {
  it('sees into transparent containers but reaches only into open ones and surfaces', () => {
    const s = shed();
    expect(visibleItems(world, s)).toEqual(expect.arrayContaining(['marble', 'book', 'sky']));
    expect(reachableItems(world, s)).toContain('book');
    expect(reachableItems(world, s)).not.toContain('marble');
    expect(reachableItems(world, s)).not.toContain('coin');
    expect(visibleItems(world, s)).not.toContain('coin');
  });

  it('something inside a closed container inside an open one is out of reach', () => {
    const s = shed();
    run(s, 'unlock', 'chest', 'key');
    run(s, 'open', 'chest');
    s.locations.jar = 'chest';
    expect(visibleItems(world, s)).toContain('marble');
    expect(reachableItems(world, s)).not.toContain('marble');
    expect(run(s, 'take', 'marble').lines).toEqual(['The glass jar is closed.']);
  });

  it('a closed opaque container hides what’s inside from matching', () => {
    const s = shed();
    unchanged(s, () => expect(run(s, 'take', 'coin').understood).toBe(false));
  });
});

describe('open, close, lock, unlock', () => {
  it('a locked chest won’t open until unlocked with its key', () => {
    const s = shed();
    expect(run(s, 'open', 'chest').lines).toEqual(['The wooden chest is locked.']);
    expect(run(s, 'unlock', 'chest', 'key').lines).toEqual(['Unlocked.']);
    expect(run(s, 'open', 'chest').lines).toEqual(['Opening the wooden chest reveals a gold coin.']);
    expect(run(s, 'open', 'chest').lines).toEqual(['It’s already open.']);
    expect(run(s, 'lock', 'chest', 'key').lines).toEqual(['You’ll have to close it first.']);
    expect(run(s, 'close', 'chest').lines).toEqual(['Closed.']);
    expect(run(s, 'close', 'chest').lines).toEqual(['It’s already closed.']);
    expect(run(s, 'lock', 'chest', 'key').lines).toEqual(['Locked.']);
  });

  it('refusals are understood and change nothing', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key', 'book'] });
    unchanged(s, () => expect(run(s, 'open', 'chest').understood).not.toBe(false));
    unchanged(s, () => expect(run(s, 'unlock', 'chest', 'book').lines).toEqual(['The book doesn’t fit the lock.']));
    unchanged(s, () => expect(run(s, 'unlock', 'chest').lines).toEqual(['Unlock it with what?']));
    unchanged(s, () => expect(run(s, 'close', 'shelf').lines).toEqual(['You can’t close that.']));
    unchanged(s, () => expect(run(s, 'lock', 'bat').understood).toBe(false));
  });

  it('a key has to be carried', () => {
    const s = stateWith(world, { room: 'shed' });
    s.locations.key = 'shed';
    expect(run(s, 'unlock', 'chest', 'key').lines).toEqual(['You aren’t carrying the brass key.']);
  });

  it('an unknown target is a miss', () => {
    const s = shed();
    unchanged(s, () => expect(run(s, 'open', 'trombone').understood).toBe(false));
  });
});

describe('put and take from', () => {
  it('puts into an open container with room, and onto a surface', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['key', 'wallet', 'bat'] });
    run(s, 'unlock', 'chest', 'key');
    run(s, 'open', 'chest');
    expect(run(s, 'put', 'wallet', 'chest', 'in').lines).toEqual(['Done.']);
    expect(s.locations.wallet).toBe('chest');
    expect(run(s, 'put', 'bat', 'chest', 'in').lines).toEqual(['There’s no room in the wooden chest.']);
    expect(run(s, 'put', 'bat', 'shelf', 'on').lines).toEqual(['Done.']);
    expect(s.locations.bat).toBe('shelf');
  });

  it('won’t put into a closed container', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['wallet'] });
    unchanged(s, () => expect(run(s, 'put', 'wallet', 'chest', 'in').lines).toEqual(['The wooden chest is closed.']));
  });

  it('won’t put a container inside itself or inside its own contents', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['jar', 'key'] });
    run(s, 'open', 'jar');
    unchanged(s, () => expect(run(s, 'put', 'jar', 'jar', 'in').lines).toEqual(['You can’t put the glass jar inside itself.']));
    run(s, 'unlock', 'chest', 'key');
    run(s, 'open', 'chest');
    s.locations.coin = 'jar';
    s.locations.chest = 'jar';
    unchanged(s, () => expect(run(s, 'put', 'jar', 'chest', 'in').lines).toEqual(['You can’t put the glass jar inside itself.']));
  });

  it('PUT needs the thing in hand', () => {
    const s = shed();
    unchanged(s, () => expect(run(s, 'put', 'wallet', 'shelf', 'on').understood).toBe(false));
  });

  it('takes from a container or surface', () => {
    const s = shed();
    expect(run(s, 'take', 'book', 'shelf').lines).toEqual(['Taken: book.']);
    expect(s.locations.book).toBe('player');
    expect(s.itemState.book.moved).toBe(true);
    expect(run(s, 'take', 'marble', 'jar').lines).toEqual(['The glass jar is closed.']);
    expect(run(s, 'take', 'bat', 'shelf').understood).toBe(false);
  });

  it('PUT into something that isn’t a container falls back to its use rules', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['lamp'] });
    expect(run(s, 'put', 'lamp', 'socket', 'in').lines).toContain('✨ The lamp glows.');
  });

  it('PUT with something you aren’t holding falls back to its use rules (“put a cover sheet on the report”)', () => {
    const s = stateWith(world, { room: 'shed' });
    s.locations.lamp = 'shed';
    expect(run(s, 'put', 'lamp', 'socket', 'in').lines).toContain('✨ The lamp glows.');
  });

  it('OPEN on something that isn’t a container falls back to its use rules', () => {
    const s = stateWith(world, { room: 'bedroom' });
    expect(run(s, 'open', 'bed').lines).toContain('😴 You nap.');
  });
});

describe('listings', () => {
  it('lists what’s on surfaces and in open or transparent containers; hides scenery', () => {
    const lines = describeCurrentRoom(world, shed());
    expect(lines).toContain('Sitting on the shelf is:');
    expect(lines).toContain('  A book');
    expect(lines).toContain('The glass jar contains:');
    expect(lines).toContain('  A marble');
    expect(lines.join('\n')).not.toContain('sky');
    expect(lines.join('\n')).not.toContain('gold coin');
    expect(describeCurrentRoom(world, stateWith(world, { room: 'yard' })).join('\n')).not.toContain('fence');
  });

  it('nests contents in the inventory', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['jar'] });
    expect(run(s, 'inventory').lines).toEqual(['You are carrying:', '  - glass jar', '    The glass jar contains:', '      A marble']);
  });

  it('scenery and shared objects can be examined but not taken', () => {
    const s = stateWith(world, { room: 'yard' });
    // (The yard has a barking dog every other turn, so check the reply itself.)
    expect(run(s, 'examine', 'fence').lines[0]).toBe('A white picket fence.');
    expect(run(s, 'examine', 'sky').lines[0]).toBe('Blue, mostly.');
    expect(run(s, 'take', 'sky').lines[0]).toBe('You can’t take the sky.');
  });

  it('examining a container shows what’s inside', () => {
    const s = shed();
    expect(run(s, 'examine', 'jar').lines).toEqual(['A glass jar.', 'The glass jar contains:', '  A marble']);
  });

  it('search lists contents when it can see inside', () => {
    const s = shed();
    expect(run(s, 'search', 'jar').lines).toEqual(['The glass jar contains:', '  A marble']);
    expect(run(s, 'search', 'chest').lines).toEqual(['The wooden chest is closed.']);
    expect(run(s, 'search', 'crate').lines).toEqual(['You find nothing of interest.']);
  });
});

describe('parsing', () => {
  it('parses container verbs', () => {
    expect(fallbackParse('put the leaflet in the mailbox')).toEqual({ action: 'put', target: 'leaflet', indirect: 'mailbox', prep: 'in' });
    expect(fallbackParse('put book on shelf')).toEqual({ action: 'put', target: 'book', indirect: 'shelf', prep: 'on' });
    expect(fallbackParse('put on shirt')).toEqual({ action: 'wear', target: 'shirt' });
    expect(fallbackParse('put down shirt')).toEqual({ action: 'drop', target: 'shirt' });
    expect(fallbackParse('take coin from chest')).toEqual({ action: 'take', target: 'coin', indirect: 'chest' });
    expect(fallbackParse('get the coin out of the chest')).toEqual({ action: 'take', target: 'coin', indirect: 'chest' });
    expect(fallbackParse('unlock chest with key')).toEqual({ action: 'unlock', target: 'chest', indirect: 'key' });
    expect(fallbackParse('lock the chest')).toEqual({ action: 'lock', target: 'chest' });
    expect(fallbackParse('look in jar')).toEqual({ action: 'search', target: 'jar' });
    expect(fallbackParse('search the chest')).toEqual({ action: 'search', target: 'chest' });
    expect(fallbackParse('open mailbox')).toEqual({ action: 'open', target: 'mailbox' });
    expect(fallbackParse('shut the window')).toEqual({ action: 'close', target: 'window' });
    expect(fallbackParse('insert disk in drive')).toEqual({ action: 'put', target: 'disk', indirect: 'drive', prep: 'in' });
  });
});

describe('things behind closed glass', () => {
  /** The chest, inside the closed (but transparent) jar: visible, not reachable. */
  function chestInJar() {
    const s = stateWith(world, { room: 'shed', carrying: ['key', 'wallet'] });
    s.locations.chest = 'jar';
    return s;
  }

  it('can’t be unlocked, opened, closed or put into', () => {
    const s = chestInJar();
    unchanged(s, () => expect(run(s, 'unlock', 'chest', 'key').lines).toEqual(['The glass jar is closed.']));
    unchanged(s, () => expect(run(s, 'open', 'chest').lines).toEqual(['The glass jar is closed.']));
    unchanged(s, () => expect(run(s, 'close', 'chest').lines).toEqual(['The glass jar is closed.']));
    unchanged(s, () => expect(run(s, 'put', 'wallet', 'chest', 'in').lines).toEqual(['The glass jar is closed.']));
  });

  it('don’t fire use rules through the glass', () => {
    const s = stateWith(world, { room: 'shed', carrying: ['jar'] });
    s.locations.socket = 'jar';
    s.locations.lamp = 'shed';
    unchanged(s, () => expect(run(s, 'put', 'lamp', 'socket', 'in').lines).toEqual(['The glass jar is closed.']));
  });
});
