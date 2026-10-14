import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';

import { join } from 'node:path';
import { readTextFile } from '#system/process/files/files.ts';

import { describe, expect, it } from 'bun:test';

import { followUpForSettledResult } from '#system/gate/quality-gate-run/quality-gate-run.ts';
import { VERIFY_FAILURE_LOG_RELATIVE_PATH } from '#system/gate/quality-gate-run/quality-gate-run.ts';
import { getOptionalEnv, setEnv } from '#system/gate/read-env/read-env.ts';
import type { Diagnostic } from '#system/gate/run/check-result.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const { makeTempDirectory } = useTrackedTempDirectories();

describe('followUpForSettledResult agent run log', () => {
  it('records both the trimmed preview and the full diagnostics', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-agent-log-');
    const home = await makeTempDirectory('aqg-home-agent-log-');
    const previousHome = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
    const previousLogDir = getOptionalEnv('AQG_AGENT_RUN_LOG_DIR');
    setEnv('AGENT_QUALITY_GATE_HOME', home);
    setEnv('AQG_AGENT_RUN_LOG_DIR', 'agent-run-logs-test');
    try {
      const diagnostics: Diagnostic[] = Array.from({ length: 120 }, (_, index) => ({
        source: 'test',
        ruleId: `test/rule-${String(index)}`,
        severity: 'error',
        message: `unique finding ${String(index)} ${'z'.repeat(80)}`,
        location: { path: `src/file-${String(index)}.ts`, line: 1, column: 1 },
      }));
      const message = await followUpForSettledResult({
        kind: 'ran',
        projectRoot,
        result: { exitCode: 1, diagnostics },
      });
      if (message === undefined) {
        throw new Error('expected follow-up message');
      }
      const dumps = await readdir(join(home, 'agent-run-logs-test'));
      expect(dumps.length).toBe(1);
      const name = dumps[0];
      if (name === undefined) {
        throw new Error('expected agent run log dump');
      }
      const dump = await readTextFile(join(home, 'agent-run-logs-test', name));
      expect(dump).toContain(message);
      expect(dump).toContain('--- full (');
      const logged = await readTextFile(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH));
      // The spill file frames the trimmed message tail with a separator; the
      // agent run log must carry the preview and every spilled content line.
      const spilledContent = logged
        .trimEnd()
        .split('\n')
        .filter((line) => line !== '--- additional model output ---');
      expect(spilledContent.length).toBeGreaterThan(0);
      for (const line of spilledContent) {
        expect(dump).toContain(line);
      }
      expect(dump).toContain('unique finding 119');
    } finally {
      setEnv('AGENT_QUALITY_GATE_HOME', previousHome);
      setEnv('AQG_AGENT_RUN_LOG_DIR', previousLogDir);
    }
  });

  it('does not write full logs when agentRunLogs is disabled', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-agent-log-disabled-');
    const home = await makeTempDirectory('aqg-home-agent-log-disabled-');
    const previousHome = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
    setEnv('AGENT_QUALITY_GATE_HOME', home);
    try {
      const message = await followUpForSettledResult({
        kind: 'ran',
        projectRoot,
        result: {
          exitCode: 1,
          diagnostics: [{ source: 'test', severity: 'error', message: 'failure' }],
        },
        agentRunLogs: false,
      });
      expect(message).toContain('failure');
      expect(existsSync(join(home, 'agent-run-logs-test'))).toBe(false);
    } finally {
      setEnv('AGENT_QUALITY_GATE_HOME', previousHome);
    }
  });
});
