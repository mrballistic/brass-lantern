import { describe, expect, it } from 'vitest';
import { paragraphsToLines, runsText, statusFromGrid } from '../../src/zmachine/format';
import type { GlkParagraph } from '../../src/zmachine/types';

const OPENING: GlkParagraph[] = [
  { content: ['normal', 'ZORK I: The Great Underground Empire'], append: true },
  { content: ['normal', 'Release 119 / Serial number 880429'] },
  {},
  { content: ['normal', 'West of House'] },
  { content: ['normal', 'You are standing in an open field west of a white house, with a boarded front door.'] },
  { content: ['normal', 'There is a small mailbox here.'] },
  {},
  { content: ['normal', '>'] },
];

const OPEN_MAILBOX: GlkParagraph[] = [
  { content: ['input', 'open mailbox'], append: true },
  { content: ['normal', 'Opening the small mailbox reveals a leaflet.'] },
  {},
  { content: ['normal', '>'] },
];

describe('runsText', () => {
  it('reads the flat style/text form', () => {
    expect(runsText(['normal', 'Hello, ', 'emphasized', 'world'])).toBe('Hello, world');
  });

  it('reads the object form', () => {
    expect(runsText([{ style: 'normal', text: 'Hi' }, { text: ' there' }])).toBe('Hi there');
  });

  it('skips runs in the given styles', () => {
    expect(runsText(['input', 'look', 'normal', 'West of House'], ['input'])).toBe('West of House');
    expect(runsText([{ style: 'input', text: 'look' }, { text: 'ok' }], ['input'])).toBe('ok');
  });

  it('handles missing content', () => {
    expect(runsText(undefined)).toBe('');
  });
});

describe('paragraphsToLines', () => {
  it('keeps text, drops blank lines and the trailing prompt', () => {
    expect(paragraphsToLines(OPENING)).toEqual([
      'ZORK I: The Great Underground Empire',
      'Release 119 / Serial number 880429',
      'West of House',
      'You are standing in an open field west of a white house, with a boarded front door.',
      'There is a small mailbox here.',
    ]);
  });

  it('drops the game’s echo of the player’s command', () => {
    expect(paragraphsToLines(OPEN_MAILBOX)).toEqual(['Opening the small mailbox reveals a leaflet.']);
  });

  it('strips a prompt at the end of the last line', () => {
    expect(
      paragraphsToLines([
        { content: ['normal', 'This gives you the rank of Beginner.'] },
        { content: ['normal', 'Do you wish to leave the game? (Y is affirmative): >'] },
      ]),
    ).toEqual(['This gives you the rank of Beginner.', 'Do you wish to leave the game? (Y is affirmative):']);
  });

  it('returns nothing for an update that is only echo and prompt', () => {
    expect(paragraphsToLines([{ content: ['input', 'z'], append: true }, {}, { content: ['normal', '>'] }])).toEqual([]);
  });
});

describe('statusFromGrid', () => {
  it('splits location from score and turns', () => {
    const status = statusFromGrid([
      { line: 0, content: ['normal', ' West of House                                               Score: 0  Turns: 0 '] },
    ]);
    expect(status).toEqual({ location: 'West of House', detail: 'Score: 0  Turns: 0' });
  });

  it('copes with a location and no detail', () => {
    expect(statusFromGrid([{ line: 0, content: ['normal', ' Forest '] }])).toEqual({ location: 'Forest', detail: '' });
  });

  it('ignores updates without line 0, or with a blank line', () => {
    expect(statusFromGrid([{ line: 1, content: ['normal', 'x'] }])).toBeNull();
    expect(statusFromGrid([{ line: 0, content: ['normal', '     '] }])).toBeNull();
    expect(statusFromGrid(undefined)).toBeNull();
  });
});
