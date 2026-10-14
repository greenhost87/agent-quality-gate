import { describe, expect, it } from 'bun:test';

import { runMcpVerify } from '#system/gate/mcp-verify/mcp-verify.js';
import { expectFollowUpViolationText } from './stop-hook-assertions.js';

type McpVerifyFixtures = {
  makeTempDirectory: (prefix: string) => Promise<string>;
  writeGlobalConfig: (directory: string, value: object) => Promise<string>;
  createProject: (fixtureCase: 'clean-function' | 'debugger-with-export') => Promise<string>;
  setupConfiguredProject: (
    fixtureCase: 'clean-function' | 'debugger-with-export',
    prefix: string,
  ) => Promise<{ cwd: string; configPath: string }>;
};

/** Shared runMcpVerify scenario suite; `prefix` namespaces temp directories per adapter. */
export function describeMcpVerifyScenarios(
  label: string,
  fixtures: McpVerifyFixtures,
  prefix: string,
): void {
  async function runConfiguredVerify(
    fixtureCase: 'clean-function' | 'debugger-with-export',
    prefixSuffix: string,
  ): Promise<Awaited<ReturnType<typeof runMcpVerify>>> {
    const { cwd, configPath } = await fixtures.setupConfiguredProject(
      fixtureCase,
      `${prefix}-${prefixSuffix}-`,
    );
    return runMcpVerify(cwd, { configPath });
  }

  describe(label, () => {
    it('returns isError when verify fails for a configured project', async () => {
      const result = await runConfiguredVerify('debugger-with-export', 'fail');
      expect(result.isError).toBe(true);
      expectFollowUpViolationText(result.text);
    });

    it('returns ok text when verify passes', async () => {
      const result = await runConfiguredVerify('clean-function', 'pass');
      expect(result.isError).toBe(false);
      expect(result.text).toContain('verify: ok');
    });

    it('skips without error for an unconfigured workspace', async () => {
      const cwd = await fixtures.createProject('debugger-with-export');
      const other = await fixtures.makeTempDirectory(`${prefix}-other-`);
      const configPath = await fixtures.writeGlobalConfig(
        await fixtures.makeTempDirectory(`${prefix}-skip-`),
        {
          projects: [{ root: other, entries: ['src/index.ts'] }],
        },
      );

      const result = await runMcpVerify(cwd, { configPath });
      expect(result.isError).toBe(false);
      expect(result.text).toContain('No configured agent-quality-gate project');
    });
  });
}
