import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDefaultConfigMap } from './default-config-resolver.js';
import { resolveVerifyTargets } from './targets.js';
import type {
  BuiltinVerifyStepName,
  DefaultVerifyStepsOptions,
  DefaultVerifyStepsResult,
  StepOverride,
  VerifyStep,
  VerifyStepDebugInfo,
} from './types.js';

const PROTECTED_COVERAGE_STEP_NAME = 'protected-coverage';
const JSCPD_ALLOWED_PREFIXES = ['src/', 'extensions/', 'bin/', 'reports/', 'specs/'] as const;
const STEP_ORDER: BuiltinVerifyStepName[] = [
  'eslint',
  'ast-grep',
  'remark',
  'tsc',
  'duplicate-shapes',
  'depcruise',
  'knip',
  'jscpd',
];
const PROTECTED_COVERAGE_SCRIPT_PATH = resolveProtectedScriptPath('verify-protected-coverage');

function hasTargetInRoot(targets: readonly string[], rootDir: string): boolean {
  const normalizedRoot = rootDir.endsWith('/') ? rootDir : `${rootDir}/`;
  return targets.some((filePath) => filePath.startsWith(normalizedRoot));
}

function toDefaultJscpdTargets(targets: readonly string[]): string[] {
  return targets.filter((filePath) => JSCPD_ALLOWED_PREFIXES.some((prefix) => filePath.startsWith(prefix)));
}

function toStepArgs(commandArgs: string[]): string[] {
  return ['x', ...commandArgs];
}

function toAbsolutePath(cwd: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(cwd, filePath);
}

function resolveProtectedScriptPath(fileName: string): string {
  const jsPath = fileURLToPath(new URL(`../../bin/${fileName}.js`, import.meta.url));
  if (existsSync(jsPath)) {
    return jsPath;
  }
  return fileURLToPath(new URL(`../../bin/${fileName}.ts`, import.meta.url));
}

function createProtectedCoverageStep(): VerifyStep {
  return {
    name: PROTECTED_COVERAGE_STEP_NAME,
    command: 'bun',
    args: [PROTECTED_COVERAGE_SCRIPT_PATH],
  };
}

function createLockedTscProjectFile(cwd: string, bundledConfigPath: string, files: readonly string[]): string | null {
  if (files.length === 0) {
    return null;
  }
  const tscTempDir = join(cwd, '.tmp', 'verify-locked-tsconfig');
  mkdirSync(tscTempDir, { recursive: true });
  const fileHash = createHash('sha256').update(`${cwd}\n${bundledConfigPath}`).digest('hex').slice(0, 16);
  const filePath = join(tscTempDir, `${fileHash}.json`);
  const absoluteFiles = files.map((filePath) => join(cwd, filePath));
  writeFileSync(
    filePath,
    `${JSON.stringify({ extends: bundledConfigPath, files: absoluteFiles }, null, 2)}\n`,
    'utf-8'
  );
  return filePath;
}

