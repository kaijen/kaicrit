// Flat ESLint config. Lean setup: the typescript-eslint *recommended* rule set
// (no type-checked rules, so no parserOptions.project — keeps lint fast and CI
// dependency-light) over the TypeScript sources only. Build output, the docs
// site and node_modules are ignored.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', 'site/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Allow intentionally-unused identifiers prefixed with `_` (e.g. unused
      // callback params), and don't flag unused function args before a used one.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', args: 'after-used' },
      ],
    },
  },
  {
    // `any` is unavoidable at genuinely untyped boundaries: the markdown-it
    // plugin API (this project intentionally carries no @types/markdown-it) and
    // the VS Code-free test fakes that stand in for markdown-it / VS Code state.
    // Allow it there rather than littering inline disables; typed source stays
    // under the `no-explicit-any` error.
    files: ['src/preview/markdownIt.ts', 'src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
