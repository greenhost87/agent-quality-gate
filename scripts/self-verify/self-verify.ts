#!/usr/bin/env bun

import { rejectUnexpectedArgument, reportCommandError } from '../../process/command/command.js';
import { executeVerify } from '../../gate/execute-verify/execute-verify.js';
import type { VerifyResult } from '../../gate/execute-verify/execute-verify.types.js';
import { formatVerifyOk } from '../../gate/execute-verify/verify-ok-message.js';
import { localVerifyRequest, writeVerifyStreams } from './cli.js';
import { verifyLocalPresetPackages } from './preset-baseline-verify.js';
import { rejectCrossPresetImports } from './preset-isolation.js';
import { verifyLocalPresetPacks } from './preset-pack-run.js';
import { firstNonZeroResult } from './preset-verify-result.js';
import { rejectMisplacedTests } from './test-colocation.js';

function timedOk(label: string, startedAt: number): VerifyResult {
  return {
    exitCode: 0,
    stdout: formatVerifyOk(label, Math.round(performance.now() - startedAt)),
    stderr: '',
  };
}

if (rejectUnexpectedArgument('verify')) {
  process.exitCode = 2;
} else {
  try {
    const isolationStartedAt = performance.now();
    const colocationStartedAt = performance.now();
    const [isolation, colocation] = await Promise.all([
      Promise.resolve(rejectCrossPresetImports(process.cwd())),
      Promise.resolve(rejectMisplacedTests(process.cwd())),
    ]);
    const staticFailure = firstNonZeroResult(isolation, colocation);
    if (staticFailure !== undefined) {
      writeVerifyStreams(staticFailure);
      process.exitCode = staticFailure.exitCode;
    } else {
      writeVerifyStreams(timedOk('preset isolation', isolationStartedAt));
      writeVerifyStreams(timedOk('test colocation', colocationStartedAt));

      const [repository, packages, packs] = await Promise.all([
        executeVerify(localVerifyRequest()),
        verifyLocalPresetPackages(process.cwd()),
        verifyLocalPresetPacks(process.cwd()),
      ]);
      writeVerifyStreams(repository);
      writeVerifyStreams(packages);
      writeVerifyStreams(packs);
      process.exitCode = firstNonZeroResult(repository, packages, packs)?.exitCode ?? 0;
    }
  } catch (error) {
    reportCommandError('verify', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}
