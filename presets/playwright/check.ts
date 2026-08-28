import { join } from 'node:path';

import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.ts';
import type { PresetCheckModule } from '../../preset-catalog/contract/preset-check.types.ts';
import { readProjectPackageJson } from '../../preset-catalog/dependencies/read-project-package-json.ts';
import { pathExists } from '../../process/files/files.ts';

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

async function projectUsesPlaywright(projectRoot: string): Promise<boolean> {
  return (
    (await packageJsonHasPlaywright(projectRoot)) ||
    (await pathExists(join(projectRoot, 'tests', 'e2e')))
  );
}

async function hasPlaywrightConfig(projectRoot: string): Promise<boolean> {
  for (const basename of CONFIG_BASENAMES) {
    if (await pathExists(join(projectRoot, basename))) {
      return true;
    }
  }
  return false;
}

async function playwrightPreflight(projectRoot: string): Promise<ToolRunResult | undefined> {
  if (!(await projectUsesPlaywright(projectRoot)) || (await hasPlaywrightConfig(projectRoot))) {
    return undefined;
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: 'playwright-config: add playwright.config.ts with use.baseURL and webServer\n',
  };
}

const checkModule: PresetCheckModule = {
  preflight: playwrightPreflight,
};

export const preflight = checkModule.preflight;
export const runToolChecks = checkModule.runToolChecks;
