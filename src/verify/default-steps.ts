import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
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
  'markdown-headings',
  'tsc',
  'duplicate-shapes',
  'depcruise',
  'knip',
  'jscpd',
  'eslint-length',
];
const VERIFY_SCRIPT_PATH = resolveProtectedScriptPath('verify');

function isCompiledExecutable(): boolean {
  return import.meta.url.includes('/$bunfs/');
}

function hasTargetInRoot(targets: readonly string[], rootDir: string): boolean {
  const normalizedRoot = rootDir.endsWith('/') ? rootDir : `${rootDir}/`;
  return targets.some((filePath) => filePath.startsWith(normalizedRoot));
}

function toDefaultJscpdTargets(targets: readonly string[]): string[] {
  return targets.filter((filePath) => JSCPD_ALLOWED_PREFIXES.some((prefix) => filePath.startsWith(prefix)));
}

function toToolStep(stepName: string, commandArgs: string[]): Pick<VerifyStep, 'command' | 'args'> {
  const internalArgs = ['--agent-quality-gate-internal', 'tool', stepName, ...commandArgs];
  if (!isCompiledExecutable()) {
    return {
      command: 'bun',
      args: [VERIFY_SCRIPT_PATH, ...internalArgs],
    };
  }
  return {
    command: process.execPath,
    args: internalArgs,
  };
}

function toAbsolutePath(cwd: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(cwd, filePath);
}

function resolveProtectedScriptPath(fileName: string): string {
  const bundledEntrypointSiblingPath = fileURLToPath(new URL(`./${fileName}.js`, import.meta.url));
  if (existsSync(bundledEntrypointSiblingPath)) {
    return bundledEntrypointSiblingPath;
  }

  const jsPath = fileURLToPath(new URL(`../../bin/${fileName}.js`, import.meta.url));
  if (existsSync(jsPath)) {
    return jsPath;
  }
  return fileURLToPath(new URL(`../../bin/${fileName}.ts`, import.meta.url));
}

function createProtectedCoverageStep(): VerifyStep {
  const internalArgs = ['--agent-quality-gate-internal', PROTECTED_COVERAGE_STEP_NAME];
  if (isCompiledExecutable()) {
    return {
      name: PROTECTED_COVERAGE_STEP_NAME,
      command: process.execPath,
      args: internalArgs,
    };
  }
  return {
    name: PROTECTED_COVERAGE_STEP_NAME,
    command: 'bun',
    args: [VERIFY_SCRIPT_PATH, ...internalArgs],
  };
}

function resolveTypeScriptBaseConfigPath(cwd: string, bundledConfigPath: string): string {
  const projectConfigPath = join(cwd, 'tsconfig.json');
  if (existsSync(projectConfigPath)) {
    return projectConfigPath;
  }
  return bundledConfigPath;
}

function createLockedTypeScriptProjectFile(
  cwd: string,
  baseConfigPath: string,
  files: readonly string[]
): string | null {
  if (files.length === 0) {
    return null;
  }
  const tscTempDir = join(cwd, '.tmp', 'verify-locked-tsconfig');
  mkdirSync(tscTempDir, { recursive: true });
  const fileHash = createHash('sha256').update(`${cwd}\n${baseConfigPath}`).digest('hex').slice(0, 16);
  const filePath = join(tscTempDir, `${fileHash}.json`);
  const absoluteFiles = files.map((filePath) => join(cwd, filePath));
  const config = {
    extends: baseConfigPath,
    files: absoluteFiles,
    compilerOptions: {
      noEmit: true,
    },
  };
  writeFileSync(
    filePath,
    `${JSON.stringify(config, null, 2)}\n`,
    'utf-8'
  );
  return filePath;
}

