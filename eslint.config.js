import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'test-results', 'playwright-report'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['src/**/*.{ts,tsx}'],
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
            // This project doesn't opt into the React Compiler; these two
            // rules only make sense with it enabled and otherwise just flag
            // ordinary manual useMemo/useCallback usage as errors.
            'react-hooks/preserve-manual-memoization': 'off',
            'react-hooks/component-memo': 'off',
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true },
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
    {
        // Playwright test/config files: plain TS rules only. The
        // react-hooks plugin misreads Playwright's `use` fixture parameter
        // as the React `use()` hook, so it's not applied here.
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['e2e/**/*.ts', 'playwright*.config.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
);
