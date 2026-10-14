import { describe, expect, it } from 'bun:test';

import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';
import {
  applyConfiguredRules,
  parsePresetConfig,
} from 'agent-quality-gate/internal/presets/layout/gate-config.ts';

describe('layout gate-config', () => {
  it('does not interpret flat layout options as sections', () => {
    expect(parsePresetConfig({ directories: ['app/app'], policy: 'application' })).toBeUndefined();
    expect(parsePresetConfig({ allowedRootModules: ['config.ts'] })).toBeUndefined();
  });

  it('parses nested layout sections', () => {
    expect(
      parsePresetConfig({
        placement: {
          directories: ['app/components/ui'],
          maxDepth: { 'app/components/ui': 2, ignored: 3 },
          maxFilesPerDirectory: { 'app/components/ui': 12 },
        },
        testColocation: { policy: 'aqg-repository' },
        packages: {
          allowedRootModules: ['config.ts'],
          declaredDependencies: { server: ['shared'] },
          privatePackages: ['visual'],
        },
      }),
    ).toEqual({
      placement: {
        directories: ['app/components/ui'],
        forbidConcernPrefix: [],
        maxDepth: { 'app/components/ui': 2 },
        maxFilesPerDirectory: { 'app/components/ui': 12 },
        rootExceptions: {},
        routeCompositionRoots: {},
      },
      testColocation: { policy: 'aqg-repository' },
      packages: {
        allowedRootModules: ['config.ts'],
        alwaysAllowedDependencies: [],
        compositionDirectories: [],
        declaredDependencies: { server: ['shared'] },
        nonProductionDirectories: [],
        privatePackages: ['visual'],
        testDirectories: [],
        testImportablePrivatePackages: [],
      },
    });
  });

  it('marks invalid testColocation policy', () => {
    expect(parsePresetConfig({ testColocation: { policy: 'nope' } })).toEqual({
      testColocationInvalid: true,
    });
  });

  it('enables packages/package-boundaries when packages section is present', () => {
    const rules: Record<string, OxlintRuleSetting> = {
      'packages/package-boundaries': { severity: 'off', phase: 'boundaries' },
      'module-placement/module-placement': { severity: 'error', phase: 'boundaries' },
    };
    applyConfiguredRules(rules, {
      placement: { directories: ['app/app'] },
      packages: {
        allowedRootModules: ['config.ts'],
        declaredDependencies: { server: ['shared'] },
        privatePackages: ['visual'],
      },
    });
    expect(rules['packages/package-boundaries']).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: {
        allowedRootModules: ['config.ts'],
        alwaysAllowedDependencies: [],
        compositionDirectories: [],
        declaredDependencies: { server: ['shared'] },
        nonProductionDirectories: [],
        privatePackages: ['visual'],
        testDirectories: [],
        testImportablePrivatePackages: [],
      },
    });
    expect(rules['module-placement/module-placement']).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: {
        directories: ['app/app'],
        rootExceptions: {},
        forbidConcernPrefix: [],
        maxDepth: {},
      },
    });
  });

  it('returns undefined for an empty bag', () => {
    expect(parsePresetConfig({})).toBeUndefined();
  });
});
