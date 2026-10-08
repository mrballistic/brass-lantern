import { defineConfig } from 'vitest/config';
import { coverageThresholds } from '../../vite.shared.ts';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index.ts is the site's own server process (env, listen, shutdown), not the library.
      exclude: ['src/**/*.test.ts', 'src/test-setup.ts', 'src/index.ts'],
      thresholds: coverageThresholds,
    },
  },
});
