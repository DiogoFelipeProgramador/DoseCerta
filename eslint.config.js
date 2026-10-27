// ESLint (flat config): Expo's rules for React Native + TypeScript, with formatting left to Prettier
const { defineConfig } = require('eslint/config');
const globals = require('globals');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/*', 'dist/*', '.expo/*', 'supabase/functions/*'],
  },
  {
    rules: {
      // HTML entities (&quot;) are not rendered by React Native's <Text>, so quotes stay as they are
      'react/no-unescaped-entities': 'off',
      // React Compiler rules: kept visible as warnings (technical debt), they don't break the build
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    // Build scripts run in Node, not in the app
    files: ['scripts/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['__tests__/**/*.ts'],
    languageOptions: { globals: globals.jest },
  },
]);
