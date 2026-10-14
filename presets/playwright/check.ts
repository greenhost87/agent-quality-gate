import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { checkResultFromDiagnostics, type CheckResult } from 'agent-quality-gate/shared/verify';
import type { PresetCheckModule } from 'agent-quality-gate/shared/verify';
import { readProjectPackageJson } from 'agent-quality-gate/shared/verify';
import { parsePresetConfig } from './gate-config.ts';

const PLAYWRIGHT_PACKAGE = '@playwright/test';
const CONFIG_BASENAMES = [
  'playwright.config.ts',
  'playwright.config.mts',
  'playwright.config.js',
  'playwright.config.mjs',
  'playwright.config.cts',
  'playwright.config.cjs',
] as const;
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

function sectionHasPlaywright(section: object | undefined): boolean {
  return section !== undefined && PLAYWRIGHT_PACKAGE in section;
}

async function packageJsonHasPlaywright(projectRoot: string): Promise<boolean> {
  const parsed = await readProjectPackageJson(projectRoot);
  if (parsed === undefined) {
    return false;
  }
  return DEPENDENCY_SECTIONS.some((section) => sectionHasPlaywright(parsed[section]));
}

async function projectUsesPlaywright(projectRoot: string, e2eDirectory: string): Promise<boolean> {
  return (
    (await packageJsonHasPlaywright(projectRoot)) ||
    (e2eDirectory.length > 0 && existsSync(join(projectRoot, e2eDirectory)))
  );
}

function hasPlaywrightConfig(projectRoot: string): boolean {
  for (const basename of CONFIG_BASENAMES) {
    if (existsSync(join(projectRoot, basename))) {
      return true;
    }
  }
  return false;
}

async function playwrightPreflight(
  projectRoot: string,
  presetConfig?: object,
): Promise<CheckResult | undefined> {
  const e2eDirectory = parsePresetConfig(presetConfig)?.e2eDirectory ?? '';
  if (
    !(await projectUsesPlaywright(projectRoot, e2eDirectory)) ||
    hasPlaywrightConfig(projectRoot)
  ) {
    return undefined;
  }
  return checkResultFromDiagnostics(
    [
      {
        source: 'playwright',
        ruleId: 'playwright/config',
        severity: 'error',
        message: 'add playwright.config.ts with use.baseURL and webServer',
      },
    ],
    {
      hints: [
        {
          kind: 'document',
          id: 'playwright-e2e',
          body: `# playwright-e2e\n\nUse Playwright end-to-end tests for user-visible behavior. Keep tests black-box, configure baseURL and webServer, and mock only canonical external origins.\n`,
        },
      ],
    },
  );
}

const checkModule: PresetCheckModule = {
  preflight: playwrightPreflight,
};

export const preflight = checkModule.preflight;
export const runToolChecks = checkModule.runToolChecks;
