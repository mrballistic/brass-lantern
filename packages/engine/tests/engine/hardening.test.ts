import { afterEach, describe, expect, it } from 'vitest';
import { auditWorld } from '../../src/engine/audit';
import { interpret, newConversation } from '../../src/engine/conversation';
import { runSteps } from '../../src/engine/effects';
import { execute, initialState } from '../../src/engine/engine';
import { createGame } from '../../src/engine/game';
import { isSafeKey } from '../../src/engine/keys';
import { moveItem, npcStateOf } from '../../src/engine/model';
import { MAX_INPUT_LENGTH, TOO_LONG_REPLY, fallbackParse, splitCommands, strictParse } from '../../src/engine/parser';
import type { EventStep, World } from '../../src/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld as world } from '../fixtures/world';

// Player input and world text reach regexes; none of them may take more than linear time
// (CodeQL js/polynomial-redos), and no world ID or input may write through to Object.prototype
// (js/prototype-polluting-assignment).

const BUDGET_MS = 50;
const PAD = ' '.repeat(50_000);

/** Runs `fn`, asserting it finished inside the budget. */
function timed<T>(fn: () => T): T {
  const start = performance.now();
  const out = fn();
  expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  return out;
}

describe('crafted input runs in linear time and parses as its tidy equivalent', () => {
  // A run of whitespace ending in a newline is the worst case for the old `\s+…(.+)$` shapes:
  // `.` can't match the newline, so every split of the run was tried.
  const padded: Array<[string, string]> = [
    ['climb ' + PAD + '\nx', 'climb x'],
    ['board ' + PAD + '\nboat', 'board boat'],
    ['get all but ' + PAD + '\nwallet', 'get all but wallet'],
    ['get all but wallet' + PAD + '\n, shirt', 'get all but wallet , shirt'],
    ['drop all but ' + PAD + '\nwallet', 'drop all but wallet'],
    ['put all but ' + PAD + '\nwallet in box', 'put all but wallet in box'],
    ['put all' + PAD + '\nin box', 'put all in box'],
    ['put all in ' + PAD + '\nbox', 'put all in box'],
    ['neighbor' + PAD + '\n, go north', 'neighbor , go north'],
    ['neighbor,' + PAD + '\ngo north', 'neighbor, go north'],
    ['neighbor' + PAD + '\nx', 'neighbor x'],
    ['take' + PAD + '\nwallet', 'take wallet'],
  ];

  it.each(padded)('fallbackParse(%#)', (input, tidy) => {
    expect(timed(() => fallbackParse(input, world.verbs))).toEqual(fallbackParse(tidy, world.verbs));
    expect(timed(() => strictParse(input, world.verbs))).toEqual(strictParse(tidy, world.verbs));
  });

  it.each([
    ...padded,
    ['take wallet,' + PAD + '\nshirt', 'take wallet, shirt'],
    ['take wallet' + PAD + '\nand' + PAD + 'shirt', 'take wallet and shirt'],
    ['north' + PAD + '\nthen' + PAD + 'south', 'north then south'],
  ])('splitCommands(%#)', (input, tidy) => {
    expect(timed(() => splitCommands(input, world.verbs))).toEqual(splitCommands(tidy, world.verbs));
  });

  it('padding never counts towards the length cap', () => {
    expect(timed(() => splitCommands('look' + PAD + PAD))).toEqual(['look']);
    const game = createGame(world, { seed: 1 });
    const other = createGame(world, { seed: 1 });
    expect(timed(() => game.send('look' + PAD))).toEqual(other.send('look'));
  });

  it('OOPS with a padded word', () => {
    const conv = newConversation();
    conv.lastUnknown = 'take wallett';
    const s = stateWith(world, { room: 'living' });
    const step = timed(() => interpret('oops ' + PAD + '\nwallet', conv, world, s));
    const tidy = newConversation();
    tidy.lastUnknown = 'take wallett';
    expect(step).toEqual(interpret('oops wallet', tidy, world, s));
  });

  it('many !s, many “s and many full stops (over the cap: rejected, quickly)', () => {
    for (const input of ['look' + '!'.repeat(50_000) + 'x', 'say ' + '“'.repeat(50_000), 'look' + '.'.repeat(50_000) + 'x']) {
      expect(timed(() => splitCommands(input, world.verbs))).toEqual([]);
      expect(timed(() => fallbackParse(input, world.verbs))).toBeNull();
    }
  });

  it('the same shapes under the cap still parse as before', () => {
    expect(splitCommands('look' + '!'.repeat(900), world.verbs)).toEqual(['look']);
    expect(splitCommands('look.!.!', world.verbs)).toEqual(['look']);
    expect(splitCommands('wait. “' + '“'.repeat(900), world.verbs)).toEqual(['wait', '“' + '“'.repeat(900)]);
    expect(splitCommands('say “hello. then” and “x” then wait')).toEqual(['say “hello. then” and “x”', 'wait']);
    expect(splitCommands('say "a. b" then "c then wait')).toEqual(['say "a. b"', '"c', 'wait']);
  });

  it('bracket lines in world text parse in linear time', () => {
    const s = stateWith(world);
    for (const line of ['[Flag set:' + PAD + '\n', '[Added to inventory:' + PAD + '\n', '[Flag set:' + PAD + '\nx', '[x' + PAD + '\n consumed']) {
      expect(timed(() => runSteps([line], world, s))).toEqual([line]);
    }
    expect(timed(() => runSteps(['[Flag set:' + PAD + 'Paid]'], world, s))).toEqual(['[Flag set:' + PAD + 'Paid]']);
    expect(s.flags.paid).toBe(true);
  });
});

