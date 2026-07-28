import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { extractEmbeddedDefaultConfigs } from './embedded-default-configs.js';
import type { BuiltinVerifyStepName, DefaultVerifyStepsResult, VerifyStep, VerifyStepDebugInfo } from './types.js';

const require = createRequire(import.meta.url);
const OXLINT_IGNORE_PATTERNS = [
  '.codex/**',
  '.claude/**',
  '.fallow/**',
  '.idea/**',
  '.tmp/**',
  'artifacts/**',
  'build/**',
  'dist/**',
  'node_modules/**',
  'coverage/**',
  'specs/bin/fixtures/**',
  'tmp/**',
];

function packageRoot(packageName: string): string {
  return dirname(require.resolve(`${packageName}/package.json`));
}

function resolveTsgolintPath(): string {
  if (
    (process.platform !== 'darwin' && process.platform !== 'linux') ||
    (process.arch !== 'arm64' && process.arch !== 'x64')
  ) {
    throw new Error(`agent-quality-gate: unsupported platform ${process.platform}-${process.arch}`);
  }
  const tsgolintRequire = createRequire(require.resolve('oxlint-tsgolint/package.json'));
  const nativePackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
  return join(dirname(tsgolintRequire.resolve(`${nativePackage}/package.json`)), 'tsgolint');
}

function createInternalStep(name: BuiltinVerifyStepName, internalName: string): VerifyStep {
  const entryPath = process.argv[1];
  if (!entryPath) {
    throw new Error('agent-quality-gate: unable to resolve verify launcher path');
  }
  return {
    name,
    command: process.execPath,
    args: [entryPath, '--agent-quality-gate-internal', internalName],
  };
}

export function createDefaultVerifyStepsResult(): DefaultVerifyStepsResult {
  const configPaths = extractEmbeddedDefaultConfigs(require.resolve('oxlint-plugin-eslint'));
  const steps: VerifyStep[] = [
    createInternalStep('lint-directives', 'lint-directives'),
    {
      name: 'oxlint',
      command: process.execPath,
      environment: {
        OXLINT_TSGOLINT_PATH: resolveTsgolintPath(),
      },
      args: [
        join(packageRoot('oxlint'), 'bin', 'oxlint'),
        '--type-aware',
        '--type-check',
        '--deny-warnings',
        '--config',
        configPaths.oxlint,
        ...OXLINT_IGNORE_PATTERNS.flatMap((pattern) => ['--ignore-pattern', pattern]),
        '.',
      ],
    },
    {
      name: 'fallow',
      command: process.execPath,
      args: [join(packageRoot('fallow'), 'bin', 'fallow'), '--config', configPaths.fallow, '--fail-on-issues'],
    },
  ];
  const stepDebugInfo: VerifyStepDebugInfo[] = [
    { name: 'lint-directives', source: 'bundled' },
    { name: 'oxlint', source: 'bundled', configPath: configPaths.oxlint },
    { name: 'fallow', source: 'bundled', configPath: configPaths.fallow },
  ];
  return { steps, stepDebugInfo };
}

export function createDefaultVerifySteps(): VerifyStep[] {
  return createDefaultVerifyStepsResult().steps;
}