function createBuiltInStep(
  stepName: BuiltinVerifyStepName,
  configPath: string,
  override: StepOverride | undefined,
  cwd: string,
  eslintTargets: readonly string[],
  remarkTargets: readonly string[],
  tscTargets: readonly string[],
  jscpdTargets: readonly string[]
): VerifyStep | null {
  const appendedArgs = override?.args ?? [];
  const overrideConfigPath = override?.configPath ? toAbsolutePath(cwd, override.configPath) : configPath;
  const hasSrcTypeScriptTargets = hasTargetInRoot(tscTargets, 'src');

  switch (stepName) {
    case 'eslint':
      if (eslintTargets.length === 0) {
        return null;
      }
      return {
        name: 'eslint',
        command: 'bun',
        args: toStepArgs(['eslint', '--no-ignore', '--config', overrideConfigPath, ...eslintTargets, ...appendedArgs]),
      };
    case 'ast-grep':
      if (eslintTargets.length === 0) {
        return null;
      }
      return {
        name: 'ast-grep',
        command: 'bun',
        args: toStepArgs(['ast-grep', 'scan', '--config', overrideConfigPath, ...appendedArgs]),
      };
    case 'remark': {
      const targets = override?.targets ?? remarkTargets;
      if (targets.length === 0) {
        return null;
      }
      return {
        name: 'remark',
        command: 'bun',
        args: toStepArgs([
          'remark',
          '--quiet',
          '--frail',
          '--no-stdout',
          '--rc-path',
          overrideConfigPath,
          ...targets,
          ...appendedArgs,
        ]),
      };
    }
    case 'tsc': {
      const tscProjectPath = createLockedTscProjectFile(cwd, overrideConfigPath, tscTargets);
      if (!tscProjectPath) {
        return null;
      }
      return {
        name: 'tsc',
        command: 'bun',
        args: toStepArgs([
          'tsc',
          '--project',
          tscProjectPath,
          '--noUnusedLocals',
          '--noUnusedParameters',
          ...appendedArgs,
        ]),
      };
    }
    case 'duplicate-shapes':
      if (!hasSrcTypeScriptTargets) {
        return null;
      }
      return {
        name: 'duplicate-shapes',
        command: 'bun',
        args: [
          join(dirname(overrideConfigPath), 'detect-duplicate-exported-shapes.mjs'),
          overrideConfigPath,
          ...appendedArgs,
        ],
      };
    case 'depcruise':
      if (!hasSrcTypeScriptTargets) {
        return null;
      }
      return {
        name: 'depcruise',
        command: 'bun',
        args: toStepArgs(['depcruise', '--config', overrideConfigPath, 'src', ...appendedArgs]),
      };
    case 'knip':
      return {
        name: 'knip',
        command: 'bun',
        args: toStepArgs(['knip', '--config', overrideConfigPath, '--include', 'exports', ...appendedArgs]),
      };
    case 'jscpd': {
      const targets = override?.targets ?? toDefaultJscpdTargets(jscpdTargets);
      if (targets.length === 0) {
        return null;
      }
      return {
        name: 'jscpd',
        command: 'bun',
        args: toStepArgs(['jscpd', '--config', overrideConfigPath, ...targets, ...appendedArgs]),
      };
    }
    default:
      return null;
  }
}

export function createDefaultVerifyStepsResult(options: DefaultVerifyStepsOptions = {}): DefaultVerifyStepsResult {
  const cwd = options.cwd ?? process.cwd();
  const resolvedConfigs = resolveDefaultConfigMap({ cwd });
  const resolvedTargets = resolveVerifyTargets(cwd);
  const steps: VerifyStep[] = [createProtectedCoverageStep()];
  const stepDebugInfo: VerifyStepDebugInfo[] = [
    {
      name: PROTECTED_COVERAGE_STEP_NAME,
      source: 'bundled',
    },
  ];

  for (const stepName of STEP_ORDER) {
    const override = options.overrides?.[stepName];
    if (override === false) {
      continue;
    }

    const configPath = override?.configPath
      ? toAbsolutePath(cwd, override.configPath)
      : resolvedConfigs[stepName].configPath;
    const source = override?.configPath ? 'override' : resolvedConfigs[stepName].source;
    const step = createBuiltInStep(
      stepName,
      configPath,
      override,
      cwd,
      resolvedTargets.eslint,
      resolvedTargets.remark,
      resolvedTargets.tsc,
      resolvedTargets.jscpd
    );
    if (!step) {
      continue;
    }
    steps.push(step);
    stepDebugInfo.push({
      name: step.name,
      configPath,
      source,
    });
  }

  return { steps, stepDebugInfo };
}

export function createDefaultVerifySteps(options: DefaultVerifyStepsOptions = {}): VerifyStep[] {
  return createDefaultVerifyStepsResult(options).steps;
}

export const VERIFY_STEPS: VerifyStep[] = createDefaultVerifySteps();
