import { describe, expect, it } from 'vitest';
import { describeCurrentRoom, execute } from '../../src/engine/engine';
import { createGame } from '../../src/engine/game';
import { fallbackParse } from '../../src/engine/parser';
import { runSteps } from '../../src/engine/effects';
import type { NPC, World } from '../../src/types/world';
import { auditWorld } from '../helpers/audit';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const text = (w: World, input: string) => createGame(w).send(input).lines.join(' ');

describe('audit: any direction word', () => {
  it('direction:basement is fine', () => {
    const w: World = {
      ...fixtureWorld,
      rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, npcs: ['samir'] } },
      npcs: {
        ...fixtureWorld.npcs,
        samir: { name: 'Samir', description: 'Samir is here.', orders: { go: [{ if: 'direction:basement', say: ['No.'] }] } },
      },
    };
    expect(auditWorld(w).filter((p) => p.includes('direction:basement'))).toEqual([]);
  });
  it('a malformed direction is still reported', () => {
    const w: World = {
      ...fixtureWorld,
      rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, instead: { snooze: [{ if: 'direction:', say: ['x'] }] } } },
    };
    expect(auditWorld(w).join('\n')).toContain('direction:');
  });
});

describe('one exit check', () => {
  const w: World = {
    ...fixtureWorld,
    rooms: {
      ...fixtureWorld.rooms,
      bedroom: {
        ...fixtureWorld.rooms.bedroom,
        exits: { ...fixtureWorld.rooms.bedroom.exits, north: { to: 'living', denials: [{ if: 'flag:x', text: 'Blocked.' }] } },
      },
    },
  };
  const seen: Record<string, unknown> = {};
  const w2: World = { ...w, scripts: { probe: (ctx) => void (seen.exits = ctx.exits('bedroom').map((e) => e.direction)) } };
  it('ctx.exits omits an exit whose denial holds, and go refuses it', () => {
    const s = stateWith(w2, { room: 'bedroom', flags: ['x'] });
    runSteps([{ script: 'probe' }], w2, s);
    expect(seen.exits).not.toContain('north');
    expect(execute({ action: 'go', target: 'north' }, { world: w2, state: s }).lines).toEqual(['Blocked.']);
  });
  it('with the flag unset both allow it', () => {
    const s = stateWith(w2, { room: 'bedroom' });
    runSteps([{ script: 'probe' }], w2, s);
    expect(seen.exits).toContain('north');
    execute({ action: 'go', target: 'north' }, { world: w2, state: s });
    expect(s.currentRoom).toBe('living');
  });
});

describe('templates in listings', () => {
  const w: World = {
    ...fixtureWorld,
    vars: { n: 4 },
    rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, items: [...fixtureWorld.rooms.bedroom.items, 'tally', 'tray', 'ledge'] } },
    items: {
      ...fixtureWorld.items,
      tally: { name: 'tally', description: 'A tally.', portable: true, tags: [], roomDescription: 'A tally reads {var:n}.' },
      tray: { name: 'tray', description: 'A tray.', portable: false, tags: [], container: { transparent: true }, contains: ['chit'] },
      chit: { name: 'chit', description: 'A chit.', portable: true, tags: [], initialDescription: 'A chit says {var:n}.' },
      ledge: { name: 'ledge', description: 'A ledge.', portable: false, tags: [], surface: true, scenery: true, contains: ['dot'] },
      dot: { name: 'dot', description: 'A dot.', portable: true, tags: [], roomDescription: 'A dot counts {var:n}.' },
    },
  };
  it('expand in room listing, container contents and surface', () => {
    const s = stateWith(w, { room: 'bedroom' });
    const out = describeCurrentRoom(w, s).join('\n');
    expect(out).toContain('A tally reads 4.');
    expect(out).not.toContain('{var:n}');
  });
  it('contents lines expand (EXAMINE tray)', () => {
    const s = stateWith(w, { room: 'bedroom' });
    const out = execute({ action: 'look', target: 'tray' }, { world: w, state: s }).lines.join('\n');
    expect(out).not.toContain('{var:n}');
  });
  it('a surface lists its things with templates expanded (Infocom style)', () => {
    const iw: World = { ...w, style: 'infocom' };
    const s = stateWith(iw, { room: 'bedroom' });
    const out = describeCurrentRoom(iw, s).join('\n');
    expect(out).not.toContain('{var:n}');
    expect(out).toContain('A dot counts 4.');
  });
});

describe('go: true runs instead.go rules', () => {
  const w: World = {
    ...fixtureWorld,
    verbs: { ...fixtureWorld.verbs, drive: { words: ['drive'], target: 'optional', go: true } },
    rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, instead: { ...fixtureWorld.rooms.bedroom.instead, go: [{ if: 'flag:no_car', say: ['No car.'] }] } } },
  };
  it('refuses when the rule holds', () => {
    const s = stateWith(w, { room: 'bedroom', flags: ['no_car'] });
    const r = execute(fallbackParse('drive west', w.verbs)!, { world: w, state: s });
    expect(r.lines).toEqual(['No car.']);
    expect(s.currentRoom).toBe('bedroom');
  });
  it('moves otherwise', () => {
    const s = stateWith(w, { room: 'bedroom' });
    execute(fallbackParse('drive west', w.verbs)!, { world: w, state: s });
    expect(s.currentRoom).toBe('living');
  });
});

describe('NPC article', () => {
  const base = (patch: Partial<NPC>): World => ({
    ...fixtureWorld,
    rooms: { ...fixtureWorld.rooms, bedroom: { ...fixtureWorld.rooms.bedroom, npcs: ['samir'] } },
    npcs: { ...fixtureWorld.npcs, samir: { name: 'Samir', description: 'Samir is here.', obeys: ['go'], ...patch } },
  });
  it('article "" drops the The', () => {
    expect(text(base({ article: '' }), 'samir, go up')).toContain('Samir can’t go that way.');
    expect(text(base({ article: '' }), 'samir, go up')).not.toContain('The Samir');
  });
  it('default keeps The', () => {
    expect(text(base({}), 'samir, go up')).toContain('The Samir can’t go that way.');
  });
});
