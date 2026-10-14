#!/usr/bin/env bun

import { join } from 'node:path';

import { createCli, reportCommandError, runCli } from '#system/process/command/command.js';
import type { StreamResult } from '#system/gate/public-verify/verify-streams.js';
import { formatFmtOk } from '#system/gate/run/verify-ok-message.js';
import { exitCodeAfterWritingResults } from '#system/gate/public-verify/verify-streams.js';
import {
  formatLocalPresetPacks,
  listLocalPresetPackFmtNames,
} from '../self-verify/preset-pack-run.js';
import { resolveProjectRoot } from '../self-verify/repo-walk.js';
import { runCapturedProcess } from '#system/process/run-command/run-command.js';

export function repositoryOxfmtArgs(packFmtNames: readonly string[]): string[] {
  return ['.', ...packFmtNames.map((name) => `!presets/${name}/**`)];
}

async function formatLocalRepository(projectRoot: string): Promise<StreamResult> {
  const root = resolveProjectRoot(projectRoot);
  const startedAt = performance.now();
  const packFmtNames = await listLocalPresetPackFmtNames(root);
  const oxfmt = join(root, 'node_modules', 'oxfmt', 'bin', 'oxfmt');
  const result = await runCapturedProcess({
    command: oxfmt,
    args: repositoryOxfmtArgs(packFmtNames),
    cwd: root,
  });
  if (result.exitCode !== 0) {
    return result;
  }
  return {
    exitCode: 0,
    stdout: formatFmtOk('repository', Math.round(performance.now() - startedAt)),
    stderr: '',
  };
}

if (import.meta.main) {
  try {
    await runCli(createCli('fmt'), process.argv.slice(2), 'Usage: bun run fmt', async () => {
      const projectRoot = process.cwd();
      process.exitCode = exitCodeAfterWritingResults(
        ...(await Promise.all([
          formatLocalRepository(projectRoot),
          formatLocalPresetPacks(projectRoot),
        ])),
      );
    });
  } catch (error) {
    reportCommandError('fmt', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}
