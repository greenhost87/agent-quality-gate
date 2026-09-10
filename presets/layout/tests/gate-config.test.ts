import { describe, expect, it } from 'bun:test';

import type { OxlintRuleSetting } from '../../../preset-catalog/oxlint-config/write-oxlint-config.ts';
import { applyConfiguredRules, parsePresetConfig, resolveRawConfig } from '../gate-config.ts';

describe('layout gate-config', () => {
  it('merges legacy presetConfig keys into layout sections', () => {
    expect(
      resolveRawConfig({
        'module-placement': { directories: ['app/app'] },
        'test-colocation': { policy: 'application' },
        packages: { allowedRootModules: ['config.ts'] },
      }),
    ).toEqual({
      placement: { directories: ['app/app'] },
      testColocation: { policy: 'application' },
      packages: { allowedRootModules: ['config.ts'] },
    });
  });

  it('prefers presetConfig.layout over legacy keys', () => {
    expect(
      resolveRawConfig({
        layout: {
          placement: { directories: ['from-layout'] },
          packages: { privatePackages: ['visual'] },
        },
        'module-placement': { directories: ['legacy'] },
        packages: { allowedRootModules: ['config.ts'] },
      }),
    ).toEqual({
      placement: { directories: ['from-layout'] },
      packages: { privatePackages: ['visual'] },
    });
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
        declaredDependencies: { server: ['shared'] },
        privatePackages: ['visual'],
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
        declaredDependencies: { server: ['shared'] },
        privatePackages: ['visual'],
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
    expect(resolveRawConfig({})).toBeUndefined();
  });
});
