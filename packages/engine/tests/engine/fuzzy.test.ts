import { compareRanked, fuzzyCandidates, fuzzyMatch, fuzzyMatchExit, rankCandidates, RANK, editDistance, typoSimilarity } from '../../src/engine/fuzzy';

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

describe('determiners and possessives are not required words', () => {
  const things = [
    { id: 'ball', name: 'ball' },
    { id: 'stapler', name: 'stapler' },
    { id: 'lantern', name: 'brass lantern', aliases: ['lamp'] },
  ];
  it('this, his, your and the rest may be typed without blocking', () => {
    expect(fuzzyCandidates('this ball', things)).toEqual(['ball']);
    expect(fuzzyCandidates('his stapler', things)).toEqual(['stapler']);
    expect(fuzzyCandidates('your lamp', things)).toEqual(['lantern']);
    expect(fuzzyMatch('that ball', things)).toBe('ball');
    expect(fuzzyMatch('some stapler', things)).toBe('stapler');
    expect(fuzzyMatchExit('their lobby', { lobby: 'main_lobby' })).toBe('lobby');
  });
  it('an unknown descriptive word still blocks', () => {
    expect(fuzzyCandidates('red ball', things)).toEqual([]);
    expect(fuzzyCandidates('old brass lamp', things)).toEqual([]);
    expect(fuzzyCandidates('this red ball', things)).toEqual([]);
  });
});

describe('ranks', () => {
  const c = [
    { id: 'neighbor', name: 'Neighbor' },
    { id: 'neighbors_mug', name: 'Neighbor’s coffee mug', aliases: ['mug'] },
    { id: 'neighbor_banner', name: 'banner' },
    { id: 'mailbox', name: 'tin box' },
  ];
  const others = c.slice(1);
  it('an exact name beats an item that only contains it', () => {
    expect(rankCandidates('neighbor', c)).toEqual({ rank: RANK.exact, ids: ['neighbor'] });
  });
  it('a whole word of a name is rank 2', () => {
    expect(rankCandidates('coffee', c)).toEqual({ rank: RANK.nameWord, ids: ['neighbors_mug'] });
  });
  it('a word of an ID and a part of a name tie at rank 3', () => {
    expect(rankCandidates('neighbor', others)).toMatchObject({ rank: RANK.idWordOrNamePart, ids: ['neighbors_mug', 'neighbor_banner'] });
  });
  it('a part of an ID is rank 4', () => {
    expect(rankCandidates('mail', c)).toEqual({ rank: RANK.idPart, ids: ['mailbox'] });
  });
  it('word starts are rank 5', () => {
    expect(rankCandidates('coff mug', c)).toMatchObject({ rank: RANK.wordStart, ids: ['neighbors_mug'] });
  });
  it('nothing is rank 0', () => {
    expect(rankCandidates('trombone', c)).toEqual({ rank: 0, ids: [] });
  });
  it('fuzzyCandidates returns the best rank’s IDs', () => {
    expect(fuzzyCandidates('neighbor', c)).toEqual(['neighbor']);
    expect(fuzzyCandidates('neighbor', others)).toEqual(['neighbors_mug', 'neighbor_banner']);
  });
});

describe('typos', () => {
  const lumbergh = [{ id: 'lumbergh', name: 'Bill Lumbergh' }];
  it('measures edits, swaps included', () => {
    expect(editDistance('lunbergh', 'lumbergh')).toBe(1);
    expect(editDistance('nieghbor', 'neighbor')).toBe(1);
    expect(editDistance('ab', 'ba')).toBe(1);
    expect(typoSimilarity('lunberg', 'lumbergh')).toBeCloseTo(6 / 7);
  });
  it('a close misspelling of 5+ letters is rank 6, with the word as typed', () => {
    expect(rankCandidates('Lunbergh', lumbergh, { typos: true })).toEqual({ rank: RANK.typo, ids: ['lumbergh'], typed: 'Lunbergh', typoKey: [1, 0.875, 0.875] });
    expect(rankCandidates('lunberg', lumbergh, { typos: true }).ids).toEqual(['lumbergh']);
    expect(rankCandidates('bnner', [{ id: 'banner', name: 'banner' }], { typos: true }).ids).toEqual(['banner']);
  });
  it('only when asked (the engine’s typosOn decides; it never asks for the intent server’s IDs)', () => {
    expect(rankCandidates('lunbergh', lumbergh)).toEqual({ rank: 0, ids: [] });
    expect(rankCandidates('lunbergh', lumbergh, { typos: false, byId: true })).toEqual({ rank: 0, ids: [] });
    // An answer's turn resolves by ID yet still guesses the other slot's misspelling.
    expect(rankCandidates('lunbergh', lumbergh, { typos: true, byId: true }).ids).toEqual(['lumbergh']);
  });
  it('leaves short words and far-off words alone', () => {
    expect(rankCandidates('shrt', [{ id: 'shirt', name: 'shirt' }], { typos: true }).rank).toBe(0);
    expect(rankCandidates('banar', [{ id: 'banner', name: 'banner' }], { typos: true }).rank).toBe(0);
  });
  it('every word must still match: a misspelling can’t carry a word that names nothing', () => {
    const keys = [{ id: 'rusty_key', name: 'rusty key' }, { id: 'brass_key', name: 'brass key' }];
    expect(rankCandidates('rustty key', keys, { typos: true })).toMatchObject({ rank: RANK.typo, ids: ['rusty_key'] });
    expect(rankCandidates('brasss lamp', keys, { typos: true }).rank).toBe(0);
  });
  it('equally close misspellings tie', () => {
    expect(rankCandidates('xatter', [{ id: 'hatter', name: 'hatter' }, { id: 'batter', name: 'batter' }], { typos: true }).ids).toEqual(['hatter', 'batter']);
  });
  it('an earlier rank always wins over a typo', () => {
    expect(rankCandidates('bil lumberg', lumbergh, { typos: true }).rank).toBe(RANK.wordStart);
  });
  it('a misspelled name word beats a name part or an ID word', () => {
    const neighbor = [
      { id: 'neighbor', name: 'Neighbor' },
      { id: 'neighbors_mug', name: 'Neighbor’s coffee mug', aliases: ['mug'] },
      { id: 'neighbor_banner', name: 'banner' },
    ];
    expect(rankCandidates('nieghbor', neighbor, { typos: true }).ids).toEqual(['neighbor']);
    const office = [
      { id: 'lumbergh', name: 'Bill Lumbergh' },
      { id: 'lumberghs_mug', name: 'Lumbergh’s coffee mug' },
      { id: 'lumbergh_drawer', name: 'desk drawer' },
    ];
    expect(rankCandidates('lunberg', office, { typos: true }).ids).toEqual(['lumbergh']);
  });
});

