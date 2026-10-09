import type { World } from '../../types/world.ts';

/** Recipe: a script, for what data alone can't say. See docs/guide/building-worlds/recipes.md. */
export const fortune: World = {
  startRoom: 'tent',
  seed: 3,
  rooms: {
    tent: {
      name: 'Fortune Teller’s Tent',
      description: 'Velvet, incense, and a crystal ball.',
      exits: {},
      items: [],
      npcs: ['madame'],
      onEnter: [],
    },
  },
  items: {},
  npcs: {
    madame: {
      name: 'Madame Zora',
      article: '',
      description: 'Madame Zora peers at you over the crystal ball.',
      instead: { consult: [{ then: 'reading' }] },
    },
  },
  // #region script
  verbs: { consult: { words: ['consult'], target: 'required' } },
  events: { reading: [{ script: 'fortune' }] },
  vars: { fortune: 0 },
  scripts: {
    // Picks one of three fortunes the first time, then sticks to it.
    fortune: (ctx) => {
      const told = ctx.state.vars?.fortune ?? 0;
      const pick = told || ctx.roll(3);
      const text = ['“A stranger will bring you soup.”', '“Beware of geese.”', '“You will find what you lost under the sofa.”'][pick - 1];
      return told ? ['“I have told you already,” she sighs.', text] : [{ setVar: 'fortune', to: pick }, text];
    },
  },
  // #endregion script
  dialogue: {},
  flagLabels: {},
};
