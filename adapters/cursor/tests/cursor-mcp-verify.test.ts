import { join } from 'node:path';
import { writeTextFile } from '#system/process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';
import { runMcpVerify } from '#system/gate/mcp-verify/mcp-verify.js';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import { describeMcpVerifyScenarios } from '#system/tests/support/mcp-verify-scenarios.js';
import { createStopHookTestFixtures } from '#system/tests/support/stop-hook-test-fixtures.js';

useIsolatedAgentQualityGateHome();

const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'mcp-verify');
const fixtures = createStopHookTestFixtures('mcp', FIXTURES_ROOT);
const { makeTempDirectory, createProject } = fixtures;

async function writeCorruptConfig(): Promise<string> {
  const configDirectory = await makeTempDirectory('quality-gate-mcp-corrupt-');
  const configPath = join(configDirectory, 'config.yaml');
  await writeTextFile(configPath, 'projects: true\n');
  return configPath;
}

afterEach(fixtures.cleanup);

describeMcpVerifyScenarios('cursor mcp verify', fixtures, 'quality-gate-mcp');

describe('cursor mcp verify', () => {
  it('treats invalid global config shape as unconfigured instead of unavailable', async () => {
    const cwd = await createProject('clean-function');
    const configPath = await writeCorruptConfig();

    const result = await runMcpVerify(cwd, { configPath });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('No configured agent-quality-gate project');
    expect(result.text.toLowerCase()).not.toContain('unavailable');
    expect(result.text).not.toContain(configPath);
    expect(result.text).not.toContain('must contain');
    expect(result.text).not.toContain('oxlint.config');
    expect(result.text).not.toContain('valid YAML');
  });
});
