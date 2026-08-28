import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { fallowConfigPathForProject } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import {
  FALLOW_CONFIG_NAME,
  readFallowConfigFile,
} from '../../config/verify-config-files/verify-config-files.js';
import { writeTextIfChanged } from '../../process/files/files.js';
import { getOptionalEnv } from '../read-env/read-env.js';
import { filterOxlintAgentOutput } from './filter-oxlint-agent-output.js';
import type { ToolRunResult } from './execute-verify.js';

const require = createRequire(import.meta.url);

const FALLOW_INFORMATIONAL_PREFIXES = [
  'health-score:',
  'vital-signs:',
  'file-score:',
  'hotspot:',
  'refactoring-target:',
];

export function packageRoot(packageName: string): string {
  return dirname(require.resolve(`${packageName}/package.json`));
}

export function fallowExecutablePath(): string {
  return join(dirname(require.resolve('fallow/package.json')), 'bin', 'fallow');
}

export function tsgolintPath(): string {
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

export function oxlintToolRun(
  configPath: string,
  ignorePatterns: readonly string[] = [],
): { args: string[]; environment: Record<string, string> } {
  const eslintPluginRoot = dirname(packageRoot('oxlint-plugin-eslint'));
  const nodePath = [eslintPluginRoot, getOptionalEnv('NODE_PATH')]
    .filter((value) => value !== undefined)
    .join(':');
  return {
    environment: {
      NODE_PATH: nodePath,
      OXLINT_TSGOLINT_PATH: tsgolintPath(),
    },
    args: [
      join(packageRoot('oxlint'), 'bin', 'oxlint'),
      '--format',
      'agent',
      '--deny-warnings',
      '--config',
      configPath,
      ...ignorePatterns.flatMap((pattern) => ['--ignore-pattern', pattern]),
      '.',
    ],
  };
}

export function fallowCliArgs(
  executable: string,
  configPath: string,
  projectRoot: string,
  extraPrefix: readonly string[],
): string[] {
  return [
    executable,
    ...extraPrefix,
    '--config',
    configPath,
    '--root',
    projectRoot,
    '--format',
    'compact',
    '--quiet',
    '--fail-on-issues',
  ];
}

export async function writeFallowConfigWithEntries(
  packagedFallowPath: string,
  projectRoot: string,
  entries: readonly string[],
  ignorePatterns: readonly string[],
  fallowIgnoreDependencies: readonly string[] = [],
  enabledRules?: readonly string[],
  configPath: string = fallowConfigPathForProject(projectRoot),
): Promise<string> {
  const packaged = await readFallowConfigFile(packagedFallowPath, FALLOW_CONFIG_NAME);
  const rules = Object.fromEntries(
    Object.entries(packaged.rules ?? {}).map(([ruleId, severity]) => [
      ruleId,
      enabledRules === undefined || enabledRules.includes(ruleId) ? severity : 'off',
    ]),
  );
  await writeTextIfChanged(
    configPath,
    `${JSON.stringify(
      {
        ...packaged,
        rules,
        entry: [...entries],
        ignorePatterns: [...ignorePatterns],
        ignoreDependencies: [...(packaged.ignoreDependencies ?? []), ...fallowIgnoreDependencies],
      },
      null,
      2,
    )}\n`,
  );
  return configPath;
}

export function removeFallowInformation(output: string): string {
  return output
    .split('\n')
    .filter((line) => !FALLOW_INFORMATIONAL_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .join('\n');
}

export function applyIgnoredOxlintRules(
  oxlintRaw: ToolRunResult,
  ignoreRuleIds: ReadonlySet<string>,
): ToolRunResult {
  if (ignoreRuleIds.size === 0) {
    return oxlintRaw;
  }
  const filteredStdout = filterOxlintAgentOutput(oxlintRaw.stdout, ignoreRuleIds);
  const filteredStderr = filterOxlintAgentOutput(oxlintRaw.stderr, ignoreRuleIds);
  const hasRemainingIssues = filteredStdout.hasRemainingIssues || filteredStderr.hasRemainingIssues;
  const rawHadIssues =
    /:\s*(error|warning)\s+/u.test(oxlintRaw.stdout) ||
    /:\s*(error|warning)\s+/u.test(oxlintRaw.stderr);
  let exitCode = 0;
  if (hasRemainingIssues) {
    exitCode = Math.max(oxlintRaw.exitCode, 1);
  } else if (oxlintRaw.exitCode !== 0 && !rawHadIssues) {
    exitCode = oxlintRaw.exitCode;
  }
  return {
    exitCode,
    stdout: filteredStdout.text,
    stderr: filteredStderr.text,
  };
}
