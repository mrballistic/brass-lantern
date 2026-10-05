import { describe, expect, it } from 'vitest';
import { execute, initialState, openingLines, describeCurrentRoom } from '@/engine/engine';
import type { GameState, ParsedAction } from '@/types/game';
import { fixtureWorld as world } from '../fixtures/world';

// Every engine hook, exercised against the fixture world. World-agnostic, so
// it runs unchanged in any repo that uses the engine.

function fresh(room = world.startRoom): GameState {
  const state = initialState(world);
  state.currentRoom = room;
  return state;
}

function run(state: GameState, action: string, target?: string, indirect?: string) {
  const a: ParsedAction = { action };
  if (target) a.target = target;
  if (indirect) a.indirect = indirect;
  return execute(a, { world, state });
}

const text = (r: { lines: string[] }) => r.lines.join('\n');

describe('rooms and movement', () => {
  it('opens with the intro and the start room', () => {
    const lines = openingLines(world, initialState(world));
    expect(lines[0]).toContain('TEST HOUSE');
    expect(lines).toContain('📍 Bedroom');
  });

  it('lists listed exits with their compass direction', () => {
    expect(describeCurrentRoom(world, fresh('living'))).toContain('Exits: bedroom (east), outside.');
  });

  it('moves, counts moves and fires onEnter once', () => {
    const state = fresh();
    expect(text(run(state, 'go', 'west'))).toContain('You smell coffee.');
    expect(state.moveCount).toBe(1);
    run(state, 'go', 'east');
    expect(text(run(state, 'go', 'living room'))).not.toContain('You smell coffee.');
  });

  it('a bad exit is a miss and lists the exits', () => {
    const state = fresh();
    const r = run(state, 'go', 'nowhere');
    expect(r.understood).toBe(false);
    expect(r.lines[0]).toContain('Exits: living room (west)');
    expect(state.moveCount).toBe(0);
  });

  it('gated rooms show their denial until the condition holds', () => {
    const state = fresh('yard');
    expect(run(state, 'go', 'shed').lines[0]).toBe('The shed is locked.');
    state.inventory.push('key');
    run(state, 'go', 'shed');
    expect(state.currentRoom).toBe('shed');
  });

  it('a wait exit is taken by WAIT; elsewhere WAIT is the idle line', () => {
    const yard = fresh('yard');
    yard.inventory.push('key');
    run(yard, 'wait');
    expect(yard.currentRoom).toBe('shed');
    expect(run(fresh(), 'sit').lines[0]).toBe('The clock ticks.');
  });
});

