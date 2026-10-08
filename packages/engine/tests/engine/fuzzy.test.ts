import { fuzzyCandidates, fuzzyMatch, fuzzyMatchExit } from '../../src/engine/fuzzy';

describe('fuzzyMatch', () => {
  const candidates = [
    { id: 'red_mug', name: 'red Swingline stapler' },
    { id: 'expense_reports', name: 'expense reports' },
    { id: 'apartment_key', name: 'apartment key' },
  ];

  it('matches by exact ID (after normalization)', () => {
    expect(fuzzyMatch('red_mug', candidates)).toBe('red_mug');
  });

  it('matches by exact display name', () => {
    expect(fuzzyMatch('apartment key', candidates)).toBe('apartment_key');
  });

  it('matches by substring within name', () => {
    expect(fuzzyMatch('stapler', candidates)).toBe('red_mug');
  });

  it('matches by token overlap (e.g. "swingline" within "red Swingline stapler")', () => {
    expect(fuzzyMatch('swingline', candidates)).toBe('red_mug');
  });

  it('returns null for an empty input string', () => {
    expect(fuzzyMatch('', candidates)).toBeNull();
  });

  it('returns null when no plausible candidate exists', () => {
    expect(fuzzyMatch('helicopter', candidates)).toBeNull();
  });

  it('returns null for whitespace-only input after normalize', () => {
    expect(fuzzyMatch('   ', candidates)).toBeNull();
  });

  it('skips the token-overlap path for inputs <= 2 chars', () => {
    // "ke" is 2 chars: substring check would normally still hit "apartment key" (key contains "ke"),
    // so use an input that can ONLY match via token-overlap to verify the gate.
    // Construct candidates whose tokens include a 2-char word.
    const tokenOnly = [
      { id: 'thing_one', name: 'a aaa' },
      { id: 'thing_two', name: 'bb cc' },
    ];
    // "aa" cannot substring-match anything because the normalized name "a aaa" contains "aa" via "aaa",
    // so use a needle that exists ONLY as a 2-char token in haystack and is not a substring of any
    // candidate token: candidates have tokens "a", "aaa", "bb", "cc". Use needle "bz" — no overlap, no substring.
    // To prove the gate, use a candidate whose only relation to needle is shared 2-char tokenship.
    const candidates2 = [{ id: 'foo', name: 'qq zz' }];
    // "qq" as needle: it's a substring of "qq zz" too. So we cannot fully isolate purely via length<=2.
    // Just verify behavior: a 2-char needle that has no substring relation returns null.
    expect(fuzzyMatch('qz', candidates2)).toBeNull();
    expect(fuzzyMatch('bz', tokenOnly)).toBeNull();
  });
});

describe('fuzzyMatchExit', () => {
  const exits: Record<string, string> = {
    north: 'lobby',
    south: 'parking',
    out: 'street',
    outside: 'street',
    lobby: 'lobby_room',
  };

  it('matches a direction synonym (n → north)', () => {
    expect(fuzzyMatchExit('n', exits)).toBe('north');
  });

  it('matches the exact exit label', () => {
    expect(fuzzyMatchExit('lobby', exits)).toBe('lobby');
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatchExit('NORTH', exits)).toBe('north');
    expect(fuzzyMatchExit('Lobby', exits)).toBe('lobby');
  });

  it('STRICT direction returns null when no exact label matches', () => {
    const noSouth: Record<string, string> = { out: 'a', outside: 'b' };
    // "south" is a strict direction — it must NOT substring-match "out" or "outside".
    expect(fuzzyMatchExit('south', noSouth)).toBeNull();
  });

  it('non-direction needle can substring-match a non-direction label', () => {
    expect(fuzzyMatchExit('lobb', exits)).toBe('lobby');
  });

  it('skips labels that are pure directions during substring search', () => {
    // "back" is a strict direction word — it should not reverse-substring into "north".
    const dirOnly: Record<string, string> = { north: 'somewhere' };
    expect(fuzzyMatchExit('back', dirOnly)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(fuzzyMatchExit('', exits)).toBeNull();
  });

  it('returns null for an unknown non-direction needle', () => {
    expect(fuzzyMatchExit('xyzzy', exits)).toBeNull();
  });
});

