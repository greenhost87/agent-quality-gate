#!/usr/bin/env bun

import { createCli, reportCommandError, runCli } from '../../process/command/command.js';
import { executeVerify } from '../../gate/execute-verify/execute-verify.js';
import type { VerifyResult } from '../../gate/execute-verify/execute-verify.js';
import { formatVerifyOk } from '../../gate/execute-verify/verify-ok-message.js';
import { localVerifyRequest } from './cli.js';
import { verifyLocalPresetPackages } from './preset-baseline-verify.js';
import { rejectCrossPresetImports } from './preset-isolation.js';
import { verifyLocalPresetPacks } from './preset-pack-run.js';
import { firstNonZeroResult } from '../../gate/public-verify/preset-verify-result.js';
import { writeVerifyStreams } from '../../gate/public-verify/verify-streams.js';

function timedOk(label: string, startedAt: number): VerifyResult {
  return {
    exitCode: 0,
    stdout: formatVerifyOk(label, Math.round(performance.now() - startedAt)),
    stderr: '',
  };
}

try {
  await runCli(createCli('verify'), process.argv.slice(2), 'Usage: bun run verify', async () => {
    const isolationStartedAt = performance.now();
    const isolation = rejectCrossPresetImports(process.cwd());
    if (isolation.exitCode !== 0) {
      writeVerifyStreams(isolation);
      process.exitCode = isolation.exitCode;
      return;
    }
    writeVerifyStreams(timedOk('preset isolation', isolationStartedAt));

    const [repository, packages, packs] = await Promise.all([
      executeVerify(localVerifyRequest()),
      verifyLocalPresetPackages(process.cwd()),
      verifyLocalPresetPacks(process.cwd()),
    ]);
    writeVerifyStreams(repository);
    writeVerifyStreams(packages);
    writeVerifyStreams(packs);
    process.exitCode = firstNonZeroResult(repository, packages, packs)?.exitCode ?? 0;
  });
} catch (error) {
  reportCommandError('verify', error instanceof Error ? error : String(error));
  process.exitCode = 2;
}
