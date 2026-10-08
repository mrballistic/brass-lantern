import { describe, expect, it } from 'vitest';
import { execute } from '../../src/engine/engine';
import { fallbackParse } from '../../src/engine/parser';
import type { GameState, ParsedAction } from '../../src/types/game';
import type { World } from '../../src/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

// ME (6a final review): ME names the player for the world's rules, but the reserved ID
// 'player' is never fuzzy-matched against things or characters, and with no rule a verb
// aimed at ME misses with the word the player typed, exactly as before 6a.

const players: World = {
  ...fixtureWorld,
  rooms: {
    ...fixtureWorld.rooms,
    bedroom: { ...fixtureWorld.rooms.bedroom, items: [...fixtureWorld.rooms.bedroom.items, 'record_player'], npcs: ['chess_player'] },
  },
  items: { ...fixtureWorld.items, record_player: { name: 'record player', description: 'A record player.', portable: true, tags: [] } },
  npcs: { ...fixtureWorld.npcs, chess_player: { name: 'chess player', description: 'A chess player, deep in thought.' } },
};

const run = (world: World, s: GameState, input: string) => {
  const parsed = fallbackParse(input, world.verbs);
  expect(parsed, input).not.toBeNull();
  return execute(parsed!, { world, state: s });
};

/** A miss that changes nothing, with exactly `line`. */
const expectMiss = (world: World, s: GameState, input: string | ParsedAction, line?: string) => {
  const before = JSON.stringify(s);
  const r = typeof input === 'string' ? run(world, s, input) : execute(input, { world, state: s });
  expect(r.understood, JSON.stringify(input)).toBe(false);
  if (line) expect(r.lines, JSON.stringify(input)).toEqual([line]);
  expect(JSON.stringify(s), JSON.stringify(input)).toBe(before);
};

