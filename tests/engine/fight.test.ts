import { describe, expect, it } from 'vitest';
import { execute } from '@/engine/engine';
import type { GameState, ParsedAction } from '@/types/game';
import type { World } from '@/types/world';
import { carry, stateWith } from '../helpers/state';
import { fixtureWorld } from '../fixtures/world';

const base: World = {
  ...fixtureWorld,
  style: 'infocom',
  maxScore: 350,
  carry: { limit: 100 },
  combat: { strength: { min: 2, max: 7 }, cureWait: 30 },
  events: {
    ...fixtureWorld.events,
    guard_wakes: ['The guard stirs.'],
    guard_busy: ['The guard looks for his cudgel.'],
  },
};
const withGuard = (combat: Partial<NonNullable<World['npcs'][string]['combat']>>): World => ({
  ...base,
  npcs: { ...base.npcs, guard: { ...base.npcs.guard, combat: { ...base.npcs.guard.combat!, ...combat } } },
});
const world = withGuard({ onWake: 'guard_wakes', onBusy: 'guard_busy' });
const act = (s: GameState, a: ParsedAction, w: World = world) => execute(a, { world: w, state: s }).lines;
const wait = (s: GameState, w: World = world) => act(s, { action: 'wait' }, w);
const GUARD_BLOW = /^The guard (misses you|knocks you out|kills you|wounds you|wounds you badly|staggers you|knocks your bat away|hesitates|finishes you off)\.$/;

/** A state in the shed with the bat, seeded. */
function armed(seed: number, w: World = world): GameState {
  const s = stateWith(w, { room: 'shed' });
  carry(s, 'bat');
  s.rng = seed;
  return s;
}

describe('their blows', () => {
  it('a fighting guard swings back, the same turn you attack', () => {
    let swung = false;
    for (let seed = 1; seed < 40 && !swung; seed++) {
      const s = armed(seed);
      // Zork's demon runs the same turn: the guard swings back straight away.
      const lines = act(s, { action: 'attack', target: 'guard', indirect: 'bat' });
      if ((s.npcs?.guard?.strength ?? 0) > 0) swung = lines.some((l) => GUARD_BLOW.test(l));
    }
    expect(swung).toBe(true);
  });

  it('first strike starts a fight while you’re in the room', () => {
    const w = withGuard({ firstStrike: 100 });
    const s = armed(7, w);
    expect(wait(s, w).some((l) => GUARD_BLOW.test(l))).toBe(true);
    expect(s.npcs?.guard?.fighting).toBe(true);
  });

  it('leaving ends the fight; an unconscious guard wakes when you’re gone', () => {
    const s = armed(3);
    s.npcs = { guard: { fighting: true, strength: -2 } };
    act(s, { action: 'go', target: 'out' });
    expect(s.npcs.guard.fighting).toBe(false);
    expect(s.npcs.guard.strength).toBe(2);
  });

  it('an unconscious guard in the room wakes by a growing chance', () => {
    const s = armed(5);
    s.npcs = { guard: { strength: -2 } };
    const lines: string[] = [];
    for (let i = 0; i < 12 && (s.npcs.guard.strength ?? 0) < 0; i++) lines.push(...wait(s));
    expect(s.npcs.guard.strength).toBe(2);
    expect(lines).toContain('The guard stirs.');
  });

  it('busy: a guard without his weapon runs onBusy instead of swinging', () => {
    const s = armed(9);
    s.npcs = { guard: { fighting: true } };
    s.locations.cudgel = 'shed';
    const lines = wait(s);
    expect(lines).toContain('The guard looks for his cudgel.');
    expect(lines.some((l) => GUARD_BLOW.test(l))).toBe(false);
  });

  it('wounds lower strength and the carry limit, and heal every cureWait turns', () => {
    const s = armed(1);
    s.player = { wounds: 1, load: 90, cureIn: 2 };
    wait(s);
    expect(s.player.cureIn).toBe(1);
    wait(s);
    expect(s.player.wounds ?? 0).toBe(0);
    expect(s.player.load).toBe(100);
    expect(s.player.cureIn).toBeUndefined();
  });

  it('a killing blow goes through the death system; fights end and wounds clear', () => {
    const w: World = { ...withGuard({ strength: 9 }), death: { respawn: 'bedroom', lives: 3, message: ['    ****  You have died  ****'] } };
    let died = false;
    for (let seed = 1; seed < 200 && !died; seed++) {
      const s = armed(seed, w);
      s.npcs = { guard: { fighting: true } };
      for (let i = 0; i < 15 && s.currentRoom === 'shed'; i++) {
        const lines = wait(s, w);
        if (lines.includes('It appears that that last blow was too much for you. I’m afraid you are dead.')) {
          died = true;
          expect(s.currentRoom).toBe('bedroom');
          expect(s.npcs.guard.fighting).toBe(false);
          expect(s.player?.wounds ?? 0).toBe(0);
        }
      }
    }
    expect(died).toBe(true);
  });

  it('a fight replays identically from the same state (UNDO and saves)', () => {
    const a = armed(11);
    const b = structuredClone(a);
    for (const s of [a, b]) for (let i = 0; i < 6; i++) act(s, { action: 'attack', target: 'guard', indirect: 'bat' });
    expect(a).toEqual(b);
  });
});

describe('DIAGNOSE', () => {
  const diagnose = (s: GameState, w: World = world) => act(s, { action: 'diagnose' }, w);
  it('reports health in Zork’s words', () => {
    const s = armed(1);
    expect(diagnose(s)).toEqual(['You are in perfect health.', 'You can be killed by a serious wound.']);
    s.player = { wounds: 1, cureIn: 12 };
    expect(diagnose(s)).toEqual(['You have a light wound, which will be cured after 12 moves.', 'You can be killed by one more light wound.']);
    s.player = { wounds: 2, cureIn: 5 };
    expect(diagnose(s)).toEqual(['You have a serious wound, which will be cured after 35 moves.', 'You can expect death soon.']);
    s.vars = { ...s.vars, deaths: 1 };
    expect(diagnose(s).at(-1)).toBe('You have been killed once.');
  });
  it('brass worlds get brackets; DIAGNOSE takes a move, as in Zork', () => {
    const s = stateWith(fixtureWorld);
    expect(act(s, { action: 'diagnose' }, fixtureWorld)[0]).toBe('[You are in perfect health.]');
    expect(s.moveCount).toBe(1);
  });
  it('parses', async () => {
    const { fallbackParse } = await import('@/engine/parser');
    expect(fallbackParse('diagnose')).toEqual({ action: 'diagnose' });
  });
});

describe('turns that change only health or characters still count as changes', () => {
  it('healing is a change (saved, undoable)', () => {
    const s = armed(1);
    s.player = { wounds: 1, load: 90, cureIn: 1 };
    expect(execute({ action: 'wait' }, { world, state: s }).mutated).toBe(true);
  });
});
