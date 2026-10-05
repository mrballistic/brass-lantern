import { fallbackParse, splitCommands } from '@/engine/parser';

describe('fallbackParse', () => {
  describe('empty / invalid input', () => {
    it('returns null for an empty string', () => {
      expect(fallbackParse('')).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
      expect(fallbackParse('   ')).toBeNull();
    });

    it('returns null for pure punctuation/garbage', () => {
      expect(fallbackParse('!!!')).toBeNull();
      expect(fallbackParse('@#$%')).toBeNull();
    });
  });

  describe('single-word commands', () => {
    it.each([
      ['look', { action: 'look' }],
      ['l', { action: 'look' }],
      ['inventory', { action: 'inventory' }],
      ['inv', { action: 'inventory' }],
      ['i', { action: 'inventory' }],
      ['help', { action: 'help' }],
      ['?', { action: 'help' }],
      ['restart', { action: 'restart' }],
      ['quit', { action: 'quit' }],
      ['save', { action: 'save' }],
      ['load', { action: 'load' }],
    ])('parses %s', (input, expected) => {
      expect(fallbackParse(input)).toEqual(expected);
    });

    it('is case-insensitive', () => {
      expect(fallbackParse('HELP')).toEqual({ action: 'help' });
      expect(fallbackParse('Inventory')).toEqual({ action: 'inventory' });
    });
  });

  describe('bare directions', () => {
    it.each([
      ['n', 'north'],
      ['north', 'north'],
      ['s', 'south'],
      ['e', 'east'],
      ['w', 'west'],
      ['up', 'up'],
      ['down', 'down'],
      ['out', 'out'],
      ['outside', 'outside'],
      ['in', 'in'],
      ['inside', 'inside'],
      ['back', 'back'],
    ])('parses bare %s as go %s', (input, target) => {
      expect(fallbackParse(input)).toEqual({ action: 'go', target });
    });
  });

  describe('movement', () => {
    it('parses "go north"', () => {
      expect(fallbackParse('go north')).toEqual({ action: 'go', target: 'north' });
    });

    it('parses "walk to the lobby"', () => {
      expect(fallbackParse('walk to the lobby')).toEqual({ action: 'go', target: 'lobby' });
    });

    it('parses "head over to the cubicles"', () => {
      expect(fallbackParse('head over to the cubicles')).toEqual({
        action: 'go',
        target: 'cubicles',
      });
    });

    it('parses "move toward break room"', () => {
      expect(fallbackParse('move toward break room')).toEqual({
        action: 'go',
        target: 'break room',
      });
    });

    it('parses "run to lobby"', () => {
      expect(fallbackParse('run to lobby')).toEqual({ action: 'go', target: 'lobby' });
    });
  });

  describe('enter / drive', () => {
    it('parses "enter lobby"', () => {
      expect(fallbackParse('enter lobby')).toEqual({ action: 'go', target: 'lobby' });
    });

    it('parses "drive to work"', () => {
      expect(fallbackParse('drive to work')).toEqual({ action: 'go', target: 'work' });
    });

    it('parses bare "drive"', () => {
      expect(fallbackParse('drive')).toEqual({ action: 'go', target: 'drive' });
    });

    it('parses bare "leave"', () => {
      expect(fallbackParse('leave')).toEqual({ action: 'go', target: 'drive' });
    });
  });

  describe('take synonyms', () => {
    it.each(['take', 'get', 'grab', 'pick up'])('parses "%s stapler"', (verb) => {
      expect(fallbackParse(`${verb} stapler`)).toEqual({ action: 'take', target: 'stapler' });
    });

    it('strips a leading "the"', () => {
      expect(fallbackParse('take the stapler')).toEqual({ action: 'take', target: 'stapler' });
    });
  });

  describe('drop variants', () => {
    it('parses "drop wallet"', () => {
      expect(fallbackParse('drop wallet')).toEqual({ action: 'drop', target: 'wallet' });
    });

    it('parses "put down the wallet"', () => {
      expect(fallbackParse('put down the wallet')).toEqual({
        action: 'drop',
        target: 'wallet',
      });
    });
  });

  describe('examine synonyms', () => {
    it.each(['examine', 'inspect', 'x', 'read'])('parses "%s stapler"', (verb) => {
      expect(fallbackParse(`${verb} stapler`)).toEqual({
        action: 'examine',
        target: 'stapler',
      });
    });

    it('parses "look at the stapler"', () => {
      expect(fallbackParse('look at the stapler')).toEqual({
        action: 'examine',
        target: 'stapler',
      });
    });
  });

  describe('use / wear', () => {
    it('parses "use terminal"', () => {
      expect(fallbackParse('use terminal')).toEqual({ action: 'use', target: 'terminal' });
    });

    it('parses "insert disk in drive"', () => {
      expect(fallbackParse('insert disk in drive')).toEqual({
        action: 'use',
        target: 'disk',
        indirect: 'drive',
      });
    });

    it('parses "wear hawaiian shirt"', () => {
      expect(fallbackParse('wear hawaiian shirt')).toEqual({
        action: 'wear',
        target: 'hawaiian shirt',
      });
    });

    it('parses "put on the shirt"', () => {
      expect(fallbackParse('put on the shirt')).toEqual({ action: 'wear', target: 'shirt' });
    });
  });

  describe('talk / ask', () => {
    it('parses "talk to the boss"', () => {
      expect(fallbackParse('talk to the boss')).toEqual({ action: 'talk', target: 'boss' });
    });

    it('parses "talk with pat"', () => {
      expect(fallbackParse('talk with pat')).toEqual({ action: 'talk', target: 'pat' });
    });

    it('strips "the" — "talk to the bartender"', () => {
      expect(fallbackParse('talk to the bartender')).toEqual({
        action: 'talk',
        target: 'bartender',
      });
    });

    it('parses "ask gary about fire"', () => {
      expect(fallbackParse('ask gary about fire')).toEqual({
        action: 'talk',
        target: 'gary',
      });
    });
  });

  describe('smash / install / sit / wait', () => {
    it.each(['smash', 'destroy', 'break', 'kill', 'hit', 'attack', 'wreck'])(
      'parses "%s printer"',
      (verb) => {
        expect(fallbackParse(`${verb} printer`)).toEqual({
          action: 'smash',
          target: 'printer',
        });
      },
    );

    it('parses "install virus"', () => {
      expect(fallbackParse('install virus')).toEqual({ action: 'install', target: 'virus' });
    });

    it('parses "sit"', () => {
      expect(fallbackParse('sit')).toEqual({ action: 'sit' });
    });

    it('parses "sit down"', () => {
      expect(fallbackParse('sit down')).toEqual({ action: 'sit' });
    });

    it('parses "relax"', () => {
      expect(fallbackParse('relax')).toEqual({ action: 'sit' });
    });

    it('parses "wait"', () => {
      expect(fallbackParse('wait')).toEqual({ action: 'wait' });
    });

    it('parses "z" as wait', () => {
      expect(fallbackParse('z')).toEqual({ action: 'wait' });
    });
  });

  describe('bare word fallback', () => {
    it('treats a bare word as a "go" target', () => {
      expect(fallbackParse('lobby')).toEqual({ action: 'go', target: 'lobby' });
    });

    it('treats a word with underscores as a "go" target', () => {
      expect(fallbackParse('break_room')).toEqual({ action: 'go', target: 'break_room' });
    });
  });

  describe('case insensitivity overall', () => {
    it('upper-cased verbs still parse', () => {
      expect(fallbackParse('TAKE STAPLER')).toEqual({ action: 'take', target: 'stapler' });
      expect(fallbackParse('Go North')).toEqual({ action: 'go', target: 'north' });
    });
  });

  describe('exit verb', () => {
    it('parses "exit to living room"', () => {
      expect(fallbackParse('exit to living room')).toEqual({
        action: 'go',
        target: 'living room',
      });
    });
    it('parses "exit to the living room"', () => {
      expect(fallbackParse('exit to the living room')).toEqual({
        action: 'go',
        target: 'living room',
      });
    });
    it('parses "exit to living_room" (snake_case)', () => {
      expect(fallbackParse('exit to living_room')).toEqual({
        action: 'go',
        target: 'living_room',
      });
    });
    it('parses bare "exit" as go out', () => {
      expect(fallbackParse('exit')).toEqual({ action: 'go', target: 'out' });
    });
  });

  describe('snooze verb', () => {
    it('parses bare "snooze"', () => {
      expect(fallbackParse('snooze')).toEqual({ action: 'snooze' });
    });
    it('parses "hit snooze"', () => {
      expect(fallbackParse('hit snooze')).toEqual({ action: 'snooze' });
    });
    it('parses "hit the snooze button"', () => {
      expect(fallbackParse('hit the snooze button')).toEqual({ action: 'snooze' });
    });
    it('parses "press snooze"', () => {
      expect(fallbackParse('press snooze')).toEqual({ action: 'snooze' });
    });
    it('parses "snooze alarm clock" with the item as target', () => {
      expect(fallbackParse('snooze alarm clock')).toEqual({
        action: 'snooze',
        target: 'alarm clock',
      });
    });
    it('parses "snooze the alarm clock" and strips "the"', () => {
      expect(fallbackParse('snooze the alarm clock')).toEqual({
        action: 'snooze',
        target: 'alarm clock',
      });
    });
  });
});

