import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [vue()],
  // Shown in the terminal header, so the screen matches the release tag.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // The site's env files (VITE_GA_MEASUREMENT_ID) live at the repo root.
  envDir: '../..',
  test: {
    environment: 'node',
    globals: true,
    // Every test runs with the scripts' state freeze on, as the site does in development.
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main.ts', 'src/**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
