import { describe, expect, it } from 'bun:test';

import * as sharedVerify from 'agent-quality-gate/shared/verify';
import * as sharedOxlint from 'agent-quality-gate/shared/oxlint';
import * as testingOxlint from 'agent-quality-gate/testing/oxlint';
import { HOT, repeat } from 'agent-quality-gate/testing/oxlint';

describe('shared package exports', () => {
  it('exposes the supported runtime APIs from each public entrypoint', () => {
    expect(sharedVerify).toHaveProperty('executeVerify');
    expect(sharedVerify).toHaveProperty('writeVerifyStreams');
    expect(sharedVerify).toHaveProperty('parsePresetManifest');
    expect(sharedVerify).toHaveProperty('oxlintRuleIdsFromManifest');
    expect(sharedVerify).toHaveProperty('runLocalPresetSteps');
    expect(sharedOxlint).toHaveProperty('applyConfiguredRule');
    expect(sharedOxlint).toHaveProperty('createOptionsRefCache');
    expect(sharedOxlint).toHaveProperty('astIndex');
    expect(testingOxlint).toHaveProperty('benchCreateOnceRule');
    expect(testingOxlint).toHaveProperty('replayCreateOnceRule');
    expect([sharedVerify, sharedOxlint, testingOxlint]).toHaveLength(3);
  });

  it('exposes executable bench helpers', () => {
    expect(HOT).toBeGreaterThan(0);
    expect(repeat((index) => [`line ${index}`])).toContain('line 0');
  });
});
