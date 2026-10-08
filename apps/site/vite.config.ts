import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolveSources } from '../../vite.shared.ts';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // A subpath when hosted under one (e.g. GitHub Pages: VITE_BASE=/repo/demo/).
  base: process.env.VITE_BASE ?? '/',
  plugins: [vue()],
  // The packages from their sources, not dist/ (see vite.shared.ts).
  ...resolveSources,
  // Shown in the terminal header, so the screen matches the release tag.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // The site's env files (VITE_GA_MEASUREMENT_ID) live at the repo root.
  envDir: '../..',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
