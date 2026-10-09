import type { World } from '@brass-lantern/engine';

/** Recipe: topics and orders. See docs/guide/building-worlds/recipes.md. */
export const topics: World = {
  startRoom: 'library',
  rooms: {
    library: {
      name: 'Library',
      description: 'Tall shelves, a reading lamp, and a locked door marked ARCHIVE.',
      exits: { north: { to: 'archive', door: 'archive_door' } },
      items: [],
      npcs: ['librarian'],
      onEnter: [],
      scenery: ['archive_door'],
    },
    archive: {
      name: 'Archive',
      description: 'Boxes of old letters. You found it.',
      exits: { south: { to: 'library', door: 'archive_door' } },
      items: [],
      npcs: [],
      onEnter: [{ if: 'in:archive', then: 'found_it' }],
      scenery: ['archive_door'],
    },
  },
  items: {
    archive_door: {
      name: 'archive door',
      aliases: ['door'],
      description: 'A heavy door marked ARCHIVE.',
      portable: false,
      tags: [],
      door: true,
      container: { openable: true, locked: true, key: 'brass_key' },
    },
    brass_key: { name: 'brass key', aliases: ['key'], description: 'Small and brass.', portable: true, tags: [] },
  },
  // #region librarian
  npcs: {
    librarian: {
      name: 'librarian',
      description: 'The librarian peers at you over her glasses.',
      topics: {
        books: '“Shelved by color. Don’t ask.”',
        archive: [
          { if: 'has:brass_key', text: '“You have the key. Go on, then.”' },
          { text: 'lend_key' },
        ],
        dragons: '“Second floor, between the cookbooks and the tax law.”',
        // ASK LIBRARIAN ABOUT ME (or MYSELF).
        me: '“You look like someone with an overdue book.”',
      },
      topicAliases: { archive: ['the archive', 'archives', 'old letters', 'key'], books: ['book', 'shelves'] },
      noTopic: '“I couldn’t say, dear.”',
      refuseOrder: '“Shh.”',
    },
  },
  events: {
    // A topic entry can name an event: asking about the archive lends you the key.
    lend_key: ['“Oh, the archive.” She slides a brass key across the desk.', { move: 'brass_key', to: 'player' }],
    found_it: ['✨ The letters are all here.', { end: 'found' }],
  },
  // #endregion librarian
  endings: { found: { lines: ['You found what you came for.'] } },
  dialogue: { librarian: { default: '“Can I help you find something?”' } },
  flagLabels: {},
};
