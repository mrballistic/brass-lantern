import { defineConfig } from 'vitest/config';

// `npx vitest` at the root runs every workspace's tests, each with its own
// config. The untracked tests/zz probes are deliberately not a project.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/zz/**'],
  },
});
