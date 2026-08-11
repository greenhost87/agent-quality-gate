import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, sep } from 'node:path';

const CONFIG_NAME = 'agent-quality-gate.config.json';
const ROOT_KEYS = new Set(['entries', 'fallowIgnorePatterns', 'health', 'plugins']);
const HEALTH_KEYS = new Set(['maxCyclomatic', 'maxCognitive', 'maxCrap']);
const PLUGIN_KEYS = new Set(['name', 'specifier', 'rules']);
const RESERVED_PLUGIN_NAMES = new Set(['eslint-js', 'quality', 'typescript']);
const TEST_DIRECTORY_NAMES = new Set(['tests', 'e2e', 'specs', '__tests__']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function rejectUnknownKeys(value: object, allowed: Set<string>, location: string): void {
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey !== undefined) {
    throw new Error(`${CONFIG_NAME}: unknown ${location} key "${unknownKey}"`);
  }
}

function readFallowIgnorePatterns(config: object): string[] {
  if (!('fallowIgnorePatterns' in config)) {
    return [];
  }
  const patterns = config.fallowIgnorePatterns;
  if (!isStringArray(patterns)) {
    throw new Error(`${CONFIG_NAME}: fallowIgnorePatterns must be a string array`);
  }
  for (const pattern of patterns) {
    if (
      pattern.length === 0 ||
      isAbsolute(pattern) ||
      pattern.includes('\\') ||
      pattern.split('/').includes('..')
    ) {
      throw new Error(
        `${CONFIG_NAME}: fallowIgnorePatterns must contain root-relative globs, received "${pattern}"`
      );
    }
  }
  return patterns;
}

function readHealth(config: object) {
  if (!('health' in config)) {
    return {
      maxCyclomatic: undefined,
      maxCognitive: undefined,
      maxCrap: undefined,
    };
  }
  const health = config.health;
  if (!isObject(health)) {
    throw new Error(`${CONFIG_NAME}: health must be an object`);
  }
  rejectUnknownKeys(health, HEALTH_KEYS, 'health');
  const healthConfig = health;

  function readComplexityThreshold(name: 'maxCyclomatic' | 'maxCognitive'): number | undefined {
    const value = healthConfig[name];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65535) {
      throw new Error(`${CONFIG_NAME}: health.${name} must be an integer between 0 and 65535`);
    }
    return value;
  }

  const maxCrap = healthConfig.maxCrap;
  if (maxCrap !== undefined && (typeof maxCrap !== 'number' || !Number.isFinite(maxCrap) || maxCrap < 0)) {
    throw new Error(`${CONFIG_NAME}: health.maxCrap must be a non-negative number`);
  }
  return {
    maxCyclomatic: readComplexityThreshold('maxCyclomatic'),
    maxCognitive: readComplexityThreshold('maxCognitive'),
    maxCrap,
  };
}

export function readAgentQualityGateConfig(cwd: string) {
  const configPath = join(cwd, CONFIG_NAME);
  if (!existsSync(configPath)) {
    throw new Error(`${CONFIG_NAME} is required in the project root`);
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error(`${CONFIG_NAME} must contain valid JSON`);
  }
  if (!isObject(value)) {
    throw new Error(`${CONFIG_NAME} must contain an object`);
  }
  const config = value;

  function readPlugins() {
    const plugins = config.plugins;
    if (plugins === undefined) {
      return [];
    }
    if (!Array.isArray(plugins)) {
      throw new Error(`${CONFIG_NAME}: plugins must be an array`);
    }
    const projectRequire = createRequire(join(cwd, 'package.json'));
    const names = new Set<string>();

    function resolvePluginSpecifier(plugin: object, index: number) {
      if (!('specifier' in plugin)) {
        return { entry: null, specifier: null };
      }
      const specifier = plugin.specifier;
      if (typeof specifier !== 'string' || specifier.length === 0) {
        throw new Error(`${CONFIG_NAME}: plugins[${index}].specifier must be a non-empty string`);
      }
      let resolvedSpecifier: string;
      try {
        resolvedSpecifier = projectRequire.resolve(specifier);
      } catch {
        throw new Error(`${CONFIG_NAME}: cannot resolve plugin "${specifier}" from the project root`);
      }
      const relativeSpecifier = relative(cwd, resolvedSpecifier);
      const entry =
        (specifier.startsWith('.') || isAbsolute(specifier)) &&
        !relativeSpecifier.startsWith(`..${sep}`) &&
        !isAbsolute(relativeSpecifier)
          ? relativeSpecifier.replaceAll(sep, '/')
          : null;
      return { entry, specifier: resolvedSpecifier };
    }

    return plugins.map((plugin, index) => {
      if (!isObject(plugin)) {
        throw new Error(`${CONFIG_NAME}: plugins[${index}] must be an object`);
      }
      rejectUnknownKeys(plugin, PLUGIN_KEYS, `plugins[${index}]`);
      const { name, rules } = plugin;
      if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(name)) {
        throw new Error(`${CONFIG_NAME}: plugins[${index}].name must contain lowercase letters, digits, or hyphens`);
      }
      if (RESERVED_PLUGIN_NAMES.has(name) || names.has(name)) {
        throw new Error(`${CONFIG_NAME}: plugin name "${name}" is reserved or duplicated`);
      }
      if (!isObject(rules) || Object.keys(rules).length === 0) {
        throw new Error(`${CONFIG_NAME}: plugins[${index}].rules must be a non-empty object`);
      }
      const invalidRule = Object.keys(rules).find((rule) => !rule.startsWith(`${name}/`));
      if (invalidRule !== undefined) {
        throw new Error(`${CONFIG_NAME}: rule "${invalidRule}" must start with "${name}/"`);
      }
      const { entry, specifier } = resolvePluginSpecifier(plugin, index);
      names.add(name);
      return { entry, name, rules, specifier };
    });
  }

  rejectUnknownKeys(config, ROOT_KEYS, 'root');
  if (!isStringArray(config.entries) || config.entries.length === 0) {
    throw new Error(`${CONFIG_NAME}: entries must be a non-empty string array`);
  }
  for (const entry of config.entries) {
    const segments = entry.split('/');
    if (
      entry.length === 0 ||
      isAbsolute(entry) ||
      entry.includes('\\') ||
      segments.includes('..')
    ) {
      throw new Error(`${CONFIG_NAME}: entries must contain root-relative globs, received "${entry}"`);
    }
    if (segments.some((segment) => TEST_DIRECTORY_NAMES.has(segment))) {
      throw new Error(
        `${CONFIG_NAME}: production entries must not include test directories, received "${entry}"`
      );
    }
  }
  return {
    entries: config.entries,
    fallowIgnorePatterns: readFallowIgnorePatterns(config),
    health: readHealth(config),
    plugins: readPlugins(),
  };
}
