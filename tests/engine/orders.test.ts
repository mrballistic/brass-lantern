import { describe, expect, it } from 'vitest';
import { exitTarget } from '@/engine/describe';
import { execute } from '@/engine/engine';
import { npcScope } from '@/engine/model';
import { fallbackParse } from '@/engine/parser';
import type { GameState } from '@/types/game';
import type { World } from '@/types/world';
import { stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

// Orders (6a): “X, command” where a character with order rules or an `obeys`
// list carries out the command (Zork II's robot, Zork III's Dungeon Master).
const w: World = {
  ...fixtureWorld,
  rooms: {
    ...fixtureWorld.rooms,
    bedroom: { ...fixtureWorld.rooms.bedroom, items: [...fixtureWorld.rooms.bedroom.items, 'sock', 'box'], scenery: ['button'], npcs: ['robot'] },
  },
  items: {
    ...fixtureWorld.items,
    sock: { name: 'sock', description: 'A lone sock.', portable: true, tags: [] },
    button: { name: 'button', description: 'A round button.', portable: false, tags: [] },
    box: { name: 'shoebox', aliases: ['box'], description: 'An open shoebox.', portable: true, tags: [], container: {}, contains: ['marble'] },
    marble: { name: 'marble', description: 'A glass marble.', portable: true, tags: [] },
    dial: { name: 'dial', description: 'A dial.', portable: false, tags: [] },
  },
  npcs: {
    ...fixtureWorld.npcs,
    robot: {
      name: 'robot',
      description: 'A robot waits for instructions.',
      obeys: ['go', 'take', 'drop', 'give'],
      orders: {
        push: [{ if: 'here:button', then: 'robot_push' }],
        turn: [{ if: 'number:4', say: ['The robot turns it to 4.'] }],
        // A rule on an obeyed verb answers before the built-in.
        take: [{ if: 'target:bed', then: 'robot_strains' }],
      },
    },
  },
  events: {
    ...fixtureWorld.events,
    robot_push: ['The robot pushes the button. Something clicks.', '[Flag set: Button pushed]'],
    robot_strains: [{ script: 'whoStrains' }],
  },
  scripts: {
    ...fixtureWorld.scripts,
    whoStrains: (ctx) => [`The ${ctx.command?.actor} strains at the ${ctx.command?.target} (${ctx.command?.verb}, ${ctx.command?.order?.target}). It won’t budge.`],
  },
  flagLabels: { ...fixtureWorld.flagLabels, 'button pushed': 'button_pushed' },
};

const run = (s: GameState, input: string, world: World = w) => execute(fallbackParse(input, world.verbs)!, { world, state: s });

/** A command that must be a miss and change nothing. */
const expectMiss = (s: GameState, input: string, line?: string, world: World = w) => {
  const before = JSON.stringify(s);
  const r = run(s, input, world);
  expect(r.understood).toBe(false);
  if (line) expect(r.lines).toEqual([line]);
  expect(JSON.stringify(s)).toBe(before);
  return r;
};

describe('orders (6a)', () => {
  it('a rule on the inner verb', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    const r = run(s, 'robot, push button');
    expect(r.lines).toEqual(['The robot pushes the button. Something clicks.', '[Flag set: Button pushed]']);
    expect(s.flags.button_pushed).toBe(true);
  });

  it('built-in GO: the robot leaves through a real exit, and a missing exit is a miss', () => {
    // The fixture bedroom's one compass exit is west (to the living room); it has no north.
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    const go = execute(fallbackParse('robot, go west', w.verbs)!, { world: w, state: s });
    expect(go.lines).toEqual(['Okay.']);
    expect(s.npcs.robot.room).toBe(exitTarget(w.rooms.bedroom.exits.west));
    s.npcs.robot.room = 'bedroom';
    const before = JSON.stringify(s);
    const north = execute(fallbackParse('robot, go north', w.verbs)!, { world: w, state: s });
    expect(north.understood).toBe(false);
    expect(north.lines).toEqual(['robot ignores you.']);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('built-in GO judges the exit as the player’s: a closed door or a failing condition refuses', () => {
    const s = stateWith(w, { room: 'shed' });
    s.npcs = { robot: { room: 'shed' } };
    expectMiss(s, 'robot, go up', 'robot ignores you.');
    s.itemState.hatch = { open: true };
    expect(run(s, 'robot, go up').lines).toEqual(['Okay.']);
    expect(s.npcs.robot.room).toBe('loft');
    const t = stateWith(w, { room: 'living' });
    t.npcs = { robot: { room: 'living' } };
    expectMiss(t, 'robot, go south', 'robot ignores you.');
    t.flags.paid = true;
    expect(run(t, 'robot, go south').lines).toEqual(['Okay.']);
    expect(t.npcs.robot.room).toBe('yard');
  });

  it('built-in TAKE, DROP and GIVE ME', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    expect(run(s, 'robot, take sock').lines).toEqual(['Okay.']);
    expect(s.locations.sock).toBe('robot');
    expect(run(s, 'robot, drop sock').lines).toEqual(['Okay.']);
    expect(s.locations.sock).toBe('bedroom');
    expect(run(s, 'robot, take sock').lines).toEqual(['Okay.']);
    expect(run(s, 'robot, give me the sock').lines).toEqual(['Okay.']);
    expect(s.locations.sock).toBe('player');
    // From an open container in its room, and GIVE X TO ME.
    expect(run(s, 'robot, take marble').lines).toEqual(['Okay.']);
    expect(s.locations.marble).toBe('robot');
    expect(run(s, 'robot, give marble to me').lines).toEqual(['Okay.']);
    expect(s.locations.marble).toBe('player');
  });

  it('obeyReplies replace the default reply', () => {
    const replying: World = { ...w, npcs: { ...w.npcs, robot: { ...w.npcs.robot, obeyReplies: { take: '“Whirr. Click.”', go: '“Going.”' } } } };
    const s = stateWith(replying, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    expect(run(s, 'robot, take sock', replying).lines).toEqual(['“Whirr. Click.”']);
    expect(run(s, 'robot, drop sock', replying).lines).toEqual(['Okay.']);
    expect(run(s, 'robot, go west', replying).lines).toEqual(['“Going.”']);
  });

  it('an impossible built-in is a miss with no change', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    expectMiss(s, 'robot, take alarm');
    expectMiss(s, 'robot, drop sock');
    expectMiss(s, 'robot, give me the sock');
  });

  it('an inner object it can’t reach is a miss with no change', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    expectMiss(s, 'robot, take xyzzy', 'You don’t see a “xyzzy” here.');
    // What the player carries isn't in the robot's reach.
    s.locations.wallet = 'player';
    expectMiss(s, 'robot, take wallet', 'You don’t see a “wallet” here.');
  });

  it('an inner object several things match asks which, taking no time and changing nothing', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    s.locations.key = 'bedroom';
    s.locations.rusty_key = 'bedroom';
    const before = JSON.stringify(s);
    const r = run(s, 'robot, take key');
    expect(r.lines).toEqual(['Which do you mean: the brass key or the rusty key?']);
    expect(r.free).toBe(true);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('ME and characters in its room are objects too', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' }, neighbor: { room: 'bedroom' } };
    s.locations.sock = 'robot';
    // GIVE to someone else is no built-in: the refusal, understood, and the sock stays put.
    const r = run(s, 'robot, give sock to neighbor');
    expect(r.lines).toEqual(['robot ignores you.']);
    expect(r.understood).not.toBe(false);
    expect(s.locations.sock).toBe('robot');
  });

  it('order rules see the inner command: target, number, and the actor', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    expect(run(s, 'robot, take the bed').lines).toEqual(['The robot strains at the bed (take, bed). It won’t budge.']);
    const dial: World = { ...w, rooms: { ...w.rooms, bedroom: { ...w.rooms.bedroom, items: [...w.rooms.bedroom.items, 'dial'] } } };
    const t = stateWith(dial, { room: 'bedroom' });
    t.npcs = { robot: { room: 'bedroom' } };
    expect(run(t, 'robot, turn dial to 4', dial).lines).toEqual(['The robot turns it to 4.']);
    // No rule applies and TURN isn't obeyed: the refusal.
    expect(run(t, 'robot, turn dial to 5', dial).lines).toEqual(['robot ignores you.']);
  });

  it('an unparseable order gets the refusal, understood', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    const r = run(s, 'robot, dance a jig');
    expect(r.understood).not.toBe(false);
    expect(r.lines).toEqual(['robot ignores you.']);
  });

  it('characters with no orders and no obeys answer as before', () => {
    const s = stateWith(w, { room: 'shed' });
    const r = run(s, 'guard, go north');
    expect(r.lines).toEqual(['guard ignores you.']);
    expect(r.understood).not.toBe(false);
    // Their inner objects aren't resolved: no miss for a thing that isn't there.
    expect(run(s, 'guard, take xyzzy').lines).toEqual(['guard ignores you.']);
  });

  it('instead.order rules still run first', () => {
    const ruled: World = { ...w, npcs: { ...w.npcs, robot: { ...w.npcs.robot, instead: { order: [{ if: 'flag:paid', say: ['The robot is on strike.'] }] } } } };
    const s = stateWith(ruled, { room: 'bedroom', flags: ['paid'] });
    s.npcs = { robot: { room: 'bedroom' } };
    expect(run(s, 'robot, take sock', ruled).lines).toEqual(['The robot is on strike.']);
    expect(s.locations.sock).toBe('bedroom');
  });

  it('an order ends the rest of the line', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    expect(run(s, 'robot, take sock').stopLine).toBe(true);
    expect(run(s, 'robot, dance').stopLine).toBe(true);
    expect(run(stateWith(w, { room: 'shed' }), 'guard, go north').stopLine).toBe(true);
  });

  it('an order to a thing or someone absent is a miss', () => {
    const s = stateWith(w, { room: 'bedroom' });
    s.npcs = { robot: { room: 'bedroom' } };
    expectMiss(s, 'lamp, go north', 'There is no “lamp” here.');
    expectMiss(s, 'neighbor, go north', 'There is no “neighbor” here.');
  });

  it('npcScope: what is in its room, reachable there, plus what it holds; not what the player carries', () => {
    const s = stateWith(w, { room: 'bedroom', carrying: ['wallet'] });
    s.npcs = { robot: { room: 'bedroom' } };
    s.locations.key = 'robot';
    const scope = npcScope(w, s, 'robot');
    expect(scope).toEqual(expect.arrayContaining(['alarm', 'bed', 'sock', 'box', 'marble', 'button', 'key']));
    expect(scope).not.toContain('wallet');
    // The guard's room is the shed; the player isn't there.
    const guard = npcScope(w, s, 'guard');
    expect(guard).toEqual(expect.arrayContaining(['crate', 'cudgel']));
    expect(guard).not.toContain('sock');
  });
});
