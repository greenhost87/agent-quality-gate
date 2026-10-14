import * as v from 'valibot';

import { StringArraySchema } from './string-array-schema.ts';

export type PackagesGateConfig = {
  allowedRootModules: string[];
  alwaysAllowedDependencies: string[];
  compositionDirectories: string[];
  declaredDependencies: Record<string, string[]>;
  nonProductionDirectories: string[];
  privatePackages: string[];
  testDirectories: string[];
  testImportablePrivatePackages: string[];
};

function parseDeclaredDependencies(raw: object): Record<string, string[]> {
  const declaredDependencies: Record<string, string[]> = {};
  for (const [owner, dependencies] of Object.entries(raw)) {
    if (owner.length === 0) {
      continue;
    }
    const depsParsed = v.safeParse(StringArraySchema, dependencies);
    if (depsParsed.success && depsParsed.output.length > 0) {
      declaredDependencies[owner] = depsParsed.output.filter((item) => item.length > 0);
    }
  }
  return declaredDependencies;
}

export function parsePackages(raw: object | undefined): PackagesGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(
    v.looseObject({
      allowedRootModules: v.optional(v.array(v.unknown())),
      alwaysAllowedDependencies: v.optional(v.array(v.unknown())),
      compositionDirectories: v.optional(v.array(v.unknown())),
      declaredDependencies: v.optional(v.record(v.string(), v.array(v.unknown()))),
      nonProductionDirectories: v.optional(v.array(v.unknown())),
      privatePackages: v.optional(v.array(v.unknown())),
      testDirectories: v.optional(v.array(v.unknown())),
      testImportablePrivatePackages: v.optional(v.array(v.unknown())),
    }),
    raw,
  );
  if (!parsed.success) {
    return undefined;
  }
  const allowedParsed = v.safeParse(StringArraySchema, parsed.output.allowedRootModules ?? []);
  const allowedRootModules = allowedParsed.success
    ? allowedParsed.output.filter((item) => item.length > 0)
    : undefined;
  const parseStrings = (value: object | undefined): string[] => {
    const result = v.safeParse(StringArraySchema, value ?? []);
    return result.success ? result.output.filter((item) => item.length > 0) : [];
  };
  const alwaysAllowedDependencies = parseStrings(parsed.output.alwaysAllowedDependencies);
  const compositionDirectories = parseStrings(parsed.output.compositionDirectories);
  const nonProductionDirectories = parseStrings(parsed.output.nonProductionDirectories);
  const privatePackages = parseStrings(parsed.output.privatePackages);
  const testDirectories = parseStrings(parsed.output.testDirectories);
  const testImportablePrivatePackages = parseStrings(parsed.output.testImportablePrivatePackages);
  const declaredDependencies = parseDeclaredDependencies(parsed.output.declaredDependencies ?? {});
  if (
    (allowedRootModules === undefined || allowedRootModules.length === 0) &&
    Object.keys(declaredDependencies).length === 0 &&
    alwaysAllowedDependencies.length === 0 &&
    compositionDirectories.length === 0 &&
    nonProductionDirectories.length === 0 &&
    privatePackages.length === 0 &&
    testDirectories.length === 0 &&
    testImportablePrivatePackages.length === 0
  ) {
    return undefined;
  }
  return {
    allowedRootModules: allowedRootModules ?? [],
    alwaysAllowedDependencies,
    compositionDirectories,
    declaredDependencies,
    nonProductionDirectories,
    privatePackages,
    testDirectories,
    testImportablePrivatePackages,
  };
}
