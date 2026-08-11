import type { readAgentQualityGateConfig } from './agent-quality-gate-config.js';
import lockedPolicy from './policy.json' with { type: 'json' };

export function resolveIgnoredPaths(): string[] {
  return [...lockedPolicy.files.ignoredPaths];
}

export function resolveLintableExtensions(): string[] {
  return [...lockedPolicy.files.javascriptExtensions, ...lockedPolicy.files.typescriptExtensions].map(
    (extension) => `.${extension}`
  );
}

export function resolveLockedQualityRuleNames(): string[] {
  return [
    ...Object.keys(lockedPolicy.oxlint.rules.common),
    ...Object.keys(lockedPolicy.oxlint.rules.javascript),
    ...Object.keys(lockedPolicy.oxlint.rules.typescript),
  ].filter((name) => name.startsWith('quality/'));
}

export function resolveHealthThresholds(projectConfig: ReturnType<typeof readAgentQualityGateConfig>) {
  return {
    maxCyclomatic: projectConfig.health.maxCyclomatic ?? lockedPolicy.fallow.health.maxCyclomatic,
    maxCognitive: projectConfig.health.maxCognitive ?? lockedPolicy.fallow.health.maxCognitive,
    maxCrap: projectConfig.health.maxCrap ?? lockedPolicy.fallow.health.maxCrap,
  };
}

function ignoredPatterns(): string[] {
  return resolveIgnoredPaths().map((path) => `${path}/**`);
}

function disabledRules(ruleNames: string[]): Record<string, string> {
  return Object.fromEntries(ruleNames.map((name) => [name, 'off']));
}

function restrictedSyntax(scope: 'javascript' | 'typescript'): [string, ...object[]] {
  return [
    'error',
    ...lockedPolicy.oxlint.restrictions.common,
    ...lockedPolicy.oxlint.restrictions[scope],
  ];
}

export function renderOxlintConfig(
  eslintPluginPath: string,
  qualityPluginPath: string,
  projectConfig: ReturnType<typeof readAgentQualityGateConfig>
): object {
  const javascriptRules = lockedPolicy.oxlint.rules.javascript;
  const typescriptRules = lockedPolicy.oxlint.rules.typescript;
  const javascriptOnlyRules = Object.keys(javascriptRules).filter((name) => !(name in typescriptRules));
  const typescriptOnlyRules = Object.keys(typescriptRules).filter((name) => !(name in javascriptRules));
  const projectRules = Object.fromEntries(projectConfig.plugins.flatMap((plugin) => Object.entries(plugin.rules)));
  return {
    plugins: [
      ...lockedPolicy.oxlint.plugins,
      ...projectConfig.plugins.flatMap((plugin) => (plugin.specifier === null ? [plugin.name] : [])),
    ],
    categories: { correctness: 'off' },
    options: {
      respectEslintDisableDirectives: false,
      typeAware: true,
    },
    jsPlugins: [
      { name: 'eslint-js', specifier: eslintPluginPath },
      { name: 'quality', specifier: qualityPluginPath },
      ...projectConfig.plugins.flatMap(({ name, specifier }) =>
        specifier === null ? [] : [{ name, specifier }]
      ),
    ],
    env: lockedPolicy.oxlint.environment,
    ignorePatterns: ignoredPatterns(),
    rules: {
      ...lockedPolicy.oxlint.rules.common,
      ...projectRules,
    },
    overrides: [
      {
        files: [`**/*.{${lockedPolicy.files.javascriptExtensions.join(',')}}`],
        rules: {
          ...disabledRules(typescriptOnlyRules),
          ...javascriptRules,
          'eslint-js/no-restricted-syntax': restrictedSyntax('javascript'),
        },
      },
      {
        files: [`**/*.{${lockedPolicy.files.typescriptExtensions.join(',')}}`],
        rules: {
          ...disabledRules(javascriptOnlyRules),
          ...typescriptRules,
          'eslint-js/no-restricted-syntax': restrictedSyntax('typescript'),
        },
      },
    ],
  };
}

export function renderFallowConfig(projectConfig: ReturnType<typeof readAgentQualityGateConfig>): object {
  return {
    entry: [
      ...projectConfig.entries,
      ...projectConfig.plugins.flatMap((plugin) => (plugin.entry ? [plugin.entry] : [])),
    ],
    ignorePatterns: [...ignoredPatterns(), ...projectConfig.fallowIgnorePatterns],
    ignoreDependencies: lockedPolicy.fallow.ignoreDependencies,
    ignoreExports: projectConfig.plugins.flatMap((plugin) =>
      plugin.entry ? [{ file: plugin.entry, exports: ['default'] }] : []
    ),
    duplicates: {
      ...lockedPolicy.fallow.duplicates,
      ignore: lockedPolicy.fallow.duplicateFilePatterns,
    },
    health: resolveHealthThresholds(projectConfig),
    rules: lockedPolicy.fallow.rules,
    production: lockedPolicy.fallow.production,
    includeEntryExports: true,
  };
}
