import { describe, expect, it } from 'vitest';
import { runSteps } from '@/engine/effects';
import { execute } from '@/engine/engine';
import { conditionProblems, evaluateCondition } from '@/engine/conditions';
import { terrainOf } from '@/engine/model';
import { nextRandom } from '@/engine/rng';
import type { ParsedAction } from '@/types/game';
import type { Room, World } from '@/types/world';
import { auditWorld } from '../helpers/audit';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const room = (name: string, exits: Room['exits'], extra: Partial<Room> = {}): Room => ({ name, description: `${name}.`, exits, items: [], npcs: [], onEnter: [], ...extra });

// A garage on the land, a sand maze to the east, a pond to the south; a buggy and a chair in the garage.
const desert: World = {
  ...fixtureWorld,
  style: 'infocom',
  startRoom: 'garage',
  rooms: {
    garage: room('Garage', { east: 'dune_1', south: 'pond', north: 'lot' }, { items: ['buggy', 'chair'] }),
    lot: room('Lot', { south: 'garage' }),
    dune_1: room('Dune', { west: 'garage', east: 'dune_2' }, { terrain: 'sand' }),
    dune_2: room('Far Dune', { west: 'dune_1' }, { terrain: 'sand' }),
    pond: room('Pond', { north: 'garage' }, { water: true }),
  },
  items: {
    buggy: {
      name: 'buggy', description: 'A buggy.', portable: false, tags: [], container: { open: true },
      vehicle: { travels: ['land', 'sand'], leave: 'The engine roars.', arrive: 'Sand sprays.' },
    },
    chair: { name: 'chair', description: 'A chair.', portable: false, tags: [], container: { open: true }, vehicle: { travels: 'none' } },
  },
  events: {},
  daemons: [],
  npcs: {},
  scripts: { roar: () => [{ say: 'Vroom.' }, { say: 'Vroom vroom.' }, { set: 'ignored' }] },
};
const go = (s: ReturnType<typeof stateWith>, dir: string, w: World = desert) => execute({ action: 'go', target: dir } as ParsedAction, { world: w, state: s });
const act = (s: ReturnType<typeof stateWith>, a: ParsedAction, w: World = desert) => execute(a, { world: w, state: s });

describe('terrains', () => {
  it('a room is land unless it says otherwise; water and air are shorthand, and a set terrain wins', () => {
    const s = stateWith(desert);
    expect(terrainOf(desert, s, 'garage')).toBe('land');
    expect(terrainOf(desert, s, 'dune_1')).toBe('sand');
    expect(terrainOf(desert, s, 'pond')).toBe('water');
    const w: World = { ...desert, rooms: { ...desert.rooms, lot: room('Lot', {}, { air: true }), pond: room('Pond', {}, { water: true, terrain: 'bog' }) } };
    expect(terrainOf(w, s, 'lot')).toBe('air');
    expect(terrainOf(w, s, 'pond')).toBe('bog');
  });
});

describe('a buggy over a sand maze', () => {
  it('drives through the sand, with its leave and arrive lines', () => {
    const s = stateWith(desert, { room: 'garage' });
    s.aboard = 'buggy';
    const out = go(s, 'east').lines;
    expect(s.currentRoom).toBe('dune_1');
    expect(s.locations.buggy).toBe('dune_1');
    expect(out).toEqual(['The engine roars.', '📍 Dune, in the buggy', 'Dune.', 'Sand sprays.']);
    go(s, 'east');
    expect(s.currentRoom).toBe('dune_2');
    go(s, 'west');
    go(s, 'west');
    expect(s.currentRoom).toBe('garage');
  });
  it('is refused the pond (not in its travels)', () => {
    const s = stateWith(desert, { room: 'garage' });
    s.aboard = 'buggy';
    expect(go(s, 'south').lines[0]).toBe('You can’t go there in a buggy.');
    expect(s.currentRoom).toBe('garage');
  });
  it('on foot, sand is out of reach', () => {
    const s = stateWith(desert, { room: 'garage' });
    expect(go(s, 'east').lines).toEqual(['You can’t go there without a vehicle.']);
    expect(s.currentRoom).toBe('garage');
  });
  it('getting out in the sand is refused; on the land it works', () => {
    const s = stateWith(desert, { room: 'dune_1' });
    s.locations.buggy = 'dune_1';
    s.aboard = 'buggy';
    expect(act(s, { action: 'disembark' }).lines).toContain('You realize that getting out here would be fatal.');
    expect(s.aboard).toBe('buggy');
    s.currentRoom = 'garage';
    expect(act(s, { action: 'disembark' }).lines).toContain('You are on your own feet again.');
  });
  it('with onFoot listing sand, the player walks there and gets out', () => {
    const w: World = { ...desert, onFoot: ['land', 'sand'] };
    const s = stateWith(w, { room: 'garage' });
    go(s, 'east', w);
    expect(s.currentRoom).toBe('dune_1');
    s.locations.buggy = 'dune_1';
    s.aboard = 'buggy';
    expect(act(s, { action: 'disembark' }, w).lines).toContain('You are on your own feet again.');
    // ...but the pond is still out.
    s.currentRoom = 'garage';
    expect(go(s, 'south', w).lines).toEqual(['You can’t go there without a vehicle.']);
  });
  it('a chair that travels nowhere never moves', () => {
    const s = stateWith(desert, { room: 'garage' });
    s.aboard = 'chair';
    expect(go(s, 'north').lines[0]).toBe('You can’t go there in a chair.');
    expect(go(s, 'east').lines[0]).toBe('You can’t go there in a chair.');
    expect(s.currentRoom).toBe('garage');
  });
});

