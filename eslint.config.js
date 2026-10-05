import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  {
    // server/ is its own package with its own lint run.
    ignores: ['dist/**', 'coverage/**', 'server/**', 'node_modules/**', 'docs/.vitepress/cache/**', 'docs/.vitepress/dist/**', 'src/zmachine/vendor/**'],
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
      // __APP_VERSION__ is injected by vite.config.ts (see src/env.d.ts).
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
    },
  },
);
