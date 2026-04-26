import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import checkFile from 'eslint-plugin-check-file';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import quality from './tools/eslint-plugin-quality/index.mjs';

const ESLINT_CONFIG_DIR = fileURLToPath(new URL('.', import.meta.url));

function resolveExtensionNames(cwd = process.cwd()) {
  const extensionsDir = join(cwd, 'extensions');
  if (!existsSync(extensionsDir)) {
    return [];
  }
  return readdirSync(extensionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.length > 0 && !name.startsWith('.'))
    .sort();
}

const EXTENSION_NAMES = resolveExtensionNames();
const NON_SHARED_EXTENSION_NAMES = EXTENSION_NAMES.filter((name) => name !== 'shared');
const TYPE_FILE_PATTERNS = ['**/*.types.ts', '**/*.contracts.ts', '**/*.interfaces.ts', '**/types.ts'];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCrossExtensionImportOverride(extensionName) {
  const disallowedExtensions = NON_SHARED_EXTENSION_NAMES.filter((name) => name !== extensionName)
    .map(escapeRegex)
    .join('|');

  if (!disallowedExtensions) {
    return null;
  }

  return {
    files: [`extensions/${extensionName}/**/*.{js,mjs,cjs,ts,tsx,mts,cts}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(?:\\.\\./)+(?:${disallowedExtensions})/`,
              message:
                'Cross-extension imports are forbidden. Move shared code to extensions/shared and import from there.',
            },
          ],
        },
      ],
    },
  };
}

const crossExtensionImportOverrides = NON_SHARED_EXTENSION_NAMES.flatMap((extensionName) => {
  const override = buildCrossExtensionImportOverride(extensionName);
  return override ? [override] : [];
});

const localRulesPlugin = {
  rules: {
    'no-shared-proxy-reexport': {
      meta: {
        type: 'problem',
        docs: {
          description: 'forbid files outside extensions/shared that only re-export from shared',
        },
        schema: [],
        messages: {
          noProxy:
            'Proxy re-export file detected. Import from extensions/shared directly instead of keeping a wrapper file.',
        },
      },
      create(context) {
        const filename = String(context.filename || '').replace(/\\/g, '/');
        if (!/\/extensions\/[^/]+\//.test(filename)) {
          return {};
        }
        if (/\/extensions\/shared\//.test(filename)) {
          return {};
        }

        return {
          Program(node) {
            if (!Array.isArray(node.body) || node.body.length === 0) {
              return;
            }

            const isSharedReexport = (statement) => {
              if (statement.type !== 'ExportNamedDeclaration' && statement.type !== 'ExportAllDeclaration') {
                return false;
              }
              if (!statement.source || typeof statement.source.value !== 'string') {
                return false;
              }
              return /(?:^|\/)shared\//.test(statement.source.value);
            };

            if (!node.body.every(isSharedReexport)) {
              return;
            }

            context.report({
              node: node.body[0],
              messageId: 'noProxy',
            });
          },
        };
      },
    },
  },
};

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
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: [
      'specs/**/*.{js,mjs,cjs,ts,tsx}',
      '**/__tests__/**/*.{js,mjs,cjs,ts,tsx}',
      '**/*.{test,spec}.{js,mjs,cjs,ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: ESLINT_CONFIG_DIR,
      },
    },
    rules: {
      '@typescript-eslint/typedef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression[typeAnnotation.type="TSAnyKeyword"]',
          message: 'Casting to any is forbidden. Use a precise type or validate unknown data first.',
        },
        {
          selector: 'TSAsExpression[typeAnnotation.type="TSNeverKeyword"]',
          message: 'Casting to never is forbidden. Model the impossible state explicitly.',
        },
        {
          selector: 'TSAsExpression > TSAsExpression[typeAnnotation.type="TSUnknownKeyword"]',
          message: 'Double casts through unknown are forbidden. Use validation or a precise intermediate type.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx,mts,cts}', 'extensions/**/*.{ts,tsx,mts,cts}'],
    ignores: ['**/__tests__/**', '**/*.{test,spec}.{ts,tsx,mts,cts}'],
    plugins: {
      'check-file': checkFile,
      quality,
    },
    rules: {
      '@typescript-eslint/no-empty-object-type': [
        'error',
        {
          allowInterfaces: 'with-single-extends',
          allowObjectTypes: 'never',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/no-unnecessary-type-parameters': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-expect-error': 'allow-with-description',
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      'check-file/filename-blocklist': [
        'error',
        {
          '**/*.model.ts': '*.types.ts',
          '**/*.interface.ts': '*.interfaces.ts',
          '**/*.contract.ts': '*.contracts.ts',
        },
      ],
      'quality/no-useless-exported-type-alias': 'error',
      'quality/no-empty-interface-extends': 'error',
      'quality/no-type-declarations-in-runtime-files': [
        'error',
        {
          typeFilePatterns: TYPE_FILE_PATTERNS,
        },
      ],
      'quality/no-runtime-in-types-files': [
        'error',
        {
          typeFilePatterns: TYPE_FILE_PATTERNS,
        },
      ],
      'quality/no-record-string-unknown': [
        'error',
        {
          allowIn: ['**/*.dto.ts', '**/*.event.ts', '**/*.events.ts', '**/transport/**', '**/adapters/**'],
        },
      ],
    },
  },
  {
    files: ['extensions/**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    plugins: {
      local: localRulesPlugin,
    },
    rules: {
      'local/no-shared-proxy-reexport': 'error',
    },
  },
  ...crossExtensionImportOverrides,
];
