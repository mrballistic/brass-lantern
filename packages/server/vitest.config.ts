import { defineConfig } from 'vitest/config';

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
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