describe('splitCommands', () => {
  it.each([
    ['get key and wallet', ['get key', 'take wallet']],
    ['take key, wallet and stapler', ['take key', 'take wallet', 'take stapler']],
    ['take key, wallet, and stapler', ['take key', 'take wallet', 'take stapler']],
    ['take the wallet and go outside', ['take the wallet', 'go outside']],
    ['west then take wallet', ['west', 'take wallet']],
    ['west, then lobby', ['west', 'lobby']],
    ['west. take wallet.', ['west', 'take wallet']],
    ['look; inventory', ['look', 'inventory']],
    ['examine key and wallet', ['examine key', 'examine wallet']],
    ['talk to mike and sam', ['talk to mike', 'talk to sam']],
    ['talk to dr. smith', ['talk to dr. smith']],
    ['take wallet', ['take wallet']],
  ])('%s', (input, expected) => {
    expect(splitCommands(input)).toEqual(expected);
  });

  it('keeps natural language whole for the LLM', () => {
    expect(splitCommands('could you grab my keys and wallet')).toEqual([
      'could you grab my keys and wallet',
    ]);
  });

  it('keeps a list it can’t attribute to a verb whole', () => {
    expect(splitCommands('give stapler and flair to gary')).toEqual([
      'give stapler and flair to gary',
    ]);
  });

  it('splits clauses even when one of them is natural language', () => {
    expect(splitCommands('check my pockets, then head outside')).toEqual([
      'check my pockets',
      'head outside',
    ]);
  });

  it('returns nothing for blank input', () => {
    expect(splitCommands('   ')).toEqual([]);
  });
});

describe('weekend verbs', () => {
  it.each(['sleep', 'go to bed', 'take a nap', 'lie down', 'go to sleep'])('“%s” uses the bed', (input) => {
    expect(fallbackParse(input)).toEqual({ action: 'use', target: 'bed' });
  });

  it('attach X to Y is a use with an indirect object', () => {
    expect(fallbackParse('attach a cover sheet to my expense reports')).toEqual({
      action: 'use',
      target: 'cover sheet',
      indirect: 'expense reports',
    });
  });

  it.each(['open', 'push', 'pull', 'press'])('“%s X” is a use', (verb) => {
    expect(fallbackParse(`${verb} the drawer`)).toEqual({ action: 'use', target: 'drawer' });
  });

  it('unplug and answer are uses', () => {
    expect(fallbackParse('unplug the phone')).toEqual({ action: 'use', target: 'phone' });
    expect(fallbackParse('answer phone')).toEqual({ action: 'use', target: 'phone' });
  });
});
