import type { World } from '../../types/world.ts';

/** Recipe: dark rooms, a lamp, and a death that isn't the end. See docs/guide/building-worlds/recipes.md. */
export const darkness: World = {
  startRoom: 'shed',
  rooms: {
    shed: {
      name: 'Shed',
      description: 'A garden shed. A hatch in the floor leads down.',
      exits: { down: 'cellar' },
      items: ['lamp'],
      npcs: [],
      onEnter: [],
    },
    // #region cellar
    cellar: {
      name: 'Cellar',
      description: 'Damp stone walls. Steps lead up.',
      dark: true,
      exits: { up: 'shed' },
      items: ['jam'],
      npcs: [],
      onEnter: [],
    },
    // #endregion cellar
  },
  items: {
    // #region lamp
    lamp: { name: 'oil lamp', aliases: ['lamp'], description: 'A brass oil lamp.', portable: true, tags: [], switchable: true, light: true },
    // #endregion lamp
    jam: { name: 'jar of jam', aliases: ['jam', 'jar'], description: 'Damson, 1987.', portable: true, tags: [] },
  },
  // #region darkness
  darkness: {
    look: 'It is pitch black. Something breathes nearby.',
    // A direction with no exit, in the dark: Zork's grue, minus the 20% you live.
    blunder: [{ die: 'You stumble into something with far too many teeth.' }],
  },
  death: {
    message: ['    ****  You have died  ****'],
    lives: 1,
    respawn: 'shed',
    resurrection: ['You wake on the shed floor with a headache and a new respect for the dark.'],
    final: ['That was your last chance. The cellar keeps you.'],
  },
  // #endregion darkness
  npcs: {},
  dialogue: {},
  events: {},
  flagLabels: {},
};
