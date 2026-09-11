import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile } from '../../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import { followUpForSettledResult } from '../../quality-gate-run/quality-gate-run.js';
import { VERIFY_FAILURE_LOG_RELATIVE_PATH } from '../../quality-gate-run/quality-gate-run.js';
import { getOptionalEnv, setEnv } from '../../read-env/read-env.js';
import type { Diagnostic } from '../../execute-verify/check-result.js';

const tempDirectories: string[] = [];

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('followUpForSettledResult agent run log', () => {
  it('records both the trimmed preview and the full diagnostics', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-agent-log-');
    const home = await makeTempDirectory('aqg-home-agent-log-');
    const previousHome = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
    setEnv('AGENT_QUALITY_GATE_HOME', home);
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
      expect(dump).toContain(logged.trimEnd());
    } finally {
      setEnv('AGENT_QUALITY_GATE_HOME', previousHome);
    }
  });
});