describe('the input length cap', () => {
  const long = 'x'.repeat(MAX_INPUT_LENGTH + 1);

  it('library parsers reject over-length input', () => {
    expect(splitCommands(long)).toEqual([]);
    expect(fallbackParse(long)).toBeNull();
    expect(strictParse(long)).toBeNull();
    expect(fallbackParse('x'.repeat(MAX_INPUT_LENGTH))).not.toBeNull();
  });

  it('interpret replies without touching the conversation', () => {
    const conv = newConversation();
    conv.lastUnknown = 'take wallett';
    const before = structuredClone(conv);
    expect(interpret('oops ' + long, conv, world, stateWith(world))).toEqual({ reply: [TOO_LONG_REPLY] });
    expect(conv).toEqual(before);
  });

  it('createGame().send replies and changes nothing', () => {
    const game = createGame(world, { seed: 1 });
    game.send('look');
    const before = structuredClone(game.state);
    expect(game.send('take wallet. ' + long)).toEqual({ lines: [TOO_LONG_REPLY], gameOver: false, awaiting: false });
    expect(game.state).toEqual(before);
    // and no UNDO step was recorded for it
    expect(game.send('undo').lines).toEqual(['[Nothing to undo.]']);
  });
});

describe('reserved keys never reach Object.prototype', () => {
  afterEach(() => {
    for (const k of ['polluted', 'room', 'seq', 'open', 'locked', 'on', 'following', 'moved', 'fighting', 'staggered']) delete (Object.prototype as Record<string, unknown>)[k];
  });

  const clean = () => {
    const probe = {} as Record<string, unknown>;
    for (const k of ['polluted', 'room', 'seq', 'open', 'locked', 'on', 'following', 'moved', 'fighting', 'staggered']) expect(probe[k]).toBeUndefined();
  };

  it('isSafeKey', () => {
    for (const k of ['__proto__', 'constructor', 'prototype']) expect(isSafeKey(k)).toBe(false);
    for (const k of ['wallet', 'proto', '__proto', 'Constructor']) expect(isSafeKey(k)).toBe(true);
  });

  it('effects naming __proto__, constructor or prototype change nothing', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const s = stateWith(world);
      const steps = [
        { npcState: key, polluted: 'yes' },
        { moveNpc: key, to: 'yard' },
        { follow: key },
        { open: key },
        { lock: key },
        { switch: key, on: true },
        { set: key },
        { clear: key },
        { add: key, by: 1 },
        { setVar: key, to: 2 },
        { schedule: key, in: 2 },
        { move: key, to: 'player' },
      ] as unknown as EventStep[];
      const before = JSON.stringify(s);
      runSteps(steps, world, s);
      clean();
      expect(JSON.stringify(s)).toBe(before);
      for (const map of [s.flags, s.vars ?? {}, s.itemState, s.npcs ?? {}, s.locations, s.fuses ?? {}]) expect(Object.hasOwn(map, key)).toBe(false);
    }
  });

  it('model helpers refuse reserved keys', () => {
    const s = stateWith(world);
    Object.assign(npcStateOf(s, '__proto__'), { polluted: 'yes' });
    moveItem(s, '__proto__', 'yard');
    clean();
    expect(Object.getPrototypeOf(s.locations)).toBe(Object.prototype);
  });

  // A world parsed from JSON can carry an own "__proto__" key.
  const hostile = (): World => {
    const extra = JSON.parse(
      '{"__proto__": {"name": "proto", "description": "x", "portable": true, "tags": []}, "constructor": {"name": "ctor", "description": "x", "portable": true, "tags": []}}',
    );
    const npcs = JSON.parse('{"__proto__": {"name": "ghost", "description": "x", "dialogue": {}}}');
    const events = JSON.parse('{"prototype": ["[Flag set: Paid]"]}');
    return {
      ...world,
      items: { ...world.items, ...extra },
      npcs: { ...world.npcs, ...npcs },
      events: { ...world.events, ...events, poke: [{ set: 'constructor' }, { add: '__proto__', by: 1 }, { setVar: 'prototype', to: 1 }] },
      flagLabels: { ...world.flagLabels, odd: 'constructor' },
    };
  };

  it('a world with reserved IDs starts and plays without polluting', () => {
    const w = hostile();
    const s = initialState(w);
    expect(Object.getPrototypeOf(s.locations)).toBe(Object.prototype);
    runSteps([{ npcState: '__proto__', polluted: 'yes' } as unknown as EventStep, { open: '__proto__' }, '[Flag set: Odd]'], w, s);
    clean();
    expect(Object.hasOwn(s.flags, 'constructor')).toBe(false);
  });

  it('OPEN on an item with a reserved ID (Infocom style) writes nothing to Object.prototype', () => {
    for (const key of ['__proto__', 'constructor']) {
      const items = JSON.parse(
        `{"${key}": {"name": "crate", "description": "A crate.", "portable": false, "tags": [], "container": {"openable": true, "open": false}}}`,
      );
      const w: World = {
        ...world,
        style: 'infocom',
        items: { ...world.items, ...items },
        rooms: { ...world.rooms, bedroom: { ...world.rooms.bedroom, items: [...world.rooms.bedroom.items, key] } },
      };
      const s = stateWith(w, { room: 'bedroom' });
      // A save or a JSON world can put an own "__proto__" key in the map; plain assignment can't.
      Object.defineProperty(s.locations, key, { value: 'bedroom', enumerable: true, writable: true, configurable: true });
      const r = execute({ action: 'open', target: 'crate' }, { world: w, state: s });
      expect(r.lines.join(' ')).toMatch(/open/i);
      clean();
      expect(Object.hasOwn(s.itemState, key)).toBe(false);
    }
  });

  it('the audit reports reserved IDs, flags and variables', () => {
    const problems = auditWorld(hostile());
    for (const p of [
      'item “__proto__” uses a reserved name',
      'item “constructor” uses a reserved name',
      'character “__proto__” uses a reserved name',
      'event “prototype” uses a reserved name',
      'flag “constructor” uses a reserved name',
      'variable “__proto__” uses a reserved name',
      'variable “prototype” uses a reserved name',
    ]) {
      expect(problems.some((line) => line.includes(p)), p).toBe(true);
    }
    expect(auditWorld(world).filter((p) => p.includes('reserved name'))).toEqual([]);
  });
});

describe('prototype words are just unknown words', () => {
  for (const w of ['constructor', '__proto__', 'tostring', 'hasownproperty']) {
    it(`“${w}” bare, as a direction, as a topic and as an order never throws`, () => {
      const game = createGame(world, { seed: 1 });
      for (const line of [w, `go ${w}`, `ask neighbor about ${w}`, `neighbor, ${w}`]) {
        const reply = game.send(line);
        expect(reply.lines.join(' ')).not.toContain('Something went wrong');
      }
      // A bare word is a movement guess if it is plain letters (as any unknown word is), else not parsed.
      expect(fallbackParse(w)).toEqual(/^[a-z]/i.test(w) ? { action: 'go', target: w } : null);
    });
  }
});
