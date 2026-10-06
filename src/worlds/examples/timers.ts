import type { World } from '@/types/world';

/** Recipe: fuses, daemons and ambient lines. See docs/guide/building-worlds/recipes.md. */
export const timers: World = {
  startRoom: 'kitchen',
  rooms: {
    kitchen: {
      name: 'Kitchen',
      description: 'A small kitchen with a kettle on the stove.',
      exits: {},
      items: ['kettle'],
      npcs: [],
      onEnter: [],
    },
  },
  // #region kettle
  items: {
    kettle: {
      name: 'kettle',
      description: 'A whistling kettle.',
      portable: false,
      tags: [],
      switchable: true,
      // Turning it on lights a three-turn fuse; turning it off puts it out.
      after: { turn_on: [{ then: 'heat' }], turn_off: [{ then: 'cool' }] },
    },
  },
  events: {
    heat: [{ schedule: 'boil', in: 3 }],
    cool: [{ cancel: 'boil' }],
    boil: ['The kettle shrieks. Tea time.', { switch: 'kettle', on: false }, { set: 'boiled' }],
    chime: ['The clock chimes the hour.'],
  },
  // #endregion kettle
  // #region clock
  vars: { minutes: 0 },
  daemons: [
    // Every turn is a minute; on the fifth, the clock chimes.
    { if: 'var:minutes>=0', then: [{ add: 'minutes', by: 1 }] },
    { if: 'var:minutes=5', then: 'chime' },
  ],
  ambient: [{ if: '!flag:boiled', every: 2, lines: ['The tap drips.', 'The tap drips again.'] }],
  // #endregion clock
  npcs: {},
  dialogue: {},
  flagLabels: {},
};
