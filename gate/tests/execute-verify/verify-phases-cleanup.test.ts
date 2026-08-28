import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject } = useExecuteVerifyProjects();

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
            stdout: 'eslint(no-debugger):src/index.ts:1:1\n',
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.includes('eslint(no-debugger)')).toBe(true);
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
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.includes('hint:type-aware-timeout')).toBe(true);
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
          return { exitCode: 0, stdout: '', stderr: '' };
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
