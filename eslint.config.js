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
);
