import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: [
      'build/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      '.worktrees/**',
      'specs/bin/fixtures/**',
      '**/*.d.ts',
      '**/*.generated.*',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx,mts,cts}', 'extensions/**/*.{ts,tsx,mts,cts}'],
    ignores: ['**/__tests__/**', '**/*.{test,spec}.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'max-len': [
        'error',
        {
          code: 120,
          ignoreUrls: true,
          ignoreTemplateLiterals: true,
          ignoreStrings: true,
        },
      ],
      'max-lines': [
        'error',
        {
          max: 400,
        },
      ],
    },
  },
];
