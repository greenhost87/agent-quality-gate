import { createRequire } from 'node:module';
import { join } from 'node:path';

import * as v from 'valibot';

import { pathExists, readJsonFile } from '../../process/files/files.js';

export const OXLINT_CONFIG_NAME = 'oxlint.config.ts';
export const FALLOW_CONFIG_NAME = '.fallowrc.json';

const loadModule = createRequire(import.meta.url);

const OxlintJsPluginSchema = v.looseObject({
  name: v.optional(v.string()),
  specifier: v.optional(v.string()),
});

const OxlintConfigSchema = v.looseObject({
  ignorePatterns: v.optional(v.array(v.string())),
  plugins: v.optional(v.array(v.union([v.string(), OxlintJsPluginSchema]))),
  jsPlugins: v.optional(v.array(OxlintJsPluginSchema)),
  rules: v.optional(v.looseObject({})),
  overrides: v.optional(v.array(v.looseObject({}))),
  options: v.optional(
    v.looseObject({
      typeAware: v.optional(v.boolean()),
      typeCheck: v.optional(v.boolean()),
    }),
  ),
});

export type OxlintConfig = v.InferOutput<typeof OxlintConfigSchema>;
export type OxlintJsPlugin = v.InferOutput<typeof OxlintJsPluginSchema>;

const FallowConfigSchema = v.looseObject({
  entry: v.optional(v.array(v.string())),
  ignorePatterns: v.optional(v.array(v.string())),
  ignoreDependencies: v.optional(v.array(v.string())),
});

export type FallowConfig = v.InferOutput<typeof FallowConfigSchema>;

export function readOxlintConfig(cwd: string): OxlintConfig {
  const configPath = join(cwd, OXLINT_CONFIG_NAME);
  let loaded: unknown;
  try {
    const configModule: unknown = loadModule(configPath);
    const moduleResult = v.safeParse(v.looseObject({ default: v.looseObject({}) }), configModule);
    loaded = moduleResult.success ? moduleResult.output.default : undefined;
  } catch {
    throw new Error(
      `verify internal error: packaged Oxlint assets failed to load from ${configPath}`,
    );
  }
  const result = v.safeParse(OxlintConfigSchema, loaded);
  if (!result.success) {
    throw new Error(
      `verify internal error: packaged Oxlint assets at ${configPath} must default-export an object`,
    );
  }
  return structuredClone(result.output);
}

export async function readFallowConfigFile(path: string, name: string): Promise<FallowConfig> {
  if (!(await pathExists(path))) {
    throw new Error(`${name} must contain valid JSON`);
  }
  let parsed;
  try {
    parsed = await readJsonFile(path);
  } catch (error) {
    throw new Error(`${name} must contain valid JSON`, { cause: error });
  }
  const result = v.safeParse(FallowConfigSchema, parsed);
  if (!result.success) {
    throw new Error(`${name} must contain an object`);
  }
  return result.output;
}
