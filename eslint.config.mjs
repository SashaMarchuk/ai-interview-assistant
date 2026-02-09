// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import autoImports from './.wxt/eslint-auto-imports.mjs';

export default defineConfig(
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'public/**', '.planning/**', 'scripts/**'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  autoImports,
  reactHooks.configs.flat.recommended,
  eslintConfigPrettier,
);
