import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { runMcpVerify } from '../../../gate/mcp-verify/mcp-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import { readFixture } from '../../../tests/support/fixture-files.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'mcp-verify');

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeGlobalConfig(directory: string, value: object): Promise<string> {
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(configPath, YAML.stringify(value, null, 2));
  return configPath;
}

async function createProject(
  fixtureCase: 'clean-function' | 'debugger-with-export',
): Promise<string> {
  const source = await readFixture(FIXTURES_ROOT, fixtureCase, 'src/index.ts');
  const cwd = await makeTempDirectory('quality-gate-claude-mcp-project-');
  await mkdir(join(cwd, 'src'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'quality-gate-claude-mcp-fixture',
        private: true,
        type: 'module',
        main: 'src/index.ts',
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(join(cwd, 'src', 'index.ts'), source);
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('claude mcp verify', () => {
  it('returns isError when verify fails for a configured project', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-mcp-fail-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const result = await runMcpVerify(cwd, { configPath });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('eslint(no-debugger)');
    expect(result.text).toContain('Fix only the violations listed below');
    expect(result.text).toContain('Do not investigate why the gate complains');
    expect(result.text).toContain(
      'Do not dig into prior verify fixes, agent transcripts, other chat sessions, or git history',
    );
    expect(result.text).toContain('Do not search for verify binaries');
  });

  it('returns ok text when verify passes', async () => {
    const cwd = await createProject('clean-function');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-mcp-pass-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const result = await runMcpVerify(cwd, { configPath });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('verify: ok');
  });

  it('skips without error for an unconfigured workspace', async () => {
    const cwd = await createProject('debugger-with-export');
    const other = await makeTempDirectory('quality-gate-claude-mcp-other-');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-mcp-skip-'),
      {
        projects: [{ root: other, entries: ['src/index.ts'] }],
      },
    );

    const result = await runMcpVerify(cwd, { configPath });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('No configured agent-quality-gate project');
  });
});
