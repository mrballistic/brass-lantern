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
      // cli.ts only connects the server to stdio; the smoke test runs it. worker.ts runs in a
      // worker thread, where V8 coverage doesn't reach (tests/job.test.ts covers what it calls).
      exclude: ['src/cli.ts', 'src/worker.ts'],
      thresholds: coverageThresholds,
    },
  },
});
