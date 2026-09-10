import * as v from 'valibot';

import { applyConfiguredRule } from '../../preset-catalog/oxlint-config/apply-configured-rule.ts';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.ts';
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

export const LAYOUT_PRESET_NAME = 'layout';
export const LAYOUT_LEGACY_PRESET_NAMES = [
  'module-placement',
  'test-colocation',
  'packages',
] as const;

export type LayoutGateConfig = {
  placement?: ModulePlacementGateConfig;
  testColocation?: TestColocationGateConfig;
  /** Present when a test-colocation section was supplied but policy failed to parse. */
  testColocationInvalid?: true;
  packages?: PackagesGateConfig;
};

const PlainObjectSchema = v.looseObject({});
type PlainObject = v.InferOutput<typeof PlainObjectSchema>;
const PresetConfigBagSchema = v.record(v.string(), PlainObjectSchema);
type PresetConfigBag = v.InferOutput<typeof PresetConfigBagSchema>;

function sectionObject(bag: PlainObject, key: string): PlainObject | undefined {
  const parsed = v.safeParse(PlainObjectSchema, bag[key]);
  return parsed.success ? parsed.output : undefined;
}

/** Merge canonical `layout` + legacy presetConfig keys into one raw section object. */
export function resolveRawConfig(presetConfig: PresetConfigBag): PlainObject | undefined {
  const layoutParsed = v.safeParse(PlainObjectSchema, presetConfig[LAYOUT_PRESET_NAME]);
  const layout = layoutParsed.success ? layoutParsed.output : undefined;
  const placementParsed = v.safeParse(
    PlainObjectSchema,
    layout?.placement ?? presetConfig['module-placement'],
  );
  const placement = placementParsed.success ? placementParsed.output : undefined;
  const testParsed = v.safeParse(
    PlainObjectSchema,
    layout?.testColocation ?? presetConfig['test-colocation'],
  );
  const testColocation = testParsed.success ? testParsed.output : undefined;
  const packagesParsed = v.safeParse(PlainObjectSchema, layout?.packages ?? presetConfig.packages);
  const packages = packagesParsed.success ? packagesParsed.output : undefined;
  if (placement === undefined && testColocation === undefined && packages === undefined) {
    return undefined;
  }
  return {
    ...(placement === undefined ? {} : { placement }),
    ...(testColocation === undefined ? {} : { testColocation }),
    ...(packages === undefined ? {} : { packages }),
  };
}

function placementFromBag(bag: PlainObject): ModulePlacementGateConfig | undefined {
  return parsePlacement(
    sectionObject(bag, 'placement') ?? ('directories' in bag ? bag : undefined),
  );
}

function testColocationFromBag(bag: PlainObject): ReturnType<typeof parseTestColocation> {
  const nested = sectionObject(bag, 'testColocation');
  if (nested !== undefined) {
    return parseTestColocation(nested);
  }
  return 'policy' in bag ? parseTestColocation(bag) : {};
}

function packagesFromBag(bag: PlainObject): PackagesGateConfig | undefined {
  return parsePackages(
    sectionObject(bag, 'packages') ??
      ('allowedRootModules' in bag || 'declaredDependencies' in bag || 'privatePackages' in bag
        ? bag
        : undefined),
  );
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
      declaredDependencies: Object.fromEntries(
        Object.entries(layout.packages.declaredDependencies).map(([owner, dependencies]) => [
          owner,
          [...dependencies],
        ]),
      ),
      privatePackages: [...layout.packages.privatePackages],
    });
  }
}
