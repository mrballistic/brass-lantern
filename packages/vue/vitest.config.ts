import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { coverageThresholds, resolveSources } from '../../vite.shared.ts';

export default defineConfig({
  plugins: [vue()],
  // The engine from its source, not dist/ (see vite.shared.ts).
  ...resolveSources,
  test: {
    // Files that need a DOM say so with a `// @vitest-environment happy-dom`
    // comment: creating happy-dom for every file was most of the run.
    environment: 'node',
    globals: true,
    // Every test runs with the scripts' state freeze on, as the app does in development.
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.d.ts'],
      thresholds: coverageThresholds,
    },
  },
});
