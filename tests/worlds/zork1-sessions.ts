// The scripted sessions: command lists run from the Round Room (after PREFIX) in both versions.

const waits = (n: number) => Array<string>(n).fill('wait');
const TO_DAM = ['north', 'northeast', 'east'];

export const DAM_SESSIONS: Record<string, string[]> = {
  dam: [
    ...TO_DAM, 'look', 'examine bubble', 'take bolt', 'north', 'take matchbook', 'north', 'take wrench', 'take screwdriver',
    'south', 'south', 'turn bolt with wrench', 'turn bolt with screwdriver', 'north', 'north', 'push yellow button',
    'south', 'south', 'look', 'turn bolt with wrench', 'look', ...waits(8), 'look', 'west', 'drop sword', 'drop wrench',
    'drop screwdriver', 'look', 'north', 'look', 'take trunk', 'north', 'look', 'south', 'south', 'southeast', 'look',
  ],
  leak: [
    ...TO_DAM, 'north', 'north', 'examine tube', 'read tube', 'squeeze tube', 'open tube', 'examine chests', 'push red button',
    'push red button', 'push blue button', 'plug leak with screwdriver', 'push blue button', 'wait', 'squeeze tube',
    'plug leak with gunk', 'wait', 'look', 'put gunk in leak', 'put gunk on leak', 'take chests', 'look',
  ],
  // Deaths scatter what you carry at random, so these drop it first.
  flood: [...TO_DAM, 'north', 'north', 'drop sword', 'drop rope', 'drop bottle', 'push blue button', ...waits(12), 'look'],
  refill: [
    ...TO_DAM, 'north', 'north', 'take wrench', 'push yellow button', 'south', 'south', 'turn bolt with wrench', ...waits(8),
    'turn bolt with wrench', 'west', 'drop sword', 'drop rope', 'drop bottle', 'drop wrench', 'north', 'look', ...waits(4),
  ],
  water: [
    ...TO_DAM, 'north', 'take matchbook', 'count matches', 'read matchbook', 'light match', 'examine match', 'wait', 'wait',
    'light match', 'turn off match', 'count matches', 'south', 'west', 'open bottle', 'pour water', 'examine bottle',
    'fill bottle', 'examine bottle', 'take water', 'close bottle', 'pour water', 'west', 'fill bottle', 'look',
  ],
};


const OPEN_GATES = [...TO_DAM, 'north', 'north', 'push yellow button', 'take wrench', 'south', 'south', 'turn bolt with wrench'];

export const LOUD_SESSIONS: Record<string, string[]> = {
  echo: ['east', 'hello there', 'bug', 'take bar', 'echo', 'look', 'take bar', 'east', 'look', 'west', 'west'],
  thrown: [...OPEN_GATES, 'south', 'down', 'look'],
  quiet: [...OPEN_GATES, 'drop sword', ...waits(4), 'turn bolt with wrench', 'south', 'down', 'look', 'take bar', ...waits(4), 'look'],
};

export const DOME_SESSIONS: Record<string, string[]> = {
  // The sword glows near Hades's spirits (stage 5a's temple task); these sessions leave it behind.
  mirror: [
    'drop sword', 'south', 'look', 'south', 'look', 'examine mirror', 'take mirror', 'drop rope', 'rub mirror', 'look', 'north', 'look',
    'south', 'rub mirror', 'look', 'east', 'look', 'west', 'west', 'look', 'north', 'look',
  ],
  'mirror-break': ['south', 'south', 'rub mirror with sword', 'break mirror with sword', 'look', 'break mirror with sword', 'examine mirror'],
  dome: [
    'southeast', 'look', 'read engravings', 'east', 'look', 'down', 'tie rope to railing', 'tie rope to railing', 'look',
    'take rope', 'down', 'look', 'examine pedestal', 'take torch', 'examine torch', 'turn off torch', 'up',
  ],
  untie: ['southeast', 'east', 'tie rope to railing', 'untie rope', 'untie rope', 'take rope', 'drop rope', 'look', 'down'],
  leap: ['southeast', 'east', 'drop sword', 'drop rope', 'drop bottle', 'jump'],
  atlantis: [
    ...OPEN_GATES, 'drop sword', ...waits(4), 'west', 'north', 'north', 'look', 'north', 'look', 'take trident', 'up', 'look', 'north',
    'look', 'west', 'look', 'east', 'north', 'north', 'look', 'south', 'south',
  ],
  passages: ['drop sword', 'south', 'south', 'west', 'look', 'north', 'east', 'look', 'west', 'north', 'north'],
};
