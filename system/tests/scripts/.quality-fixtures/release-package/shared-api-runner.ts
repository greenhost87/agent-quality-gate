import * as verify from 'agent-quality-gate/shared/verify';
import * as oxlint from 'agent-quality-gate/shared/oxlint';
import * as testing from 'agent-quality-gate/testing/oxlint';

if (
  typeof verify.executeVerify !== 'function' ||
  typeof verify.writeVerifyStreams !== 'function' ||
  typeof oxlint.applyConfiguredRule !== 'function' ||
  typeof oxlint.createOptionsRefCache !== 'function' ||
  typeof testing.benchCreateOnceRule !== 'function' ||
  typeof testing.replayCreateOnceRule !== 'function' ||
  testing.HOT <= 0 ||
  !testing.repeat((index) => [`line ${index}`]).includes('line 0')
) {
  throw new Error('installed public API did not execute');
}
