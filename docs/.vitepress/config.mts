import { defineConfig } from 'vitepress';

const repo = 'https://github.com/mrballistic/brass-lantern';

export default defineConfig({
  title: 'Brass Lantern',
  description: 'A small engine for classic parser text adventures, with a CRT terminal and an optional LLM intent parser.',
  // GitHub Pages project site. Change if you host the docs at a domain root.
  base: '/brass-lantern/',
  cleanUrls: true,
  // Design notes and implementation plans live beside the docs but aren't part of the site.
  srcExclude: ['superpowers/**'],
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/brass-lantern/favicon.svg' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=VT323&display=swap' }],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/world-schema' },
      { text: 'Play the demo', link: 'https://mrballistic.github.io/brass-lantern/demo/', target: '_self' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Your first world', link: '/guide/your-first-world' },
          { text: 'Playing story files', link: '/guide/z-machine' },
          { text: 'How it works', link: '/guide/how-it-works' },
          { text: 'The intent server', link: '/guide/intent-server' },
          { text: 'Testing a world', link: '/guide/testing' },
          { text: 'Deploying', link: '/guide/deploying' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'World schema', link: '/reference/world-schema' },
          { text: 'Conditions and events', link: '/reference/conditions-and-events' },
          { text: 'Player commands', link: '/reference/commands' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    search: { provider: 'local' },
    footer: { message: 'Released under the MIT License.', copyright: 'Copyright © 2026 Todd Greco' },
  },
});