describe('items', () => {
  it('take fires onTake once; non-portable items refuse', () => {
    const state = fresh('living');
    expect(text(run(state, 'take', 'key'))).toContain('The key is cold.');
    run(state, 'drop', 'key');
    expect(text(run(state, 'take', 'key'))).not.toContain('cold');
    expect(run(fresh(), 'take', 'clock').lines[0]).toBe('It is screwed to the wall.');
  });

  it('take all takes every portable item', () => {
    const state = fresh('living');
    run(state, 'take', 'all');
    expect(state.inventory).toEqual(expect.arrayContaining(['key', 'wallet', 'shirt']));
    expect(run(state, 'take', 'everything').lines[0]).toContain('nothing here worth taking');
  });

  it('take and drop misses', () => {
    const state = fresh('living');
    run(state, 'take', 'wallet');
    expect(run(state, 'take', 'wallet').lines[0]).toBe('You already have that.');
    expect(run(state, 'take', 'unicorn').understood).toBe(false);
    expect(run(state, 'drop', 'unicorn').understood).toBe(false);
  });

  it('dropped items stay in the room they were dropped in', () => {
    const state = fresh('living');
    run(state, 'take', 'wallet');
    run(state, 'go', 'out');
    run(state, 'drop', 'wallet');
    expect(describeCurrentRoom(world, state).join('\n')).toContain('wallet');
  });

  it('examine items, people and misses', () => {
    const state = fresh('yard');
    expect(run(state, 'examine', 'club').lines[0]).toBe('A wooden bat.');
    expect(run(state, 'examine', 'neighbor').lines[0]).toContain('leaning on the fence');
    expect(run(state, 'examine', 'moon').understood).toBe(false);
  });

  it('use rules: first match wins, and the rule can change', () => {
    const state = fresh();
    expect(text(run(state, 'use', 'bed'))).toContain('You nap.');
    expect(state.flags.rested).toBe(true);
    expect(run(state, 'use', 'bed').lines[0]).toBe('You are already rested.');
  });

  it('a use with another item consumes one and adds another', () => {
    const state = fresh('shed');
    state.inventory.push('key', 'lamp');
    expect(text(run(state, 'use', 'lamp', 'socket'))).toContain('The lamp glows.');
    expect(state.inventory).not.toContain('lamp');
    expect(state.inventory).toContain('lit_lamp');
  });

  it('the use rule is found from either side', () => {
    const state = fresh('shed');
    state.inventory.push('key', 'lamp');
    run(state, 'use', 'socket', 'lamp');
    expect(state.flags.lamp_lit).toBe(true);
  });

  it('use falls back to a say rule, and misses when nothing applies', () => {
    const state = fresh('yard');
    expect(run(state, 'use', 'lamp').lines[0]).toBe('It needs a socket.');
    const r = run(state, 'use', 'bat');
    expect(r.understood).toBe(false);
    expect(run(state, 'use', 'lamp', 'moon').understood).toBe(false);
  });

  it('wear fires once; USE on a wearable wears it', () => {
    const state = fresh('living');
    run(state, 'take', 'shirt');
    expect(text(run(state, 'use', 'shirt'))).toContain('You put on the shirt.');
    expect(state.flags.wearing_shirt).toBe(true);
    expect(run(state, 'wear', 'shirt').lines[0]).toContain('already wearing');
    run(state, 'take', 'wallet');
    expect(run(state, 'wear', 'wallet').lines[0]).toBe('That is not really wearable.');
  });

  it('snooze is repeatable and changes nothing', () => {
    const state = fresh();
    const r = run(state, 'snooze');
    expect(r.lines[0]).toContain('You hit snooze.');
    expect(r.mutated).toBe(false);
    expect(run(fresh('living'), 'snooze').lines[0]).toContain('nothing here to snooze');
  });

  it('onSmash removes the item; smashing it again and snoozing it after both say so', () => {
    const state = fresh();
    expect(text(run(state, 'smash', 'clock'))).toContain('You smash the alarm clock.');
    expect(state.flags.alarm_smashed).toBe(true);
    expect(run(state, 'smash', 'clock').lines[0]).toContain('already in pieces');
    expect(run(state, 'snooze').lines[0]).toContain('nothing left to snooze');
  });
});

describe('people', () => {
  it('dialogue picks the last matching condition', () => {
    const state = fresh('yard');
    expect(run(state, 'talk', 'neighbor').lines[0]).toBe('“Nice day.”');
    state.flags.paid = true;
    expect(run(state, 'talk', 'neighbor').lines[0]).toBe('“Thanks for the cash.”');
    state.inventory.push('bat');
    expect(run(state, 'talk').lines[0]).toBe('“Careful with that bat.”');
  });

  it('talking to someone absent is a miss', () => {
    expect(run(fresh(), 'talk', 'neighbor').understood).toBe(false);
    expect(run(fresh(), 'talk').lines[0]).toBe('Talk to whom?');
  });

  it('gifts: accepted, refused by item, refused in general', () => {
    const state = fresh('yard');
    state.inventory.push('wallet', 'key', 'bat');
    expect(run(state, 'give', 'key', 'neighbor').lines[0]).toBe('“Keep your key.”');
    expect(state.inventory).toContain('key');
    expect(run(state, 'give', 'bat').lines[0]).toBe('“No thanks.”');
    expect(text(run(state, 'give', 'wallet'))).toContain('takes the wallet');
    expect(state.inventory).not.toContain('wallet');
    expect(state.flags.paid).toBe(true);
  });

  it('gift misses and the nobody-here case', () => {
    const state = fresh();
    state.inventory.push('wallet');
    expect(run(state, 'give', 'wallet').lines[0]).toContain('nobody here');
    expect(run(state, 'give', 'unicorn').understood).toBe(false);
    expect(run(fresh('yard'), 'give', 'wallet', 'ghost').understood).toBe(false);
  });
});

