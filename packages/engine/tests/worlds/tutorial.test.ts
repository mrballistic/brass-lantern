import { describe, expect, it } from 'vitest';
import { tutorial as world } from '../../src/worlds/tutorial';
import { execute, initialState, openingLines } from '../../src/engine/engine';
import { fallbackParse, splitCommands } from '../../src/engine/parser';
import { inventoryOf } from '../../src/engine/model';

// The worked example in the world-building guide. If this breaks, the guide is wrong.

function play(lines: string[]) {
  const state = initialState(world);
  const log = [...openingLines(world, state)];
  for (const line of lines) {
    log.push(`> ${line}`);
    for (const command of splitCommands(line)) {
      const parsed = fallbackParse(command);
      if (!parsed) throw new Error(`unparsed: ${command}`);
      log.push(...execute(parsed, { world, state }).lines);
    }
  }
  return { state, text: log.join('\n') };
}

describe('tutorial world', () => {
  it('plays to the best ending', () => {
    const { state, text } = play([
      'open drawer',
      'take stapler',
      'north',
      'take mug and give mug to gary',
      'talk to gary',
      'north',
      'smash machine with stapler',
    ]);
    expect(state.gameOver).toBe(true);
    expect(text).toContain('Inside, under a decade of sticky notes: your badge.');
    expect(text).toContain('just hit it. Hard.');
    expect(text).toContain('You share the pretzels');
    expect(text).toContain('[Score: 50 of 50');
    expect(text).toContain('[Rank: Lunch Liberator]');
  });

  it('gates the break room on the badge', () => {
    const { state, text } = play(['north', 'north']);
    expect(state.currentRoom).toBe('hallway');
    expect(text).toContain('badge reader');
  });

  it('Gary refuses the badge and you keep it', () => {
    const { state, text } = play(['open drawer', 'north', 'give badge to gary']);
    expect(text).toContain('Keep your badge');
    expect(inventoryOf(world, state)).toContain('badge');
  });

  it('the machine hums every other turn while the pretzels are stuck', () => {
    const { text } = play(['open drawer', 'north', 'north', 'look', 'look']);
    expect(text).toMatch(/hums, smug|sway, just out of reach/);
  });

  it('bare hands hurt, once, then taunt', () => {
    const { text } = play(['open drawer', 'north', 'north', 'smash machine', 'smash machine']);
    expect(text).toContain('The vending machine wins.');
    expect(text).toContain('The machine is winning.');
  });

  it('hints follow progress', () => {
    expect(play(['hint']).text).toContain('Check your desk');
    expect(play(['open drawer', 'hint']).text).toContain('Gary lost his mug');
  });
});
