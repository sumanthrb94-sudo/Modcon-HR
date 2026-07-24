import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// `npm run lint` (eslint .) previously failed outright: eslint wasn't listed
// in devDependencies and no config existed anywhere in the repo. This is a
// standard flat config for a Vite + React + TypeScript project — run
// `npm install` after pulling this change to pick up the new devDependencies.
export default tseslint.config(
  { ignores: ['dist', 'graphify-out', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // The existing codebase intentionally uses a couple of `any` escapes
      // (documented inline) for cases TS can't unify cleanly — warn rather
      // than hard-fail on those instead of blocking the build outright.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
);