describe('ME (6a)', () => {
  it('the parser keeps the word typed: ME is resolved by the engine, not turned into an ID', () => {
    expect(fallbackParse('take me')).toEqual({ action: 'take', target: 'me' });
    expect(fallbackParse('use key on myself')).toEqual({ action: 'use', target: 'key', indirect: 'myself' });
  });

  it('take me, examine me and attack me never touch a “record player” or a “chess player”', () => {
    for (const input of ['take me', 'examine me', 'take myself', 'attack me', 'push me', 'examine myself']) {
      const s = stateWith(players, { room: 'bedroom' });
      expectMiss(players, s, input);
      expect(s.locations.record_player).toBe('bedroom');
    }
    const s = stateWith(players, { room: 'bedroom' });
    expectMiss(players, s, 'take me', 'You don’t see a “me” here.');
    expectMiss(players, s, 'examine me', 'You see no “me” here worth examining.');
  });

  it('the reserved ID from the intent server is no fuzzy word either', () => {
    const s = stateWith(players, { room: 'bedroom' });
    expectMiss(players, s, { action: 'take', target: 'player', byId: true });
    expectMiss(players, s, { action: 'examine', target: 'player', byId: true });
    expect(s.locations.record_player).toBe('bedroom');
  });

  it('“player” typed is an ordinary word, as before 6a', () => {
    const s = stateWith(players, { room: 'bedroom' });
    run(players, s, 'take player');
    expect(s.locations.record_player).toBe('player');
  });

  it('with no rule, the fixture world’s replies to ME are the pre-6a lines', () => {
    const s = stateWith(fixtureWorld, { room: 'bedroom' });
    expectMiss(fixtureWorld, s, 'take me', 'You don’t see a “me” here.');
    expectMiss(fixtureWorld, s, 'examine me', 'You see no “me” here worth examining.');
    expectMiss(fixtureWorld, s, 'attack me', 'You don’t see a “me” worth smashing.');
    expectMiss(fixtureWorld, s, 'push me', 'There is no “me” here to use.');
    expectMiss(fixtureWorld, s, 'take myself', 'You don’t see a “myself” here.');
    // As a second object too, before the verb's own checks, as before 6a.
    expectMiss(fixtureWorld, s, 'give alarm to me', 'You don’t see a “me” here.');
    const living = stateWith(fixtureWorld, { room: 'living', carrying: ['wallet'] });
    expectMiss(fixtureWorld, living, 'give wallet to me', 'You don’t see a “me” here.');
    expectMiss(fixtureWorld, living, 'put wallet in myself', 'You don’t see a “myself” here.');
  });

  it('rules still match ME: target:player on a built-in and on a world verb, with: player as the second object', () => {
    const world: World = {
      ...players,
      verbs: { ...players.verbs, smell: { words: ['smell', 'sniff'], target: 'optional', reply: 'It smells like {a target}.' } },
      rooms: {
        ...players.rooms,
        bedroom: {
          ...players.rooms.bedroom,
          instead: {
            ...players.rooms.bedroom.instead,
            examine: [{ if: 'target:player', say: ['You look fine.'] }],
            smell: [{ if: 'target:player', say: ['You smell of soap.'] }],
          },
        },
      },
      items: { ...players.items, key: { ...players.items.key, instead: { use: [{ with: 'player', say: ['You poke yourself.'] }] } } },
    };
    const s = stateWith(world, { room: 'bedroom', carrying: ['key'] });
    expect(run(world, s, 'examine me').lines).toEqual(['You look fine.']);
    expect(run(world, s, 'smell myself').lines).toEqual(['You smell of soap.']);
    expect(run(world, s, 'use brass key on me').lines).toEqual(['You poke yourself.']);
    expect(execute({ action: 'examine', target: 'player', byId: true }, { world, state: s }).lines).toEqual(['You look fine.']);
    // A world verb aimed at ME with no rule misses with the typed word.
    const plain: World = { ...world, rooms: { ...world.rooms, bedroom: { ...world.rooms.bedroom, instead: undefined } } };
    expectMiss(plain, stateWith(plain, { room: 'bedroom' }), 'smell me', 'You don’t see a “me” here.');
  });

  it('SELF and YOURSELF are ME only when nothing in scope is named or aliased that', () => {
    const ruled = (extra: World['items']): World => ({
      ...fixtureWorld,
      rooms: {
        ...fixtureWorld.rooms,
        bedroom: { ...fixtureWorld.rooms.bedroom, items: [...fixtureWorld.rooms.bedroom.items, ...Object.keys(extra)], instead: { examine: [{ if: 'target:player', say: ['You look fine.'] }] } },
      },
      items: { ...fixtureWorld.items, ...extra },
    });
    const plain = ruled({});
    expect(run(plain, stateWith(plain, { room: 'bedroom' }), 'examine self').lines).toEqual(['You look fine.']);
    expect(run(plain, stateWith(plain, { room: 'bedroom' }), 'examine yourself').lines).toEqual(['You look fine.']);
    const shelf = ruled({ book_self: { name: 'book', aliases: ['self'], description: 'A self-help book.', portable: true, tags: [] } });
    expect(run(shelf, stateWith(shelf, { room: 'bedroom' }), 'examine self').lines).toEqual(['A self-help book.']);
    // A partial match is not a name: SELF stays ME beside a “selfie stick”.
    const stick = ruled({ selfie: { name: 'selfie stick', description: 'A selfie stick.', portable: true, tags: [] } });
    expect(run(stick, stateWith(stick, { room: 'bedroom' }), 'examine self').lines).toEqual(['You look fine.']);
    // ME and MYSELF always name the player, even beside something aliased “me”.
    const me = ruled({ memo: { name: 'memo', aliases: ['me'], description: 'A memo.', portable: true, tags: [] } });
    expect(run(me, stateWith(me, { room: 'bedroom' }), 'examine me').lines).toEqual(['You look fine.']);
  });
});
