// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildParapet, endgameWorld } from './zork3-slices/endgame';
import { sliceRun } from './slices';
import { normalize } from './zsession';

// Zork III slices (6a, Task 11): a small native world played against the story file (Release 25)
// from the endgame, reply by reply.

/**
 * The prefix plays the whole game, and Zork III's chances (the old man's 30%, the amulet's 50%,
 * the Viking ship's 20% a turn, the hooded figure's fight) are the story's own: on SEED this
 * command list reaches the Parapet with every one of the seven things and the master. It was
 * found by playing the route adaptively (tests/zz/z3adapt.test.ts) on seeds 1–25; 3, 4, 5, 9, 14
 * and 22 got through the fight.
 */
const SEED = 3;

/**
 * From the start to the Parapet, after Jericho's Zork III walkthrough (written for another
 * release), adapted to Release 25 and this seed.
 */
const TO_PARAPET = [
  // The bread, and the old man in the Engravings Room (he's there 30% of the visits): the secret door.
  'get lamp', 's', 'light lamp', 'w', 'w', 'get bread', 'e', 'e', 'e', 'ne', 'se', 'w', 'ne', 'se', 'w', 'ne', 'wake old man', 'give bread to old man',
  // The lake: the amulet from its bottom.
  'sw', 'w', 's', 's', 's', 'turn off lamp', 'drop lamp', 'jump in lake', 'd', 'get amulet', 'u',
  // The Scenic Vista's table: the torch, Room 8's grue repellent at “II”, the torch left in the Damp Passage at “III”.
  'w', 's', 'get torch', 'wait', 'wait', 'touch table', 'get can', 'wait', 'wait', 'touch table', 'drop torch', 'wait',
  // Through the lake again (it takes everything; the can is picked up off the bottom), the key, up the aqueduct to the torch.
  'n', 'jump in lake', 'd', 'get can', 'u', 's', 's', 'spray repellent on me', 's', 'e', 'get key', 'move cover', 'd', 'n', 'n', 'n', 'get torch',
  // The cliff: the chest up the rope for the “friend”, the staff from it.
  'w', 'w', 'w', 'd', 'wait', 'wait', 'tie chest to rope', 'wait', 'wait', 'wait', 'wait', 'grab rope', 'get chest', 'd', 'd',
  // The Flathead Ocean: hello to the sailor as the ship passes, the vial.
  's', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'wait', 'hello sailor', 'get vial',
  // The Land of Shadow: the hooded figure, the hood and cloak.
  'e', 'wait', 'wait', 'kill figure with sword', 'kill figure with sword', 'kill figure with sword', 'kill figure with sword', 'remove hood', 'drop sword', 'get cloak',
  // The chest across the beam.
  'ne', 'e', 'e', 'n', 'e', 'ne', 'open door', 'n', 'n', 'drop chest',
  // The museum (the earthquake has opened it): the golden machine back to 776 for the ring, hidden under its seat.
  's', 's', 'sw', 'w', 's', 'e', 'e', 's', 's', 'e', 'n', 'push golden machine south', 'open stone door', 'push golden machine east', 'examine machine', 'read plaque',
  'get in machine', 'set dial to 776', 'press button', 'wait', 'wait', 'wait', 'wait', 'wait', 'get ring', 'open door', 'w', 'open wooden door', 'n', 'lift seat',
  'hide ring under seat', 'get in golden machine', 'set dial to 948', 'press button', 'get out of golden machine', 'lift seat', 'open wooden door', 's', 'open stone door', 'e', 'get all', 'w',
  // The Royal Puzzle: the book.
  's', 'd', 'press south wall', 'e', 's', 'e', 'e', 'press south wall', 'get book', 'press south wall', 'press west wall', 'again', 'e', 'e', 'n', 'n', 'n', 'n',
  'press east wall', 'w', 's', 's', 's', 's', 'e', 'e', 'n', 'n', 'n', 'press west wall', 'n', 'w', 'press south wall', 'e', 'e', 's', 's', 's', 'w', 'w', 'n',
  'press east wall', 'w', 'w', 'w', 'n', 'n', 'w', 'n', 'press east wall', 'again', 'again', 's', 'press south wall', 'n', 'e', 'e', 's', 'press south wall', 'w',
  'press west wall', 'again', 's', 'w', 'press north wall', 'again', 'again', 'w', 'n', 'u',
  // Back to the beam, the mirror turned to face south, past the guardians unseen (the vial), the knock.
  'n', 'w', 'n', 'n', 'w', 'w', 'n', 'e', 'ne', 'n', 'press button', 'n', 'n', 'n', 'raise short pole', 'press white panel', 'again', 'lower short pole', 'push pine panel', 'n',
  'open vial', 'drink liquid', 'n', 'n', 'n', 'knock on door',
  // With the master, round the corridors to the Parapet.
  'n', 'e', 'n', 'n',
];

function mismatches(commands: string[], native: string[][], original: string[][]): string[] {
  return commands.flatMap((c, i) => (normalize(native[i]) === normalize(original[i]) ? [] : [`> ${c}\n  native:   ${native[i].join(' / ')}\n  original: ${original[i].join(' / ')}`]));
}

const slice = (name: string, commands: string[]) =>
  sliceRun({ name, story: 'zork3', prefix: TO_PARAPET, seed: SEED, world: endgameWorld, build: buildParapet, commands, expect: 'The dungeon master follows you.' });

describe('Zork III slices against the story file', () => {
  it('the endgame: the dial and the button, the master’s orders, and following you to the cell door', async () => {
    const commands = [
      'score',
      'examine dial',
      'turn dial',
      'turn dial to 9',
      'turn dial to 0',
      'turn dial to 4',
      'push button',
      'look',
      'examine parapet',
      'dungeon master, turn dial to 1',
      'examine dial',
      'dungeon master, turn dial to 9',
      'dungeon master, turn dial',
      'dungeon master, turn dial to 4',
      'dungeon master, push button',
      'examine dungeon master',
      'take dungeon master',
      'give torch to dungeon master',
      'dungeon master, take dial',
      'dungeon master, examine dial',
      'dungeon master, go south',
      's',
      'dungeon master, go south',
      'open door',
      's',
      'look',
      'examine dungeon master',
      'n',
      'n',
      'score',
    ];
    const { native, original } = await slice('endgame', commands);
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);

  it('the endgame won: the master stays at the dial, turns your cell out of the slot, and the bronze door', async () => {
    const commands = [
      'turn dial to 4',
      'push button',
      'dungeon master, stay',
      's',
      'dungeon master, follow me',
      'open door',
      's',
      'examine parapet',
      'examine dungeon master',
      'dungeon master, turn dial to 8',
      'dungeon master, push button',
      'look',
      'n',
      'dungeon master, push button',
      'examine dungeon master',
      'open door',
      'unlock bronze door with key',
      'open bronze door',
      's',
    ];
    const { native, original } = await slice('endgame won', commands);
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);

  it('the endgame lost: the cell door closed and opened, and the master turns your cell out of the slot into a prison', async () => {
    const commands = [
      'dungeon master, stay',
      's',
      'open door',
      's',
      'close door',
      'look',
      'close door',
      'open door',
      'open door',
      'look',
      'dungeon master, turn dial to 2',
      'dungeon master, push button',
      'look',
      'out',
      'open door',
      'dungeon master, push button',
      'examine dungeon master',
      'score',
    ];
    const { native, original } = await slice('endgame lost', commands);
    expect(mismatches(commands, native, original)).toEqual([]);
  }, 60_000);
});