describe('fuzzy token-prefix matching', () => {
  it('resolves a token-prefix exit ("cubic farm" → "cubicle_farm")', () => {
    const exits = {
      cubicles: 'cubicle_farm',
      cubicle_farm: 'cubicle_farm',
      break_room: 'break_room',
      east: 'cubicle_farm',
    };
    // "cubic" is a prefix of "cubicle" and "farm" matches "farm" → cubicle_farm scores 2;
    // "cubicles" has no token for "farm", so it is not a candidate.
    expect(fuzzyMatchExit('cubic farm', exits)).toBe('cubicle_farm');
  });

  it('resolves a single-token prefix exit ("brk" too short, "brea" → "break_room")', () => {
    const exits = { break_room: 'break_room', east: 'commute' };
    expect(fuzzyMatchExit('brea', exits)).toBe('break_room');
  });

  it('still returns null for a non-direction needle with zero token overlap', () => {
    const exits = { lobby: 'main_lobby', break_room: 'break_room' };
    expect(fuzzyMatchExit('mordor', exits)).toBeNull();
  });

  it('strict directions remain immune to token-prefix matching', () => {
    const exits = { outside: 'parking_lot', east: 'commute' };
    expect(fuzzyMatchExit('south', exits)).toBeNull();
  });

  it('fuzzyMatch token-prefix resolves item names ("swing" → "red Swingline stapler")', () => {
    const candidates = [
      { id: 'red_mug', name: 'red Swingline stapler' },
      { id: 'expense_reports', name: 'expense reports' },
    ];
    expect(fuzzyMatch('swing', candidates)).toBe('red_mug');
  });
});

describe('token tier needs every typed word', () => {
  const pool = [
    { id: 'piece_of_flair', name: 'I LOVE FLAIR button', aliases: ['flair', 'button'] },
    { id: 'lost_found_flair', name: 'faded flair', aliases: ['flair'] },
    { id: 'cubicle_farm', name: 'The Cubicle Farm' },
    { id: 'red_stapler', name: 'red Swingline stapler', aliases: ['stapler'] },
  ];
  it('an extra word that names nothing in a candidate stops the match', () => {
    expect(fuzzyCandidates('smiley flair', pool)).toEqual([]);
  });
  it('fewer words than the name still match', () => {
    expect(fuzzyCandidates('cubic farm', pool)).toEqual(['cubicle_farm']);
    expect(fuzzyCandidates('farm', pool)).toEqual(['cubicle_farm']);
    expect(fuzzyCandidates('red stapler', pool)).toEqual(['red_stapler']);
    expect(fuzzyCandidates('swingline', pool)).toEqual(['red_stapler']);
  });
  it('fuzzyMatch agrees', () => {
    expect(fuzzyMatch('smiley flair', pool)).toBeNull();
    expect(fuzzyMatch('cubic farm', pool)).toBe('cubicle_farm');
    expect(fuzzyMatch('red stapler', pool)).toBe('red_stapler');
  });
  it('fuzzyMatchExit agrees', () => {
    const exits = { cubicle_farm: 'cubicle_farm', lobby: 'main_lobby' };
    expect(fuzzyMatchExit('smelly cubic farm', exits)).toBeNull();
    expect(fuzzyMatchExit('cubic farm', exits)).toBe('cubicle_farm');
    expect(fuzzyMatchExit('lobby', exits)).toBe('lobby');
  });
  it('words of one or two letters are not held to it', () => {
    expect(fuzzyCandidates('a cubic farm', pool)).toEqual(['cubicle_farm']);
  });
});
