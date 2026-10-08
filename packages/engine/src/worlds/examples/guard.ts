import type { World } from '../../types/world.ts';

/** Recipe: a guard to fight, and something too heavy to carry. See docs/guide/building-worlds/recipes.md. */
export const guard: World = {
  startRoom: 'armory',
  // A fixed seed, so the fight in the recipe's transcript plays the same way every time.
  seed: 1,
  rooms: {
    armory: {
      name: 'Armory',
      description: 'Racks of rusted weapons. An anvil squats in the corner. A gate is north.',
      exits: { north: 'gate' },
      items: ['sword', 'anvil'],
      npcs: [],
      onEnter: [],
    },
    // #region gate
    gate: {
      name: 'Gatehouse',
      description: 'A stone arch. Beyond it, daylight. The armory is south.',
      exits: {
        south: 'armory',
        // The guard bars the way until he's dead or out cold.
        north: { to: 'courtyard', denials: [{ if: 'awake:guard', text: 'The guard steps in front of you.' }] },
      },
      items: [],
      npcs: ['guard'],
      onEnter: [],
    },
    // #endregion gate
    courtyard: {
      name: 'Courtyard',
      description: 'Sunlight, at last.',
      exits: {},
      items: [],
      npcs: [],
      onEnter: [{ if: 'in:courtyard', then: 'escape' }],
    },
  },
  // #region items
  items: {
    sword: { name: 'sword', description: 'Notched, but sharp.', portable: true, tags: [], weapon: true, size: 10 },
    anvil: { name: 'anvil', description: 'Black iron, very heavy.', portable: true, tags: [], size: 60 },
    club: { name: 'club', description: 'A knotted club.', portable: true, tags: [], weapon: true, size: 10 },
  },
  // Nothing heavier than 50 in all.
  carry: { limit: 50 },
  // #endregion items
  // #region guard
  npcs: {
    guard: {
      name: 'guard',
      description: 'A guard with a club blocks the arch.',
      descriptions: [{ if: '!awake:guard', text: 'The guard lies senseless on the flagstones.' }],
      holds: ['club'],
      combat: {
        strength: 2,
        weapon: 'club',
        firstStrike: 50,
        // Without his club, he spends his turns looking for it.
        onBusy: 'guard_gropes',
        onDeath: 'guard_drops_club',
        onUnconscious: 'guard_drops_club',
        messages: {
          missed: ['The guard’s club whistles past your head.'],
          lightWound: ['The club catches your shoulder.'],
          seriousWound: ['The club cracks against your ribs.'],
          stagger: ['The guard shoves you back.'],
          unconscious: ['The club comes down on your head.'],
          killed: ['The guard’s club finds your temple.'],
          loseWeapon: ['The guard knocks the {weapon} from your hand.'],
        },
      },
    },
  },
  combat: { strength: { min: 2, max: 2 } },
  // #endregion guard
  dialogue: { guard: { default: '“Move along.”' } },
  flagLabels: {},
  events: {
    guard_drops_club: [{ move: 'club', to: 'here' }],
    guard_gropes: ['The guard gropes for his club.'],
    escape: ['✨ You walk out into the sun.', { end: 'free' }],
  },
  endings: { free: { lines: ['You’re free.'] } },
};
