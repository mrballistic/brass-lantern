import { defineConfig } from 'vitest/config';
import { coverageThresholds, resolveSources } from '../../vite.shared.ts';

export default defineConfig({
  // The engine from its source, not dist/ (see vite.shared.ts).
  ...resolveSources,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // cli.ts only connects the server to stdio; the smoke test runs it.
      exclude: ['src/cli.ts'],
      thresholds: coverageThresholds,
    },
  },
});
