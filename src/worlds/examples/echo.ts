import type { World } from '@/types/world';

/** Recipe: a room that listens. See docs/guide/building-worlds/recipes.md. */
export const echo: World = {
  startRoom: 'ledge',
  style: 'infocom',
  rooms: {
    ledge: {
      name: 'Ledge',
      description: 'A narrow ledge outside a cave. The cave mouth is in.',
      exits: { in: 'cave' },
      items: [],
      npcs: [],
      onEnter: [],
    },
    // #region cave
    cave: {
      name: 'Echoing Cave',
      description: 'A vast cave. Every sound comes back to you, louder. The way out is out.',
      descriptions: [{ if: 'flag:quiet', text: 'A vast cave, quiet now. The way out is out.' }],
      exits: { out: 'ledge' },
      items: [],
      npcs: [],
      onEnter: [],
      // Until it's quiet, whatever you say is heard as noise.
      capture: { if: '!flag:quiet', script: 'echo' },
    },
    // #endregion cave
  },
  items: {},
  npcs: {},
  // #region script
  scripts: {
    echo: (ctx) => {
      // Captures also see commands that arrive already parsed (AGAIN); this one only hears raw words.
      if (ctx.line === undefined) return;
      const words = ctx.line.toLowerCase().trim().split(/\s+/);
      // Declining (returning nothing) lets the line be parsed as usual: OUT still works.
      if (words[0] === 'out') return;
      if (words[0] === 'echo') return [{ set: 'quiet' }, 'The cave falls silent.', { free: true }];
      const last = words[words.length - 1];
      return [`${last} ${last} ...`, { free: true }];
    },
  },
  // #endregion script
  events: {},
  dialogue: {},
  flagLabels: {},
};