describe('landing', () => {
  const skyWorld: World = {
    ...desert,
    rooms: { ...desert.rooms, sky: room('Sky', { down: 'garage' }, { air: true }), garage: room('Garage', { up: 'sky', east: 'dune_1', south: 'pond', north: 'lot' }, { items: ['buggy', 'balloon'] }) },
    items: { ...desert.items, balloon: { name: 'balloon', description: 'A balloon.', portable: false, tags: [], container: { open: true }, vehicle: { travels: 'air', landing: 'The balloon lands.' } } },
  };
  it('the balloon’s landing line prints as it comes down to land, after leave and before the room', () => {
    const s = stateWith(skyWorld, { room: 'sky' });
    s.locations.balloon = 'sky';
    s.aboard = 'balloon';
    expect(go(s, 'down', skyWorld).lines.slice(0, 2)).toEqual(['The balloon lands.', '📍 Garage, in the balloon']);
    // Going up from the land says nothing of landing.
    expect(go(s, 'up', skyWorld).lines[0]).toBe('📍 Sky, in the balloon');
  });
  it('an array landing picks one line with the seed; a script landing says its say lines', () => {
    const land = (landing: unknown, seed = 7) => {
      const w: World = { ...skyWorld, scripts: { thud: () => [{ say: 'Thud.' }, { say: 'Again.' }] }, items: { ...skyWorld.items, balloon: { ...skyWorld.items.balloon, vehicle: { travels: 'air', landing } as never } } };
      const s = stateWith(w, { room: 'sky' });
      s.rng = seed;
      s.locations.balloon = 'sky';
      s.aboard = 'balloon';
      return go(s, 'down', w).lines;
    };
    expect(land(['Bump.', 'Crunch.', 'Splat.'])).toEqual(land(['Bump.', 'Crunch.', 'Splat.']));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => land(['Bump.', 'Crunch.', 'Splat.'], seed)[0]))).toEqual(new Set(['Bump.', 'Crunch.', 'Splat.']));
    expect(land({ script: 'thud' }).slice(0, 3)).toEqual(['Thud.', 'Again.', '📍 Garage, in the balloon']);
  });
  it('a water vehicle with no landing says Zork’s shore line and a blank line; an air one says nothing', () => {
    const w: World = {
      ...desert,
      items: { ...desert.items, boat: { name: 'boat', description: 'A boat.', portable: false, tags: [], container: { open: true }, vehicle: { travels: 'water' } } },
      rooms: { ...desert.rooms, pond: room('Pond', { north: 'garage', south: 'shore' }, { water: true }), shore: room('Shore', { north: 'pond' }) },
    };
    const s = stateWith(w, { room: 'pond' });
    s.locations.boat = 'pond';
    s.aboard = 'boat';
    expect(go(s, 'south', w).lines.slice(0, 2)).toEqual(['The boat comes to a rest on the shore.', '']);
    const a = stateWith(skyWorld, { room: 'sky' });
    a.locations.balloon = 'sky';
    a.aboard = 'balloon';
    const bare: World = { ...skyWorld, items: { ...skyWorld.items, balloon: { ...skyWorld.items.balloon, vehicle: { travels: 'air' } } } };
    expect(go(a, 'down', bare).lines[0]).toBe('📍 Garage, in the balloon');
  });
});

