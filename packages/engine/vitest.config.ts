import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The engine needs no DOM. A file that does says so with a
    // `// @vitest-environment happy-dom` comment.
    environment: 'node',
    globals: true,
    // Every test runs with the scripts' state freeze on, as the app does in development.
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/worlds/**', 'src/zmachine/vendor/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
