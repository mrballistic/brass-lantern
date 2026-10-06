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

/** From the Round Room into the coal mine's Slide Room: Mirror Room 2, rub the mirror, the Cold Passage (5c). */
export const MINE_PREFIX = ['south', 'south', 'rub mirror', 'north', 'west'];

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

/** BOAT_ROUTE, then the boat inflated and boarded at Dam Base with nothing sharp, and only the lamp to lose. */
const ABOARD = ['drop sword', ...BOAT_ROUTE, 'drop tube', 'inflate plastic with pump', 'board boat'];

export const RIVER_SESSIONS: Record<string, string[]> = {
  downriver: [...ABOARD, 'drop pump', 'launch', 'look', ...waits(8)],
  landings: [...ABOARD, 'launch', 'east', 'land', 'look', 'launch', 'wait', 'land', 'west', 'up', 'look'],
  stream: [
    'drop sword', ...BOAT_ROUTE, 'drop tube', 'take plastic', 'up', 'west', 'west', 'drop plastic', 'inflate plastic with pump',
    'board boat', 'launch', 'look', 'up', 'west', 'east', 'look', 'disembark', 'look',
  ],
  'wrong-launch': ['drop sword', ...BOAT_ROUTE, 'inflate plastic with pump', 'launch', 'board boat', 'up', 'launch', 'launch'],
};

// The current: River 1 to 2 in three turns of the clock, then 4, 3, 2 and 1. After 'look' on
// River 2 you're on River 3; a WAIT there reaches River 4; another, River 5.
const TO_RIVER_3 = [...ABOARD, 'launch', 'wait', 'wait', 'look'];
const TO_RIVER_4 = [...TO_RIVER_3, 'wait'];

export const BANK_SESSIONS: Record<string, string[]> = {
  cliffs: [...TO_RIVER_3, 'land', 'look', 'south', 'disembark', 'south', 'north', 'west', 'east', 'take boat', 'south', 'drop boat', 'south', 'north'],
  dig: [
    ...TO_RIVER_4, 'east', 'disembark', 'look', 'take shovel', 'northeast', 'look', 'dig sand with pump',
    'dig in sand with shovel', 'dig in sand with shovel', 'dig in sand with shovel', 'dig in sand with shovel', 'look', 'take scarab', 'score',
  ],
  collapse: [...TO_RIVER_4, 'east', 'disembark', 'drop pump', 'take shovel', 'northeast', ...Array<string>(5).fill('dig in sand with shovel')],
  buoy: [...TO_RIVER_4, 'take buoy', 'east', 'examine buoy', 'open buoy', 'take emerald', 'score'],
  shore: [...TO_RIVER_4, 'wait', 'land', 'disembark', 'look', 'north', 'look', 'south'],
};

/** The sceptre from the Egyptian Room, back up through the altar's hole, then the boat down the river to the Shore. */
const TO_FALLS = [
  'drop sword', 'southeast', 'east', 'tie rope to railing', 'down', 'south', 'east', 'open coffin', 'take sceptre', 'west', 'south',
  'down', 'north', 'north', 'north', ...BOAT_ROUTE.slice(1), 'drop tube', 'inflate plastic with pump', 'put sceptre in boat',
  'board boat', 'launch', 'wait', 'wait', 'look', 'wait', 'wait', 'land', 'take sceptre', 'disembark', 'south',
];

export const RAINBOW_SESSIONS: Record<string, string[]> = {
  rainbow: [
    ...TO_FALLS, 'look', 'west', 'cross rainbow', 'look under rainbow', 'wave sceptre', 'look', 'west', 'look', 'west', 'look', 'take pot',
    'cross rainbow', 'cross rainbow', 'east', 'drop pot', 'west', 'wave sceptre', 'look', 'east', 'southwest', 'look', 'up', 'look',
    'up', 'look', 'cross rainbow', 'northwest', 'look', 'score',
  ],
  'jump-falls': [...TO_FALLS, 'drop sceptre', 'drop pump', 'jump'],
  'rainbow-death': [...TO_FALLS, 'wave sceptre', 'west', 'drop pump', 'wave sceptre'],
};

export const GRUE_SESSIONS: Record<string, string[]> = {
  // Unlit, from the dark Round Room into the dark North-South Passage: Zork's GOTO grue (PROB 80).
  grue: ['drop sword', 'drop rope', 'drop bottle', 'turn off lamp', 'drop lamp', 'north'],
};

export const MINE_SESSIONS: Record<string, string[]> = {
  slide: [...MINE_PREFIX, 'look', 'put rope in slide', 'put slide in slide', 'climb down slide', 'look', 'take rope', 'climb up slide'],
  'upper-rooms': [...MINE_PREFIX, 'north', 'look', 'west', 'look', 'east', 'south'],
  garlic: ['@prefix:garlic', ...MINE_PREFIX, 'north', 'west', 'north', 'look', 'take bat', 'kill bat', 'talk to bat', 'take jade', 'east', 'look', 'take basket', 'take chain', 'examine chain'],
};

/** From the Slide Room past the bat (with the garlic) down to the Gas Room. */
const TO_GAS = ['north', 'west', 'north', 'east', 'north', 'down'];
/** The lit torch from the Torch Room, then out by the temple, the Tiny Cave and the mirror, into the Slide Room. */
const TORCH_TO_MINE = ['southeast', 'east', 'tie rope to railing', 'down', 'take torch', 'south', 'south', 'down', 'north', 'rub mirror', 'north', 'west'];

export const GAS_SESSIONS: Record<string, string[]> = {
  'gas-safe': [
    '@prefix:garlic', 'drop sword', ...MINE_PREFIX, ...TO_GAS, 'look', 'take bracelet', 'smell gas', 'smell bracelet', 'east', 'look', 'northeast', 'southeast', 'southwest',
    'down', 'look', 'climb down ladder', 'look', 'south', 'take coal', 'look', 'north', 'up', 'up',
  ],
  'gas-arrive': ['@prefix:garlic', 'drop sword', ...TORCH_TO_MINE, ...TO_GAS],
  'gas-light': ['@prefix:garlic', 'drop sword', ...MATCHES, ...MINE_PREFIX, ...TO_GAS, 'light match'],
  maze: [
    '@prefix:garlic', ...MINE_PREFIX, ...TO_GAS, 'east', 'east', 'northeast', 'north', 'southeast', 'south', 'southwest', 'west', 'north', 'east',
    'south', 'north', 'look',
  ],
  'bat-flight': [...MINE_PREFIX, 'north', 'west', 'north', 'look'],
};
