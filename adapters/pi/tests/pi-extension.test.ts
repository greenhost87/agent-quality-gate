import { existsSync, realpathSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '../../../config/global-config/global-config.js';
import { registerQualityGate } from '../register-quality-gate.js';
import { activeToolNamesForCwd } from '../verify-tool-visibility.js';
import { VERIFY_TOOL_NAME } from '../../hooks/verify-tool-name.js';
import { executeVerify } from '../../../gate/execute-verify/execute-verify.js';
import { expectRejectedMessage } from '../../../tests/support/expect-rejected.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  createPiExtensionHost,
  createPiProject,
  makePiTempDirectory,
  takePiTempDirectories,
  writePiGlobalConfig,
} from './pi-extension-host.js';

useIsolatedAgentQualityGateHome();

afterEach(async () => {
  await Promise.all(
    takePiTempDirectories().map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('pi extension', () => {
  it('loads a global allowlist and selects the deepest configured ancestor', async () => {
    const configDirectory = await makePiTempDirectory('quality-gate-pi-config-');
    const outer = await makePiTempDirectory('quality-gate-pi-outer-');
    const inner = join(outer, 'nested');
    await mkdir(inner);
    const configPath = await writePiGlobalConfig(configDirectory, {
      projects: [
        { root: outer, entries: ['src/index.ts'] },
        { root: inner, entries: ['src/app.ts'] },
      ],
    });

    const config = await readGlobalQualityGateConfig(configPath);
    const match = findProjectForCwd(join(inner, 'src'), config.projects);

    expect(match?.root).toBe(realpathSync(inner));
    expect(match?.entries).toEqual(['src/app.ts']);
    expect(match?.presets).toEqual([]);
  });

  it('rejects relative roots and duplicated canonical roots', async () => {
    const configDirectory = await makePiTempDirectory('quality-gate-pi-invalid-');
    const project = await makePiTempDirectory('quality-gate-pi-dup-');
    const relativePath = await writePiGlobalConfig(configDirectory, {
      projects: [{ root: 'relative/path', entries: ['src/index.ts'] }],
    });
    const duplicatePath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-dup-config-'),
      {
        projects: [
          { root: project, entries: ['src/index.ts'] },
          { root: project, entries: ['src/main.ts'] },
        ],
      },
    );

    await expectRejectedMessage(
      readGlobalQualityGateConfig(relativePath),
      'root must be an absolute path',
    );
    await expectRejectedMessage(
      readGlobalQualityGateConfig(duplicatePath),
      'project roots must be unique',
    );
  });

  it('runs verify for an allowlisted workspace', async () => {
    const cwd = await createPiProject('clean-function');
    const configPath = await writePiGlobalConfig(await makePiTempDirectory('quality-gate-pi-ok-'), {
      projects: [{ root: cwd, entries: ['src/index.ts'] }],
    });
    const project = findProjectForCwd(
      cwd,
      (await readGlobalQualityGateConfig(configPath)).projects,
    );
    if (project === undefined) {
      throw new Error('expected allowlisted project');
    }

    const result = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
  });

  it('does not expose the verify tool outside the allowlist', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const other = await makePiTempDirectory('quality-gate-pi-other-');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-skip-'),
      {
        projects: [{ root: other, entries: ['src/index.ts'] }],
      },
    );

    expect(
      findProjectForCwd(cwd, (await readGlobalQualityGateConfig(configPath)).projects),
    ).toBeUndefined();
    expect(
      await activeToolNamesForCwd(cwd, ['read', 'bash', VERIFY_TOOL_NAME], configPath),
    ).toEqual(['read', 'bash']);
  });

  it('exposes the verify tool only for an allowlisted workspace', async () => {
    const cwd = await createPiProject('clean-function');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-tool-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    expect(await activeToolNamesForCwd(cwd, ['read', 'bash'], configPath)).toEqual([
      'read',
      'bash',
      VERIFY_TOOL_NAME,
    ]);
    expect(
      await activeToolNamesForCwd(cwd, ['read', VERIFY_TOOL_NAME, 'bash'], configPath),
    ).toEqual(['read', 'bash', VERIFY_TOOL_NAME]);
  });

  it('returns verify diagnostics used for a settled follow-up when the check fails', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-fail-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const project = findProjectForCwd(
      cwd,
      (await readGlobalQualityGateConfig(configPath)).projects,
    );
    if (project === undefined) {
      throw new Error('expected allowlisted project');
    }

    const result = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
    });
    const diagnostics = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(diagnostics).toContain('eslint(no-debugger)');
  });

  it('allows settlement when verify passes', async () => {
    const cwd = await createPiProject('clean-function');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-pass-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const project = findProjectForCwd(
      cwd,
      (await readGlobalQualityGateConfig(configPath)).projects,
    );
    if (project === undefined) {
      throw new Error('expected allowlisted project');
    }

    const result = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
    });

    expect(result.exitCode).toBe(0);
  });

  it('creates one global YAML configuration', async () => {
    const cwd = await createPiProject('clean-function');
    const configPath = join(
      await makePiTempDirectory('quality-gate-pi-new-config-'),
      'config',
      'config.yaml',
    );
    const host = createPiExtensionHost();

    registerQualityGate(host.pi, { configPath });
    await host.emitSessionStart(cwd);

    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(join(configPath, '..', 'config.example.yaml'))).toBe(false);
    await host.emitSessionStart(cwd);
    expect(host.notifications).toEqual([
      `agent-quality-gate created ${configPath}. Add a project with root ${cwd} and project-relative entry globs, then start a new Pi session.`,
    ]);
  });

  it('does not subscribe to agent lifecycle outside the allowlist', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const other = await makePiTempDirectory('quality-gate-pi-unbind-');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-unbind-config-'),
      {
        projects: [{ root: other, entries: ['src/index.ts'] }],
      },
    );
    const host = createPiExtensionHost();

    registerQualityGate(host.pi, { configPath });
    expect(host.subscribed).toEqual(['session_start']);

    await host.emitSessionStart(cwd);
    await host.emitAgentSettled(cwd);

    expect(host.subscribed).toEqual(['session_start']);
    expect(host.registeredTools).toEqual([]);
    expect(host.activeTools()).toEqual(['read', 'bash']);
    expect(host.followUps).toEqual([]);
  });

  it('binds verify and agent lifecycle only after session_start in an allowlisted workspace', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-bind-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const host = createPiExtensionHost();

    registerQualityGate(host.pi, { configPath });
    expect(host.subscribed).toEqual(['session_start']);

    await host.emitSessionStart(cwd);
    expect(host.subscribed).toEqual(['session_start', 'agent_settled']);
    expect(host.registeredTools).toEqual([
      {
        name: VERIFY_TOOL_NAME,
        promptSnippet: 'Run Oxlint and Fallow quality checks for the configured workspace',
        promptGuidelines: [
          'The stop/settled gate already runs verify; do not call verify after every JavaScript or TypeScript edit.',
          'Call verify mid-task only when you want earlier feedback; on failure, fix only the listed source-file violations and do not search for verify tooling or quality-gate packages.',
          'Do not consider the task complete while the settle/stop verify follow-up still reports failures.',
        ],
      },
    ]);
    expect(host.activeTools()).toContain(VERIFY_TOOL_NAME);

    await host.emitSessionStart(cwd);
    expect(host.subscribed).toEqual(['session_start', 'agent_settled']);

    await host.emitAgentSettled(cwd);
    expect(host.followUps.join('\n')).toContain('eslint(no-debugger)');
  });

  it('lets an allowlisted workspace settle when verify passes', async () => {
    const cwd = await createPiProject('clean-function');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-settle-ok-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const host = createPiExtensionHost();

    registerQualityGate(host.pi, { configPath });
    await host.emitSessionStart(cwd);
    await host.emitAgentSettled(cwd);

    expect(host.followUps).toEqual([]);
  });

  it('caps follow-ups on repeated failed settles and escalates on the last attempt', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-budget-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const host = createPiExtensionHost();

    registerQualityGate(host.pi, { configPath });
    await host.emitSessionStart(cwd);

    await host.emitAgentSettled(cwd);
    await host.emitAgentSettled(cwd);
    await host.emitAgentSettled(cwd);
    expect(host.followUps).toHaveLength(3);
    expect(host.followUps[0]).toContain('eslint(no-debugger)');
    expect(host.followUps[0]).not.toContain('Retry budget exhausted');
    expect(host.followUps[2]).toContain(
      'Retry budget exhausted. Stop and report the blocker to the user.',
    );

    await host.emitAgentSettled(cwd);
    expect(host.followUps).toHaveLength(3);
  });
});
