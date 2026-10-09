import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createGame, execute, fallbackParse, migrateSave } from '../../../src/index';
import type { World } from '../../../src/types/world';
import * as worlds from '../../../src/worlds/index';

// Plays every transcript on the two-room and recipe pages, as the pages show them,
// through createGame: a page that drifts from the engine fails here.

const DOCS = new URL('../../../../../docs/guide/building-worlds/', import.meta.url);

/** The page's sections (by `## ` heading), each with its transcripts and the example files it includes whole. */
function sections(page: string) {
  const text = readFileSync(new URL(page, DOCS), 'utf8');
  const out: Array<{ heading: string; transcripts: string[][]; files: string[] }> = [];
  let current = { heading: '', transcripts: [] as string[][], files: [] as string[] };
  out.push(current);
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      current = { heading: line.slice(3), transcripts: [], files: [] };
      out.push(current);
    }
    const whole = /^<<< \.\.\/\.\.\/\.\.\/packages\/engine\/src\/worlds\/examples\/([\w-]+)\.ts\{ts\}$/.exec(line);
    if (whole) current.files.push(whole[1]);
    // A transcript is a fence with no language whose lines include a command.
    if (line.startsWith('```')) {
      let end = i + 1;
      while (end < lines.length && lines[end] !== '```') end++;
      const body = lines.slice(i + 1, end);
      if (line === '```' && body.some((l) => l.startsWith('> '))) current.transcripts.push(body);
      i = end;
    }
  }
  return out.filter((s) => s.transcripts.length > 0 || s.files.length > 0);
}

/** Plays a transcript from a fresh game: the lines before the first command are the opening. */
function replay(world: World, transcript: string[]) {
  const game = createGame(world);
  const first = transcript.findIndex((l) => l.startsWith('> '));
  const actual = first > 0 ? [...game.opening] : [];
  for (const line of transcript.slice(first)) {
    if (!line.startsWith('> ')) continue;
    actual.push(line, ...game.send(line.slice(2)).lines);
  }
  return actual.join('\n');
}

const byFile: Record<string, World> = {
  'two-rooms': worlds.twoRooms,
  containers: worlds.containers,
  darkness: worlds.darkness,
  timers: worlds.timers,
  endings: worlds.endings,
  guard: worlds.guard,
  fortune: worlds.fortune,
  topics: worlds.topics,
  wanderer: worlds.wanderer,
  echo: worlds.echo,
  raft: worlds.raft,
  workshop: worlds.workshop,
};

describe.each(['two-rooms.md', 'recipes.md'])('%s', (page) => {
  const found = sections(page);

  // A section plays the world it shows whole, or, on a page that shows one world, that one.
  const pageFiles = found.flatMap((s) => s.files);
  const fileFor = (s: (typeof found)[number]) => s.files[0] ?? (pageFiles.length === 1 ? pageFiles[0] : undefined);

  it('shows every transcript with the world it plays', () => {
    for (const s of found) {
      expect(s.files.length, `“${s.heading}” shows more than one world`).toBeLessThanOrEqual(1);
      if (s.transcripts.length) expect(fileFor(s), `“${s.heading}” has a transcript but no full world`).toBeDefined();
    }
  });

  for (const s of found.filter((x) => x.transcripts.length)) {
    it(`${s.heading}: every transcript is the engine’s output`, () => {
      const world = byFile[fileFor(s)!];
      expect(world, fileFor(s)).toBeDefined();
      for (const transcript of s.transcripts) expect(replay(world, transcript)).toBe(transcript.join('\n'));
    });
  }
});

it('the recipes page covers every example world', () => {
  const files = [...sections('two-rooms.md'), ...sections('recipes.md')].flatMap((s) => s.files);
  expect(new Set(files)).toEqual(new Set(Object.keys(byFile)));
});

// The examples on the Building worlds overview (docs/guide/building-worlds/index.md).
describe('the building-worlds overview', () => {
  it('a direction: rule in orders.go', () => {
    const transcript = ['> robot, go to the dunes', 'The robot looks at its treads, then at the sand, and stays put.', '> robot, go east', 'Whirr, click!'];
    expect(replay(worlds.workshop, transcript)).toBe(transcript.join('\n'));
    // A compass word reaches the rule as typed too.
    const east: World = structuredClone({ ...worlds.workshop, scripts: undefined });
    east.npcs.robot.orders = { go: [{ if: 'direction:east', say: ['East it is not.'] }] };
    expect(createGame(east).send('robot, go east').lines).toEqual(['East it is not.']);
  });

  it('save repair: an item added in version 2 turns up in a version 1 save', () => {
    const v1 = worlds.twoRooms;
    const v2: World = structuredClone(v1);
    v2.rooms.hall.items = ['side_table', 'umbrella'];
    v2.items.umbrella = { name: 'umbrella', description: 'A black umbrella, still damp.', portable: true, tags: [] };

    // A version 1 game, saved in the hall.
    const game = createGame(v1);
    for (const line of ['examine mat', 'take key', 'unlock door with key', 'open door', 'north']) game.send(line);
    const save = JSON.parse(JSON.stringify({ version: SAVE_VERSION, savedAt: '', gameState: game.state, outputHistory: [] }));
    // The page shows these entries (and elides the door's).
    const shown = { doormat: 'porch', key: 'player', side_table: 'hall', letter: 'side_table' };
    expect(save.gameState.locations).toMatchObject(shown);
    expect(save.gameState.locations).not.toHaveProperty('umbrella');

    const restored = migrateSave(v2, save)!;
    expect(restored.gameState.locations).toEqual({ ...save.gameState.locations, ...shown, umbrella: 'hall' });
    const look = execute(fallbackParse('look')!, { world: v2, state: restored.gameState }).lines;
    expect(['> look', ...look].join('\n')).toBe(`> look
📍 Hall
A dusty hall that smells of old books. The front door is south.
You can see: umbrella.
Sitting on the side table is:
  A letter
Exits: south.`);
  });
});
