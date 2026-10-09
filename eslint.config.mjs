// Catches typos and leftover names (an undefined variable once blanked the
// Live tab). Run with `npm run lint`; `npm test` runs it first.
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', '.firebase/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
];
