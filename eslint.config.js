// ESLint 9 flat config for ModCon HR.
//
// package.json has always shipped a `lint` script, but the toolchain it needs
// was missing from devDependencies, so `npm run lint` failed outright with
// "sh: eslint: command not found". This restores it: typescript-eslint for the
// TS rules plus the two React plugins the app already assumes exist (there is
// a `react-hooks/exhaustive-deps` disable comment in src/lib/useFirestore.ts).
//
// Deliberately NOT adding Prettier — it would reformat the whole tree and bury
// real changes under whitespace noise.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    // Build output and generated/vendored files are not ours to lint.
    ignores: ['dist', 'node_modules', 'vite.config.js', 'vite.config.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
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
      // Dead code is a real signal here — several pages carry unused imports —
      // but an underscore prefix is the intentional "ignore me" marker.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Config files run in Node, not the browser.
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