describe('leave and arrive forms', () => {
  const withLines = (leave: unknown, arrive: unknown): World => ({
    ...desert,
    items: { ...desert.items, buggy: { ...desert.items.buggy, vehicle: { travels: ['land', 'sand'], leave, arrive } as never } },
  });
  it('a list picks one line with the seeded generator: same seed, same line', () => {
    const w = withLines(['Rev.', 'Roar.', 'Vroom.'], undefined);
    const pick = (seed: number) => {
      const s = stateWith(w, { room: 'garage' });
      s.rng = seed;
      s.aboard = 'buggy';
      return go(s, 'east', w).lines[0];
    };
    expect(pick(12345)).toBe(pick(12345));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(pick)).size).toBeGreaterThan(1);
  });
  it('a plain string draws nothing from the generator', () => {
    const s = stateWith(desert, { room: 'garage' });
    s.aboard = 'buggy';
    const before = s.rng;
    go(s, 'east');
    expect(s.rng).toBe(before);
  });
  it('a script says its say lines, and only those', () => {
    const w = withLines({ script: 'roar' }, { script: 'roar' });
    const s = stateWith(w, { room: 'garage' });
    s.aboard = 'buggy';
    const out = go(s, 'east', w).lines;
    expect(out).toEqual(['Vroom.', 'Vroom vroom.', '📍 Dune, in the buggy', 'Dune.', 'Vroom.', 'Vroom vroom.']);
    expect(s.flags.ignored).toBeUndefined();
  });
  it('moveVehicle uses the same forms', () => {
    const w = withLines({ script: 'roar' }, ['Sand sprays.']);
    const here = stateWith(w, { room: 'garage' });
    expect(runSteps([{ moveVehicle: 'buggy', to: 'lot' }], w, here)).toEqual(['Vroom.', 'Vroom vroom.']);
    expect(runSteps([{ moveVehicle: 'buggy', to: 'garage' }], w, here)).toEqual(['Sand sprays.']);
  });
});

describe('the audit and terrains', () => {
  it('flags a terrain no room has', () => {
    const w: World = { ...desert, items: { ...desert.items, buggy: { ...desert.items.buggy, vehicle: { travels: ['land', 'snad'] } } } };
    expect(auditWorld(w).join('\n')).toContain('snad');
    expect(auditWorld(desert).filter((p) => p.includes('buggy'))).toEqual([]);
  });
  it('flags a restsOn or onFoot terrain no room has, and a missing leave script', () => {
    const w: World = {
      ...desert,
      onFoot: ['land', 'mud'],
      items: { ...desert.items, buggy: { ...desert.items.buggy, vehicle: { travels: ['land', 'sand'], restsOn: ['moss'], leave: { script: 'nope' } } } },
    };
    const p = auditWorld(w).join('\n');
    expect(p).toContain('mud');
    expect(p).toContain('moss');
    expect(p).toContain('nope');
  });
});

describe('leave is worked out in the room being left', () => {
  const lw = (leave: unknown, extra: Partial<World> = {}): World => ({
    ...desert,
    ...extra,
    scripts: { ...desert.scripts, whereFrom: (ctx) => [{ say: `Leaving ${ctx.world.rooms[ctx.room()].name}.` }] },
    items: { ...desert.items, buggy: { ...desert.items.buggy, vehicle: { travels: ['land', 'sand'], leave } as never } },
  });
  it('a leave script sees the origin room', () => {
    const w = lw({ script: 'whereFrom' });
    const s = stateWith(w, { room: 'garage' });
    s.aboard = 'buggy';
    expect(go(s, 'east', w).lines[0]).toBe('Leaving Garage.');
    expect(act(s, { action: 'look' }, w).lines.length).toBeGreaterThan(0);
  });
  it('moveVehicle’s leave also sees the room it leaves', () => {
    const w = lw({ script: 'whereFrom' });
    const s = stateWith(w, { room: 'garage' });
    expect(runSteps([{ moveVehicle: 'buggy', to: 'lot' }], w, s)).toEqual(['Leaving Garage.']);
  });
  it('its draw comes before the grue’s', () => {
    const lines = ['Rev.', 'Roar.', 'Vroom.'];
    let seed = 1;
    const draws = (n: number) => {
      const t = { rng: seed } as never;
      return Array.from({ length: n }, () => nextRandom(t));
    };
    while (draws(1)[0] - draws(2)[1] < 0.05) seed++;
    const [r1, r2] = draws(2);
    // The stumble fires only for a draw under `chance`: set it just over the second draw, under the first.
    const w = lw(lines, {
      darkness: { ...desert.darkness!, stumble: { chance: r2 * 100 + 0.001, then: [{ die: 'Grue.' }] } },
      rooms: { ...desert.rooms, garage: { ...desert.rooms.garage, dark: true }, dune_1: { ...desert.rooms.dune_1, dark: true } },
    });
    const s = stateWith(w, { room: 'garage' });
    s.rng = seed;
    s.aboard = 'buggy';
    const out = go(s, 'east', w).lines;
    expect(out[0]).toBe(lines[Math.floor(r1 * 3)]);
    expect(out.join('\n')).toContain('Grue.');
  });
});

