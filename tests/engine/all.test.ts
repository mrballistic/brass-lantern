import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import { fallbackParse, splitCommands } from '@/engine/parser';
import type { GameState } from '@/types/game';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

const run = (s: GameState, input: string) => execute(fallbackParse(input, world.verbs)!, { world, state: s });

describe('ALL and EXCEPT', () => {
  it('parses, and a line with EXCEPT isn’t split at “and”', () => {
    expect(fallbackParse('take all but the wallet and shirt')).toEqual({ action: 'take', target: 'all', except: ['wallet', 'shirt'] });
    expect(fallbackParse('take everything except wallet, shirt')).toEqual({ action: 'take', target: 'all', except: ['wallet', 'shirt'] });
    expect(fallbackParse('drop everything')).toEqual({ action: 'drop', target: 'all' });
    expect(fallbackParse('put all in chest')).toEqual({ action: 'put', target: 'all', indirect: 'chest', prep: 'in' });
    expect(fallbackParse('put all but key on shelf')).toEqual({ action: 'put', target: 'all', except: ['key'], indirect: 'shelf', prep: 'on' });
    expect(splitCommands('take all but the wallet and shirt')).toEqual(['take all but the wallet and shirt']);
  });

  it('takes everything here except what’s excepted, one line each', () => {
    const s = stateWith(world, { room: 'living' });
    const r = run(s, 'take all except wallet');
    expect(r.lines).toContain('brass key: Taken.');
    expect(r.lines).toContain('loud shirt: Taken.');
    expect(s.locations.wallet).toBe('living');
    expect(s.locations.shirt).toBe('player');
  });

  it('an except word that matches nothing is ignored, and nothing is taken twice', () => {
    const s = stateWith(world, { room: 'living' });
    const r = run(s, 'take all but trombone');
    expect(['key', 'wallet', 'shirt', 'rusty_key'].every((id) => s.locations[id] === 'player')).toBe(true);
    expect(r.lines.filter((l) => l.startsWith('wallet:'))).toHaveLength(1);
  });

  it('Infocom style lists them the way Zork does', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'living' });
    expect(execute(fallbackParse('take all')!, { world: w, state: s }).lines).toContain('wallet: Taken.');
  });

  it('drops all, puts all, and says when there’s nothing', () => {
    const s = stateWith(world, { room: 'yard', carrying: ['wallet', 'key'] });
    const dropped = run(s, 'drop all');
    expect(dropped.lines).toContain('wallet: Dropped.');
    expect(s.locations.wallet).toBe('yard');
    expect(run(s, 'drop all').lines[0]).toBe('You aren’t carrying anything to drop.'); // (and maybe the dog)
    const s2 = stateWith(world, { room: 'shed', carrying: ['wallet', 'key'] });
    run(s2, 'put all on shelf');
    expect(s2.locations.wallet).toBe('shelf');
    expect(run(stateWith(world, { room: 'bedroom' }), 'take all').lines).toEqual(['There is nothing here to take.']);
  });

  it('in Infocom style, takes what’s directly in the room, fixed things saying why not', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'shed' });
    const lines = execute({ action: 'take', target: 'all' }, { world: w, state: s }).lines;
    expect(lines).toContain('crate: It is too heavy.');
    expect(lines).toContain('glass jar: Taken.');
    // Not what's on the shelf, nor the sky and hatch shared with other rooms.
    expect(lines.some((l) => l.startsWith('book') || l.startsWith('sky') || l.startsWith('hatch'))).toBe(false);
  });

  it('EXAMINE of a container with no description of its own lists its contents, or says it’s empty', () => {
    const w = { ...world, items: { ...world.items, chest: { ...world.items.chest, description: '' }, socket: { ...world.items.socket, description: '' } } };
    const s = stateWith(w, { room: 'shed' });
    s.itemState.chest = { open: true, locked: false };
    const examine = (t: string) => execute({ action: 'examine', target: t }, { world: w, state: s }).lines;
    expect(examine('chest').join(' ')).toContain('gold coin');
    s.locations.coin = null;
    expect(examine('chest')).toEqual(['The wooden chest is empty.']);
    expect(examine('socket')).toEqual(['There’s nothing special about the socket.']);
  });

  it('in Infocom style, TAKE ALL in the dark finds nothing to take, and names nothing unseen', () => {
    const w = { ...world, style: 'infocom' as const, rooms: { ...world.rooms, living: { ...world.rooms.living, dark: true } } };
    const s = stateWith(w, { room: 'living' });
    expect(execute({ action: 'take', target: 'all' }, { world: w, state: s }).lines).toEqual(['There is nothing here to take.']);
  });

  it('stops at a death partway through', () => {
    const w = {
      ...world,
      items: { ...world.items, wallet: { ...world.items.wallet, after: { take: [{ then: 'boom' }] } } },
      events: { ...world.events, boom: [{ die: 'The wallet was trapped.' }] },
    };
    const s = stateWith(w, { room: 'living' });
    const r = execute({ action: 'take', target: 'all' }, { world: w, state: s });
    expect(r.lines).toContain('The wallet was trapped.');
    expect(r.lines.some((l) => l.startsWith('loud shirt'))).toBe(false);
    expect(s.locations.shirt).toBe('living');
  });

  it('a TAKE ALL where everything refuses changes nothing', () => {
    const w = { ...world, style: 'infocom' as const };
    const s = stateWith(w, { room: 'shed' });
    s.locations.jar = null;
    const r = execute({ action: 'take', target: 'all' }, { world: w, state: s });
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.mutated).toBe(false);
  });

  it('READ of an item with no description and no text says there’s nothing special', () => {
    const w = { ...world, items: { ...world.items, socket: { ...world.items.socket, description: '' } } };
    const s = stateWith(w, { room: 'shed' });
    expect(execute({ action: 'read', target: 'socket' }, { world: w, state: s }).lines).toEqual(['There’s nothing special about the socket.']);
  });

  it('a bare TALK talks to the one person here', () => {
    expect(fallbackParse('talk')).toEqual({ action: 'talk' });
  });

  it('PUT ALL IN X never tries to put X in itself', () => {
    const s = stateWith(world, { room: 'shed' });
    s.locations.jar = 'player';
    s.locations.wallet = 'player';
    s.itemState.jar = { open: true };
    const lines = execute({ action: 'put', target: 'all', indirect: 'glass jar', prep: 'in' }, { world, state: s }).lines;
    expect(lines.some((l) => l.startsWith('glass jar:'))).toBe(false);
  });
});
