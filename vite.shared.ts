import { defaultClientConditions, defaultServerConditions, type UserConfig } from 'vite';

/**
 * In the repo, `@brass-lantern/*` imports resolve to the packages' sources
 * through this export condition, so tests, the dev server and the site build
 * need no package build first. Published, the condition is never set and the
 * same imports resolve to dist/ (which scripts/consumer-smoke.mjs checks).
 * tsconfig.base.json sets it for TypeScript (customConditions).
 */
export const SOURCE_CONDITION = '@brass-lantern/source';

/** Every workspace's coverage floor (CI fails below it). */
export const coverageThresholds = { lines: 80, functions: 80, statements: 80, branches: 75 };

export const resolveSources: Pick<UserConfig, 'resolve' | 'ssr'> = {
  resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
  ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
};
