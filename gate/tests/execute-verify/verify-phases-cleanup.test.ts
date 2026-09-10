import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';
import {
  checkPresentedText,
  verifyPresentedText,
} from '../../../tests/support/verify-result-text.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject } = useExecuteVerifyProjects();

function emptyFallowJson(args: readonly string[]): string {
  if (args.includes('--complexity')) {
    return '{"kind":"health","findings":[]}';
  }
  if (args.includes('--skip')) {
    return '{"kind":"combined","check":{"total_issues":0},"dupes":{"clone_groups":[]}}';
  }
  return '{"kind":"dead-code","total_issues":0}';
}

function emptyToolResult(args: readonly string[] = [], name = 'fallow') {
  if (name === 'oxlint') {
    return { exitCode: 0, stdout: '{"diagnostics":[]}', stderr: '' };
  }
  return {
    exitCode: 0,
    stdout: emptyFallowJson(args),
    stderr: '',
  };
}

function ephemeralConfigDirs(projectRoot: string): { fallow: string; oxlint: string } {
  return {
    fallow: join(projectRoot, '.aqg', 'fallow'),
    oxlint: join(projectRoot, '.aqg', 'oxlint'),
  };
}

describe('verify phases ephemeral configs', () => {
  it('removes ephemeral configs after oxlint failure', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'oxlint') {
          return {
            exitCode: 1,
            stdout: JSON.stringify({
              diagnostics: [
                {
                  message: 'debugger',
                  code: 'eslint(no-debugger)',
                  severity: 'error',
                  filename: 'src/index.ts',
                  labels: [{ span: { line: 1, column: 1 } }],
                },
              ],
            }),
            stderr: '',
          };
        }
        return emptyToolResult(options.args, options.name);
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expect(result.exitCode).toBe(1);
    expect(verifyPresentedText(result)).toContain('no-debugger');
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('removes ephemeral configs after oxlint timeout', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'oxlint') {
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'hint:type-aware-timeout\n',
          };
        }
        return emptyToolResult(options.args, options.name);
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expect(result.exitCode).toBe(1);
    expect(checkPresentedText(result)).toContain('hint:type-aware-timeout');
    expect(result.statusStderr ?? '').toContain('hint:type-aware-timeout');
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('removes ephemeral configs when a tool runner throws', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let thrownMessage = '';
    try {
      await executeVerify(
        {
          projectRoot: cwd,
          entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
          skipPresetProjectChecks: true,
        },
        async (options) => {
          await Promise.resolve();
          if (options.name === 'oxlint') {
            throw new Error('oxlint exploded');
          }
          return emptyToolResult(options.args, options.name);
        },
      );
    } catch (error) {
      thrownMessage = error instanceof Error ? error.message : String(error);
    }
    expect(thrownMessage).toBe('oxlint exploded');
    const ephemeral = ephemeralConfigDirs(cwd);
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });
});