function createBuiltInStep(
  stepName: BuiltinVerifyStepName,
  configPath: string | null,
  override: StepOverride | undefined,
  cwd: string,
  typeScriptBaseConfigPath: string,
  eslintTargets: readonly string[],
  markdownTargets: readonly string[],
  tscTargets: readonly string[],
  jscpdTargets: readonly string[]
): VerifyStep | null {
  const appendedArgs = override?.args ?? [];
  const overrideConfigPath = override?.configPath ? toAbsolutePath(cwd, override.configPath) : configPath;
  const hasSrcTypeScriptTargets = hasTargetInRoot(tscTargets, 'src');

  switch (stepName) {
    case 'eslint':
    case 'eslint-length': {
      if (eslintTargets.length === 0) {
        return null;
      }
      if (!overrideConfigPath) {
        throw new Error(`verify: missing ${stepName} config path`);
      }
      const eslintProjectPath =
        stepName === 'eslint' ? createLockedTypeScriptProjectFile(cwd, typeScriptBaseConfigPath, tscTargets) : null;
      return {
        name: stepName,
        ...toToolStep(stepName, [
          'eslint',
          '--no-ignore',
          '--no-warn-ignored',
          '--config',
          overrideConfigPath,
          ...(eslintProjectPath ? ['--project', eslintProjectPath] : []),
          ...eslintTargets,
          ...appendedArgs,
        ]),
      };
    }
    case 'markdown-headings': {
      if (override?.configPath) {
        throw new Error('verify: markdown-headings does not accept a config path');
      }
      const targets = override?.targets ?? markdownTargets;
      if (targets.length === 0) {
        return null;
      }
      const internalArgs = ['--agent-quality-gate-internal', 'markdown-headings', ...targets, ...appendedArgs];
      return {
        name: 'markdown-headings',
        command: isCompiledExecutable() ? process.execPath : 'bun',
        args: isCompiledExecutable() ? internalArgs : [VERIFY_SCRIPT_PATH, ...internalArgs],
      };
    }
    case 'tsc': {
      if (!overrideConfigPath) {
        throw new Error('verify: missing tsc config path');
      }
      const tscBaseConfigPath = override?.configPath ? overrideConfigPath : typeScriptBaseConfigPath;
      const tscProjectPath = createLockedTypeScriptProjectFile(cwd, tscBaseConfigPath, tscTargets);
      if (!tscProjectPath) {
        return null;
      }
      return {
        name: 'tsc',
        ...toToolStep('tsc', [
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
      if (!overrideConfigPath) {
        throw new Error('verify: missing duplicate-shapes config path');
      }
      return {
        name: 'duplicate-shapes',
        command: isCompiledExecutable() ? process.execPath : 'bun',
        args: [
          ...(isCompiledExecutable() ? [] : [VERIFY_SCRIPT_PATH]),
          '--agent-quality-gate-internal',
          'tool',
          'duplicate-shapes',
          'duplicate-shapes',
          overrideConfigPath,
          ...appendedArgs,
        ],
      };
    case 'depcruise':
      if (!hasSrcTypeScriptTargets) {
        return null;
      }
      if (!overrideConfigPath) {
        throw new Error('verify: missing depcruise config path');
      }
      return {
        name: 'depcruise',
        ...toToolStep('depcruise', ['depcruise', '--config', overrideConfigPath, 'src', ...appendedArgs]),
      };
    case 'knip':
      if (!overrideConfigPath) {
        throw new Error('verify: missing knip config path');
      }
      return {
        name: 'knip',
        ...toToolStep('knip', ['knip', '--config', overrideConfigPath, '--include', 'exports', ...appendedArgs]),
      };
    case 'jscpd': {
      const targets = override?.targets ?? toDefaultJscpdTargets(jscpdTargets);
      if (targets.length === 0) {
        return null;
      }
      if (!overrideConfigPath) {
        throw new Error('verify: missing jscpd config path');
      }
      return {
        name: 'jscpd',
        ...toToolStep('jscpd', ['jscpd', '--config', overrideConfigPath, ...targets, ...appendedArgs]),
      };
    }
    default:
      return null;
  }
}

export function createDefaultVerifyStepsResult(options: DefaultVerifyStepsOptions = {}): DefaultVerifyStepsResult {
  const cwd = options.cwd ?? process.cwd();
  const resolvedConfigs = resolveDefaultConfigMap({ cwd });
  const typeScriptBaseConfigPath = resolveTypeScriptBaseConfigPath(cwd, resolvedConfigs.tsc.configPath);
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

    const defaultConfig = stepName === 'markdown-headings' ? undefined : resolvedConfigs[stepName];
    const configPath = override?.configPath
      ? toAbsolutePath(cwd, override.configPath)
      : (defaultConfig?.configPath ?? null);
    const source = override?.configPath ? 'override' : (defaultConfig?.source ?? 'bundled');
    const step = createBuiltInStep(
      stepName,
      configPath,
      override,
      cwd,
      typeScriptBaseConfigPath,
      resolvedTargets.eslint,
      resolvedTargets.markdown,
      resolvedTargets.tsc,
      resolvedTargets.jscpd
    );
    if (!step) {
      continue;
    }
    steps.push(step);
    stepDebugInfo.push({
      name: step.name,
      ...(configPath ? { configPath } : {}),
      source,
    });
  }

  return { steps, stepDebugInfo };
}

export function createDefaultVerifySteps(options: DefaultVerifyStepsOptions = {}): VerifyStep[] {
  return createDefaultVerifyStepsResult(options).steps;
}
