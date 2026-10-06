// The scripted sessions: command lists run from the Round Room (after PREFIX) in both versions.

const waits = (n: number) => Array<string>(n).fill('wait');
const TO_DAM = ['north', 'northeast', 'east'];

export const DAM_SESSIONS: Record<string, string[]> = {
  dam: [
    ...TO_DAM, 'look', 'examine bubble', 'take bolt', 'north', 'take matchbook', 'north', 'take wrench', 'take screwdriver',
    'south', 'south', 'turn bolt with wrench', 'turn bolt with screwdriver', 'north', 'north', 'push yellow button',
    'south', 'south', 'look', 'turn bolt with wrench', 'look', ...waits(8), 'look', 'west', 'drop sword', 'drop wrench',
    'drop screwdriver', 'look', 'north', 'look', 'take trunk', 'north', 'look', 'south', 'south', 'southeast', 'look', 'score',
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
  echo: ['east', 'hello there', 'bug', 'take bar', 'echo', 'look', 'take bar', 'east', 'look', 'west', 'west', 'score'],
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
    'take rope', 'down', 'look', 'examine pedestal', 'take torch', 'examine torch', 'turn off torch', 'up', 'score',
  ],
  untie: ['southeast', 'east', 'tie rope to railing', 'untie rope', 'untie rope', 'take rope', 'drop rope', 'look', 'down'],
  leap: ['southeast', 'east', 'drop sword', 'drop rope', 'drop bottle', 'jump'],
  atlantis: [
    ...OPEN_GATES, 'drop sword', ...waits(4), 'west', 'north', 'north', 'look', 'north', 'look', 'take trident', 'up', 'look', 'north',
    'look', 'west', 'look', 'east', 'north', 'north', 'look', 'south', 'south', 'score',
  ],
  passages: ['drop sword', 'south', 'south', 'west', 'look', 'north', 'east', 'look', 'west', 'north', 'north'],
};

/** From the Round Room to the Temple, tying the rope on the way down. */
const TO_TEMPLE = ['southeast', 'east', 'tie rope to railing', 'down', 'south'];
/** The matchbook from the Dam Lobby, back to the Round Room. */
const MATCHES = [...TO_DAM, 'north', 'take matchbook', 'south', 'south', 'southwest', 'south'];
/** Bell, candles and book, then down the hole to Hades. */
const TO_HADES = ['take bell', 'south', 'take candles', 'take book', 'down', 'down'];

export const TEMPLE_SESSIONS: Record<string, string[]> = {
  exorcism: [
    'drop sword', ...MATCHES, ...TO_TEMPLE, 'look', 'read prayer', ...TO_HADES, 'look', 'south', 'ring bell', 'take candles',
    'light match', 'light candles with match', 'read book', 'south', 'look', 'take skull', 'north', 'ring bell', 'score',
  ],
  // No candles: the tiny cave's gust is random on each side.
  'read-first': ['drop sword', ...TO_TEMPLE, 'take bell', 'south', 'take book', 'down', 'down', 'read book', 'ring bell', 'read book', 'take bell', 'ring bell'],
  // The sword stays: it glows here, with the spirits so close.
  tension: [...TO_TEMPLE, 'take bell', 'south', 'take book', 'down', 'look', 'down', 'ring bell', ...waits(3), 'look'],
  'hot-bell': [
    'drop sword', ...TO_DAM, 'north', 'take guidebook', 'south', 'south', 'southwest', 'south', ...TO_TEMPLE, 'take bell',
    'south', 'down', 'down', 'open bottle', 'ring bell', 'take bell', 'ring bell', 'rub bell', 'rub bell with guidebook',
    'pour water on bell', 'take bell',
  ],
  candles: ['drop sword', ...TO_TEMPLE, 'south', 'examine candles', 'take candles', 'count candles', 'turn off candles', 'turn off candles', 'light candles', ...waits(30), 'examine candles', 'light candles'],
  coffin: [
    'drop sword', 'drop bottle', ...TO_TEMPLE, 'east', 'look', 'open coffin', 'take sceptre', 'take coffin', 'west', 'south',
    'look', 'down', 'pray', 'look', 'score',
  ],
  ghost: [
    'drop sword', 'drop bottle', 'southeast', 'east', 'tie rope to railing', 'down', 'take torch', 'south', 'south',
    'burn book with torch', 'look', 'wait', 'score', 'diagnose', 'inventory', 'up', 'north', 'north', 'north', 'southeast',
    'east', 'south', 'take bell', 'open bell', 'pray', 'south', 'turn on candles', 'pray', 'look',
  ],
};

/**
 * From the Round Room to Dam Base with the pump and the putty: the reservoir drained for the pump at
 * Reservoir North. The rope and bottle stay behind (the original's player is still wounded from its
 * troll fight, so carries less).
 */
const BOAT_ROUTE = [
  'drop rope', 'drop bottle', 'north', 'northeast', 'east', 'north', 'north', 'take wrench', 'take tube', 'push yellow button',
  'south', 'south', 'turn bolt with wrench', 'drop wrench', ...waits(4), 'west', 'north', 'north', 'take pump', 'south', 'south',
  'east', 'down',
];

export const BOAT_SESSIONS: Record<string, string[]> = {
  inflate: [
    'drop sword', ...BOAT_ROUTE, 'look', 'inflate plastic with lungs', 'blow in plastic', 'inflate plastic with tube',
    'inflate plastic with pump', 'look', 'inflate boat with pump', 'read label', 'deflate boat', 'pump up plastic', 'deflate boat',
    'inflate plastic with pump',
  ],
  board: [
    'drop sword', ...BOAT_ROUTE, 'inflate plastic with pump', 'board boat', 'board boat', 'look', 'north', 'take boat', 'drop pump',
    'look', 'disembark', 'disembark', 'launch',
  ],
  puncture: [
    ...BOAT_ROUTE, 'open tube', 'squeeze tube', 'inflate plastic with pump', 'board boat', 'look', 'inflate boat with pump',
    'put gunk on boat', 'inflate plastic with pump', 'put sword in boat', 'board boat', 'take sword', 'drop sword', 'look',
    'board boat', 'drop sword', 'look',
  ],
};
