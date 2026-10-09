import { defineConfig } from 'vitepress';
import pkg from '../../package.json' with { type: 'json' };

const repo = 'https://github.com/mrballistic/brass-lantern';
/** The published site, for absolute share-card URLs (Open Graph needs them absolute). */
const site = 'https://mrballistic.github.io/brass-lantern';
const ogImage = `${site}/og-image.png`;
const ogAlt = 'BRASS LANTERN: a text adventure engine on npm, amber CRT type on black.';

export default defineConfig({
  title: 'Brass Lantern',
  description: 'An npm library for classic parser text adventures in a CRT terminal: write your own worlds, or play Z-machine story files like Zork.',
  // GitHub Pages project site. Change if you host the docs at a domain root.
  base: '/brass-lantern/',
  cleanUrls: true,
  // Design notes and implementation plans live beside the docs but aren't part of the site.
  srcExclude: ['superpowers/**'],
  lastUpdated: true,
  // A page that includes a whole example file shouldn’t show the `#region` markers its excerpts use.
  markdown: { snippet: { stripRegionMarkers: 'all' } },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/brass-lantern/favicon.svg' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=VT323&display=swap' }],
    // Share cards. Per-page title, description and URL come from transformHead below.
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Brass Lantern' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:image', content: ogImage }],
    ['meta', { property: 'og:image:type', content: 'image/png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: ogAlt }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: ogImage }],
    ['meta', { name: 'twitter:image:alt', content: ogAlt }],
  ],
  // Each page shares as itself: its own title, description and address.
  transformHead({ pageData, title, description }) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const url = `${site}/${path}`;
    return [
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['link', { rel: 'canonical', href: url }],
    ];
  },
  themeConfig: {
    // The owner's lantern mark (currentColor, so it follows the theme).
    logo: '/brand/lantern-mark-amber.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Library', link: '/guide/using-the-library' },
      { text: 'Build a world', link: '/guide/building-worlds/' },
      { text: 'Story files', link: '/guide/z-machine' },
      { text: 'Reference', link: '/reference/world-schema' },
      { text: 'Play the demo', link: 'https://mrballistic.github.io/brass-lantern/demo/', target: '_self' },
      { text: `v${pkg.version}`, link: `${repo}/blob/main/CHANGELOG.md` },
    ],
    sidebar: [
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
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    search: { provider: 'local' },
    footer: { message: `Brass Lantern v${pkg.version} · Released under the MIT License.`, copyright: 'Copyright © 2026 Todd Greco' },
  },
});