describe('the finale', () => {
  function inShed(): GameState {
    const state = fresh('shed');
    state.inventory.push('key');
    return state;
  }

  it('bare hands: one-shot event, then the taunt', () => {
    const state = inShed();
    expect(text(run(state, 'smash', 'crate'))).toContain('Ouch.');
    expect(run(state, 'smash', 'box').lines[0]).toBe('Still hurts.');
    expect(state.gameOver).toBe(false);
  });

  it('with the tool in the wrong room', () => {
    const state = fresh('yard');
    state.inventory.push('bat');
    // The crate isn't here, so this is a miss rather than the finale.
    expect(run(state, 'smash', 'crate').understood).toBe(false);
  });

  it('wins with the tool: event, matching epilogue, score, footer', () => {
    const state = inShed();
    state.inventory.push('bat');
    state.flags.paid = true;
    const t = text(run(state, 'smash', 'crate', 'bat'));
    expect(t).toContain('The crate splinters.');
    expect(t).toContain('The neighbor waves.');
    expect(t).not.toContain('glares');
    expect(t).toContain('[Score: 30 of 40');
    expect(t).toContain('[Rank: Novice]');
    expect(t).toContain('Type RESTART');
    expect(state.gameOver).toBe(true);
    expect(run(state, 'look').lines[0]).toContain('The game has ended');
    expect(run(state, 'help').lines[0]).toContain('COMMANDS');
  });

  it('a different epilogue for a different path, and the top rank', () => {
    const state = inShed();
    state.inventory.push('bat');
    state.flags.alarm_smashed = true;
    const t = text(run(state, 'smash', 'crate'));
    expect(t).toContain('The neighbor glares.');
    expect(t).toContain('[Score: 30 of 40');
  });

  it('smashing nothing, or a pronoun, is the generic refusal', () => {
    expect(run(fresh(), 'smash').lines[0]).toContain('frowned upon');
    expect(run(fresh(), 'smash', 'it').lines[0]).toContain('frowned upon');
    expect(run(fresh(), 'smash', 'kitten').understood).toBe(false);
  });
});

describe('meta commands and timers', () => {
  it('hint follows progress; score, help, quit, inventory', () => {
    const state = fresh();
    expect(run(state, 'hint').lines[0]).toBe('[Hint] Find the key.');
    state.inventory.push('key');
    expect(run(state, 'hint').lines[0]).toBe('[Hint] Break the crate.');
    expect(run(state, 'score').lines[0]).toContain('[Score: 0 of 40');
    expect(run(state, 'help').lines[0]).toContain('COMMANDS');
    expect(run(state, 'quit').lines[0]).toContain('no quitting');
    expect(run(state, 'inventory').lines).toContain('  - brass key');
    expect(run(fresh(), 'inventory').lines[0]).toContain('corporate despair');
  });

  it('save, load and restart are signalled for the store', () => {
    expect(run(fresh(), 'save').lines[0]).toBe('[SAVE]');
    expect(run(fresh(), 'load').lines[0]).toBe('[LOAD]');
    expect(run(fresh(), 'restart').lines[0]).toBe('[RESTART]');
  });

  it('unknown input rotates the confused replies', () => {
    const state = fresh();
    expect(run(state, 'unknown').lines[0]).toBe('Please rephrase that.');
    expect(run(state, 'dance').lines[0]).toBe('Still confused.');
  });

  it('ambient lines interrupt every N understood turns while their condition holds', () => {
    const state = fresh('yard');
    const lines = [run(state, 'look'), run(state, 'look'), run(state, 'look'), run(state, 'look')].map(text);
    expect(lines.filter((l) => l.includes('dog barks'))).toHaveLength(2);
    state.flags.paid = true;
    expect(text(run(state, 'look')) + text(run(state, 'look'))).not.toContain('dog');
  });

  it('misses never change state (the LLM retry depends on it)', () => {
    const state = fresh('yard');
    state.inventory.push('lamp');
    const before = JSON.stringify(state);
    for (const [a, t, i] of [
      ['go', 'nowhere'],
      ['take', 'unicorn'],
      ['drop', 'unicorn'],
      ['examine', 'moon'],
      ['use', 'bat'],
      ['use', 'lamp', 'moon'],
      ['talk', 'ghost'],
      ['give', 'unicorn'],
      ['smash', 'kitten'],
      ['wear', 'unicorn'],
      ['install', 'unicorn'],
    ] as const) {
      expect(run(state, a, t, i).understood).toBe(false);
    }
    expect(JSON.stringify(state)).toBe(before);
  });
});
