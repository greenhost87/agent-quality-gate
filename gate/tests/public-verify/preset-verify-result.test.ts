import { expect, test } from 'bun:test';

import { runLocalPresetSteps } from '../../public-verify/preset-verify-result.js';

test('runLocalPresetSteps runs preset work sequentially when requested', async () => {
  const events: string[] = [];
  const result = await runLocalPresetSteps(
    ['second', 'first'],
    async (presetName) => {
      events.push(`start:${presetName}`);
      await Promise.resolve();
      events.push(`end:${presetName}`);
      return { exitCode: 0, stdout: `${presetName}\n`, stderr: '' };
    },
    (presetName) => `failed:${presetName}\n`,
    'sequential',
  );

  expect(events).toEqual(['start:second', 'end:second', 'start:first', 'end:first']);
  expect(result.exitCode).toBe(0);
});
