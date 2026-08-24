import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { runLocalPresetSteps } from '../../scripts/self-verify/preset-verify-result.js';

const FIXTURES = join(import.meta.dir, 'fixtures');

describe('runLocalPresetSteps', () => {
  it('runs steps concurrently and prints ok lines in name order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await runLocalPresetSteps(
      ['beta', 'alpha'],
      async (presetName) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(40);
        inFlight -= 1;
        return {
          exitCode: 0,
          stdout: `verify: ok pack ${presetName}\n`,
          stderr: '',
        };
      },
      (presetName) => `failed ${presetName}\n`,
    );

    expect(maxInFlight).toBe(2);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      readFileSync(join(FIXTURES, 'local-preset-steps-ok-stdout.txt'), 'utf8'),
    );
  });

  it('aggregates every failure by sorted name when several steps fail', async () => {
    const result = await runLocalPresetSteps(
      ['zeta', 'alpha'],
      async (presetName) => {
        await delay(0);
        return {
          exitCode: presetName === 'alpha' ? 3 : 5,
          stdout: `verify: ok pack ${presetName}\n`,
          stderr: `${presetName} stderr\n`,
        };
      },
      (presetName) => `verify: local preset "${presetName}" failed\n`,
    );

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe(
      readFileSync(join(FIXTURES, 'local-preset-steps-multi-failure-stderr.txt'), 'utf8'),
    );
  });
});
