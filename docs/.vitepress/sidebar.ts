// The site address, sidebar and llms summary, shared by the VitePress config and the MCP docs bundler.
// Plain data: no vitepress import, so scripts can load it.

/** The published site, for absolute share-card URLs (Open Graph needs them absolute). */
export const site = 'https://mrballistic.github.io/brass-lantern';
/** The sidebar, which also orders the pages in llms.txt and llms-full.txt. */
export const sidebar: Array<{ text: string; items: Array<{ text: string; link: string }> }> = [
  {
    text: 'Guide',
    items: [
      { text: 'Getting started', link: '/guide/getting-started' },
      { text: 'Using the library', link: '/guide/using-the-library' },
      { text: 'Playing story files (Zork)', link: '/guide/z-machine' },
      { text: 'Porting Zork', link: '/guide/porting-zork' },
      { text: 'How it works', link: '/guide/how-it-works' },
      { text: 'The intent server', link: '/guide/intent-server' },
      { text: 'Deploying', link: '/guide/deploying' },
    ],
  },
  {
    text: 'Building worlds',
    items: [
      { text: 'Overview', link: '/guide/building-worlds/' },
      { text: 'A two-room game', link: '/guide/building-worlds/two-rooms' },
      { text: 'The demo game: Snack Attack', link: '/guide/your-first-world' },
      { text: 'Recipes', link: '/guide/building-worlds/recipes' },
      { text: 'Testing a world', link: '/guide/testing' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'World schema', link: '/reference/world-schema' },
      { text: 'Conditions and events', link: '/reference/conditions-and-events' },
      { text: 'Player commands', link: '/reference/commands' },
      { text: 'Cartridges and storage', link: '/reference/cartridges' },
    ],
  },
];

export const llmsTitle = 'Brass Lantern';
/** One-line summary for the top of llms.txt. */
export const llmsDescription =
  'An npm library for classic parser text adventures (go north, take lamp) in a CRT terminal. Worlds are data: rooms, items, characters, rules and events in one typed object. It also plays Z-machine story files such as Zork.';