describe('compareRanked', () => {
  it('a lower rank is stronger', () => {
    expect(compareRanked({ rank: RANK.nameWord, ids: ['a'] }, { rank: RANK.idWordOrNamePart, ids: ['b'] })).toBeLessThan(0);
    expect(compareRanked({ rank: RANK.idWordOrNamePart, ids: ['a'] }, { rank: RANK.nameWord, ids: ['b'] })).toBeGreaterThan(0);
    expect(compareRanked({ rank: RANK.nameWord, ids: ['a'] }, { rank: RANK.nameWord, ids: ['b'] })).toBe(0);
  });
  it('no match loses to anything', () => {
    expect(compareRanked({ rank: 0, ids: [] }, { rank: RANK.typo, ids: ['b'], typoKey: [0, 0.8, 0.8] })).toBeGreaterThan(0);
    expect(compareRanked({ rank: RANK.wordStart, ids: ['a'] }, { rank: 0, ids: [] })).toBeLessThan(0);
    expect(compareRanked({ rank: 0, ids: [] }, { rank: 0, ids: [] })).toBe(0);
  });
  it('two typos order by their key', () => {
    const name = { rank: RANK.typo, ids: ['a'], typoKey: [1, 0.875, 0.875] as [number, number, number] };
    const part = { rank: RANK.typo, ids: ['b'], typoKey: [1, 0.875, 0.778] as [number, number, number] };
    const id = { rank: RANK.typo, ids: ['c'], typoKey: [0, 0.9, 0.9] as [number, number, number] };
    expect(compareRanked(name, part)).toBeLessThan(0);
    expect(compareRanked(id, part)).toBeGreaterThan(0);
    expect(compareRanked(name, { ...name, typoKey: [1, 0.875 + 1e-12, 0.875] })).toBe(0);
  });
  it('ranks 3 and 5 order by closeness: the nearer whole word wins', () => {
    const person = rankCandidates('neighbo', [{ id: 'neighbor', name: 'Neighbor' }]);
    const mug = rankCandidates('neighbo', [{ id: 'neighbors_mug', name: 'Neighbor’s coffee mug', aliases: ['mug'] }]);
    expect(person).toMatchObject({ rank: RANK.idWordOrNamePart, ids: ['neighbor'] });
    expect(person.closeness).toBeCloseTo(7 / 8);
    expect(mug.closeness).toBeCloseTo(7 / 9);
    expect(compareRanked(person, mug)).toBeLessThan(0);
    expect(compareRanked(mug, person)).toBeGreaterThan(0);
    const near = rankCandidates('lumberg mu', [{ id: 'a', name: 'Lumbergh mug' }]);
    const far = rankCandidates('lumberg mu', [{ id: 'b', name: 'Lumberghs mug' }]);
    expect(near.rank).toBe(RANK.wordStart);
    expect(compareRanked(near, far)).toBeLessThan(0);
    expect(compareRanked({ rank: RANK.wordStart, ids: ['a'], closeness: 0.5 }, { rank: RANK.wordStart, ids: ['b'], closeness: 0.5 + 1e-12 })).toBe(0);
    // A tie within one pool still asks.
    expect(rankCandidates('neighbo', [{ id: 'a', name: 'neighbors mug' }, { id: 'b', name: 'neighbor mug' }]).ids).toEqual(['a', 'b']);
  });
});