describe('edges of the terrain rule', () => {
  const edge = (travels: string, terrain: Partial<Room>) => {
    const w: World = {
      ...desert,
      rooms: { ...desert.rooms, lot: room('Lot', { south: 'garage' }), garage: room('Garage', { north: 'lot', up: 'pond' }, { ...terrain, items: ['buggy'] }), pond: room('Pond', { down: 'garage' }) },
      items: { ...desert.items, buggy: { ...desert.items.buggy, vehicle: { travels } as never } },
    };
    const s = stateWith(w, { room: 'garage' });
    s.aboard = 'buggy';
    return go(s, 'north', w).lines[0];
  };
  it('a water vehicle in an air room is refused onto land', () => expect(edge('water', { air: true })).toBe('You can’t go there in a buggy.'));
  it('an air vehicle in a water room is refused onto land', () => expect(edge('air', { water: true })).toBe('You can’t go there in a buggy.'));
  it('a water vehicle in a water room still comes ashore', () => expect(edge('water', { water: true })).not.toBe('You can’t go there in a buggy.'));
  it('a room with both water and air holding counts as water', () => {
    const w: World = { ...desert, rooms: { ...desert.rooms, pond: room('Pond', {}, { water: true, air: true }) } };
    expect(terrainOf(w, stateWith(w), 'pond')).toBe('water');
  });
});

describe('the terrain condition and ctx.terrain', () => {
  it('terrain:NAME tests the player’s room; terrain:NAME:ROOM another', () => {
    const s = stateWith(desert, { room: 'dune_1' });
    expect(evaluateCondition('terrain:sand', s, desert)).toBe(true);
    expect(evaluateCondition('!terrain:land', s, desert)).toBe(true);
    expect(evaluateCondition('terrain:water:pond', s, desert)).toBe(true);
    expect(evaluateCondition('terrain:land:garage & terrain:sand:here', s, desert)).toBe(true);
    expect(evaluateCondition('terrain:land:dune_2', s, desert)).toBe(false);
  });
  it('the audit checks its room', () => {
    expect(conditionProblems('terrain:sand', desert)).toEqual([]);
    expect(conditionProblems('terrain:sand:nowhere9', desert).join()).toContain('nowhere9');
  });
  it('ctx.terrain(room?) answers the same', () => {
    const w: World = { ...desert, scripts: { t: (ctx) => [{ say: `${ctx.terrain()}/${ctx.terrain('pond')}` }] } };
    const s = stateWith(w, { room: 'dune_1' });
    expect(runSteps([{ script: 't' }], w, s)).toEqual(['sand/water']);
  });
});

describe('more audit', () => {
  it('flags a leave script with a step that is not a say', () => {
    const w: World = { ...desert, scripts: { bad: () => [{ say: 'x' }, { set: 'f' }] }, items: { ...desert.items, buggy: { ...desert.items.buggy, vehicle: { travels: ['land', 'sand'], arrive: { script: 'bad' } } } } };
    expect(auditWorld(w).join('\n')).toMatch(/arrive.*bad.*isn’t a say/);
  });
  it('flags a room terrain no list names', () => {
    const w: World = { ...desert, rooms: { ...desert.rooms, lot: room('Lot', {}, { terrain: 'lava' }) } };
    expect(auditWorld(w).join('\n')).toContain('lava');
    expect(auditWorld(desert).join('\n')).not.toContain('sand');
  });
});
