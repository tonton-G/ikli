import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['**/dist/', '**/node_modules/', 'infra/', 'packer/'] },

  // Both workspaces: TS recommended rules.
  {
    files: ['client/src/**/*.{ts,tsx}', 'server/src/**/*.ts', 'client/vite.config.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      // The DynamoDB store and request handlers lean on `any` at the AWS/Express
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Client: browser globals + React hooks/refresh rules.
  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Server: Node globals.
  {
    files: ['server/src/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
