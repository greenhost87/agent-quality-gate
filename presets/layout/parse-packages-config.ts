import * as v from 'valibot';

import { StringArraySchema } from './string-array-schema.ts';

export type PackagesGateConfig = {
  allowedRootModules: string[];
  declaredDependencies: Record<string, string[]>;
  privatePackages: string[];
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
      declaredDependencies: v.optional(v.record(v.string(), v.array(v.unknown()))),
      privatePackages: v.optional(v.array(v.unknown())),
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
  const privateParsed = v.safeParse(StringArraySchema, parsed.output.privatePackages ?? []);
  const privatePackages = privateParsed.success
    ? privateParsed.output.filter((item) => item.length > 0)
    : [];
  const declaredDependencies = parseDeclaredDependencies(parsed.output.declaredDependencies ?? {});
  if (
    (allowedRootModules === undefined || allowedRootModules.length === 0) &&
    Object.keys(declaredDependencies).length === 0 &&
    privatePackages.length === 0
  ) {
    return undefined;
  }
  return {
    allowedRootModules: allowedRootModules ?? [],
    declaredDependencies,
    privatePackages,
  };
}
