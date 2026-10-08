import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  {
    // packages/server has its own eslint.config.js, which ESLint uses for its files.
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'docs/.vitepress/cache/**',
      'docs/.vitepress/dist/**',
      'packages/engine/src/zmachine/vendor/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  vue.configs['no-layout-rules'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    languageOptions: {
      // __APP_VERSION__ is injected by apps/site/vite.config.ts (see apps/site/src/env.d.ts).
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
      // Two configs in the repo (this and packages/server's), so name the root.
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
    },
  },
  // The engine boundary: framework-free, and it runs in Node or a browser
  // (packages/engine/tests/boundary.test.ts checks the same by grep).
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vue', message: 'The engine is framework-free: Vue belongs in @brass-lantern/vue.' },
            { name: 'pinia', message: 'The engine is framework-free: Pinia belongs in @brass-lantern/vue.' },
          ],
          patterns: [
            { group: ['@brass-lantern/vue', '@brass-lantern/vue/*'], message: 'The engine depends on no other package.' },
            { group: ['@brass-lantern/server', '@brass-lantern/server/*'], message: 'The engine depends on no other package.' },
            { group: ['**/apps/**'], message: 'The engine imports nothing from the apps.' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    // localStorageSaveStore is the browser's SaveStore, behind the ./zmachine entry.
    ignores: ['packages/engine/src/zmachine/save-store.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage'].map((name) => ({
          name,
          message: `The engine runs in Node too: no ${name}. Take what you need as an option (see SaveStore).`,
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage'].map((property) => ({
          object: 'globalThis',
          property,
          message: `The engine runs in Node too: no ${property}.`,
        })),
      ],
    },
  },
);
