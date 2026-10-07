import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [vue()],
  // Shown in the terminal header, so the screen matches the release tag.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    // Most tests (the whole engine) need no DOM. Files that do say so with a
    // `// @vitest-environment happy-dom` comment: creating happy-dom for every
    // file was three quarters of the run.
    environment: 'node',
    globals: true,
    // Every test runs with the scripts' state freeze on, as the app does in development.
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'cdk', 'lambda'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/main.ts',
        'src/env.d.ts',
        'src/**/*.d.ts',
        'src/worlds/**',
        'src/zmachine/vendor/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
