import * as v from 'valibot';

import { applyConfiguredRule } from 'agent-quality-gate/shared/oxlint';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';
import { parsePackages, type PackagesGateConfig } from './parse-packages-config.ts';
import {
  parsePlacement,
  type ModulePlacementGateConfig,
  type RouteCompositionRootConfig,
} from './parse-placement-config.ts';
import { parseTestColocation } from './parse-test-colocation-config.ts';
import type { TestColocationGateConfig, TestColocationPolicy } from './scan-test-colocation.ts';

export type { TestColocationGateConfig, TestColocationPolicy };
export type { ModulePlacementGateConfig, PackagesGateConfig, RouteCompositionRootConfig };

export type LayoutGateConfig = {
  placement?: ModulePlacementGateConfig;
  testColocation?: TestColocationGateConfig;
  /** Present when a test-colocation section was supplied but policy failed to parse. */
  testColocationInvalid?: true;
  packages?: PackagesGateConfig;
};

const PlainObjectSchema = v.looseObject({});
type PlainObject = v.InferOutput<typeof PlainObjectSchema>;
function sectionObject(bag: PlainObject, key: string): PlainObject | undefined {
  const parsed = v.safeParse(PlainObjectSchema, bag[key]);
  return parsed.success ? parsed.output : undefined;
}

function placementFromBag(bag: PlainObject): ModulePlacementGateConfig | undefined {
  return parsePlacement(sectionObject(bag, 'placement'));
}

function testColocationFromBag(bag: PlainObject): ReturnType<typeof parseTestColocation> {
  const nested = sectionObject(bag, 'testColocation');
  return nested === undefined ? {} : parseTestColocation(nested);
}

function packagesFromBag(bag: PlainObject): PackagesGateConfig | undefined {
  return parsePackages(sectionObject(bag, 'packages'));
}

export function parsePresetConfig(raw: object | undefined): LayoutGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const bagParsed = v.safeParse(PlainObjectSchema, raw);
  if (!bagParsed.success) {
    return undefined;
  }
  const bag = bagParsed.output;
  const placement = placementFromBag(bag);
  const testColocationResult = testColocationFromBag(bag);
  const packages = packagesFromBag(bag);
  if (
    placement === undefined &&
    testColocationResult.config === undefined &&
    testColocationResult.invalid !== true &&
    packages === undefined
  ) {
    return undefined;
  }
  return {
    ...(placement === undefined ? {} : { placement }),
    ...(testColocationResult.config === undefined
      ? {}
      : { testColocation: testColocationResult.config }),
    ...(testColocationResult.invalid === true ? { testColocationInvalid: true } : {}),
    ...(packages === undefined ? {} : { packages }),
  };
}

function enablePackagesRule(rules: Record<string, OxlintRuleSetting>, options: PlainObject): void {
  if (!Object.hasOwn(rules, 'packages/package-boundaries')) {
    return;
  }
  const setting = rules['packages/package-boundaries'];
  if (typeof setting === 'string') {
    rules['packages/package-boundaries'] = ['error', options];
    return;
  }
  if ('severity' in setting) {
    rules['packages/package-boundaries'] = {
      severity: 'error',
      ...(setting.phase === undefined ? {} : { phase: setting.phase }),
      options,
    };
    return;
  }
  rules['packages/package-boundaries'] = ['error', options];
}

export function applyConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  config: object,
): void {
  const layout = parsePresetConfig(config);
  if (layout === undefined) {
    return;
  }
  if (layout.placement !== undefined) {
    applyConfiguredRule(rules, 'module-placement/module-placement', {
      directories: [...layout.placement.directories],
      rootExceptions: Object.fromEntries(
        Object.entries(layout.placement.rootExceptions).map(([directory, exceptions]) => [
          directory,
          [...exceptions],
        ]),
      ),
      forbidConcernPrefix: [...layout.placement.forbidConcernPrefix],
      maxDepth: { ...layout.placement.maxDepth },
    });
  }
  if (layout.packages !== undefined) {
    enablePackagesRule(rules, {
      allowedRootModules: [...layout.packages.allowedRootModules],
      alwaysAllowedDependencies: [...layout.packages.alwaysAllowedDependencies],
      compositionDirectories: [...layout.packages.compositionDirectories],
      declaredDependencies: Object.fromEntries(
        Object.entries(layout.packages.declaredDependencies).map(([owner, dependencies]) => [
          owner,
          [...dependencies],
        ]),
      ),
      nonProductionDirectories: [...layout.packages.nonProductionDirectories],
      privatePackages: [...layout.packages.privatePackages],
      testDirectories: [...layout.packages.testDirectories],
      testImportablePrivatePackages: [...layout.packages.testImportablePrivatePackages],
    });
  }
}
