import { existsSync, realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '#system/config/global-config/global-config.js';
import { activeToolNamesForCwd } from '../verify-tool-visibility.js';
import { VERIFY_TOOL_NAME } from '#adapters/hooks/verify-tool-name.js';
import { executeVerify } from '#system/gate/run/execute-verify.js';
import { streamResultFromVerifyResult } from '#system/gate/public-verify/verify-streams.js';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import { removeTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.js';
import { expectBudgetExhaustedText } from '#system/tests/support/stop-hook-assertions.js';
import {
  createPiProject,
  emitPiAgentEnd,
  expectPiSessionBound,
  makePiTempDirectory,
  registerPiHost,
  setupAllowlistedProject,
  setupPiWorkspace,
  setupUnconfiguredPiHost,
  takePiTempDirectories,
} from './pi-extension-host.js';
import { projectConfig, writeYamlConfig } from '#system/tests/support/config-fixtures.js';

useIsolatedAgentQualityGateHome();

afterEach(async () => {
  await removeTrackedTempDirectories(takePiTempDirectories());
});

describe('pi extension', () => {
  it('loads a global allowlist and selects the deepest configured ancestor', async () => {
    const configDirectory = await makePiTempDirectory('quality-gate-pi-config-');
    const outer = await makePiTempDirectory('quality-gate-pi-outer-');
    const inner = join(outer, 'nested');
    await mkdir(inner);
    const configPath = await writeYamlConfig(configDirectory, {
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

  it('skips relative roots and duplicated canonical roots', async () => {
    const configDirectory = await makePiTempDirectory('quality-gate-pi-invalid-');
    const project = await makePiTempDirectory('quality-gate-pi-dup-');
    const relativePath = await writeYamlConfig(configDirectory, projectConfig('relative/path'));
    const duplicatePath = await writeYamlConfig(
      await makePiTempDirectory('quality-gate-pi-dup-config-'),
      {
        projects: [
          { root: project, entries: ['src/index.ts'] },
          { root: project, entries: ['src/main.ts'] },
        ],
      },
    );

    expect(await readGlobalQualityGateConfig(relativePath)).toEqual({ projects: [], warnings: [] });
    const duplicates = await readGlobalQualityGateConfig(duplicatePath);
    expect(duplicates.projects).toHaveLength(1);
    expect(duplicates.projects[0]?.root).toBe(realpathSync(project));
    expect(duplicates.projects[0]?.entries).toEqual(['src/index.ts']);
  });

  it('runs verify for an allowlisted workspace', async () => {
    const { project } = await setupAllowlistedProject('clean-function', 'quality-gate-pi-ok-');

    const result = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
    });

    expect(result.exitCode).toBe(0);
    expect(streamResultFromVerifyResult(result).stdout).toContain('verify: ok');
  });

  it('does not expose the verify tool outside the allowlist', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const other = await makePiTempDirectory('quality-gate-pi-other-');
    const configPath = await writeYamlConfig(
      await makePiTempDirectory('quality-gate-pi-skip-'),
      projectConfig(other),
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
    const configPath = await writeYamlConfig(
      await makePiTempDirectory('quality-gate-pi-tool-'),
      projectConfig(cwd),
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
    const { project } = await setupAllowlistedProject(
      'debugger-with-export',
      'quality-gate-pi-fail-',
    );

    const result = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
    });
    const streams = streamResultFromVerifyResult(result);
    const diagnostics = `${streams.stdout}${streams.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(diagnostics).toContain('no-debugger');
  });

  it('waits for all current findings before suggesting another verify run', async () => {
    const { cwd, host } = await setupPiWorkspace('quality-gate-pi-retry-guidance-');
    const result = await host.executeTool(VERIFY_TOOL_NAME, cwd);
    const output = result.content.map((item) => item.text).join('\n');

    expect(output).toContain('no-debugger');
    expect(output).toContain(
      'Fix all current findings before calling verify again; do not rerun it after each edit.',
    );
  });

  it('creates one global YAML configuration', async () => {
    const cwd = await createPiProject('clean-function');
    const configPath = join(
      await makePiTempDirectory('quality-gate-pi-new-config-'),
      'config',
      'config.yaml',
    );
    const host = registerPiHost(configPath);
    await host.emitSessionStart(cwd);

    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(join(configPath, '..', 'config.example.yaml'))).toBe(false);
    await host.emitSessionStart(cwd);
    expect(host.notifications).toEqual([
      `agent-quality-gate created ${configPath}. Add a project with root ${cwd} and project-relative entry globs, then start a new Pi session.`,
    ]);
  });

  it('activates a newly configured workspace on reload', async () => {
    const cwd = await createPiProject('clean-function');
    const other = await makePiTempDirectory('quality-gate-pi-reload-other-');
    const configDirectory = await makePiTempDirectory('quality-gate-pi-reload-config-');
    const configPath = await writeYamlConfig(configDirectory, projectConfig(other));
    const host = registerPiHost(configPath);
    await host.emitSessionStart(cwd);
    expect(host.registeredTools).toEqual([]);

    await writeYamlConfig(configDirectory, projectConfig(cwd));
    await host.emitSessionStart(cwd, 'reload');

    expect(host.registeredTools.map((tool) => tool.name)).toEqual([VERIFY_TOOL_NAME]);
    expect(host.activeTools()).toContain(VERIFY_TOOL_NAME);
    expect(await emitPiAgentEnd(host, cwd)).toBe('');
  });

  it('does not subscribe to agent lifecycle outside the allowlist', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const other = await makePiTempDirectory('quality-gate-pi-unbind-');
    const host = await setupUnconfiguredPiHost('quality-gate-pi-unbind-config-', other);
    expect(host.subscribed).toEqual(['session_start']);

    await host.emitSessionStart(cwd);
    await host.emitAgentEnd(cwd);

    expect(host.subscribed).toEqual(['session_start']);
    expect(host.registeredTools).toEqual([]);
    expect(host.activeTools()).toEqual(['read', 'bash']);
    expect(host.followUps).toEqual([]);
  });

  it('binds verify and agent lifecycle only after session_start in an allowlisted workspace', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const host = await setupUnconfiguredPiHost('quality-gate-pi-bind-', cwd);
    expect(host.subscribed).toEqual(['session_start']);

    await host.emitSessionStart(cwd);
    expectPiSessionBound(host);
    expect(host.registeredTools).toEqual([
      {
        name: VERIFY_TOOL_NAME,
        promptSnippet: 'Run Oxlint and Fallow quality checks for the configured workspace',
        promptGuidelines: [
          'The completion gate already runs verify; do not call verify after every JavaScript or TypeScript edit.',
          'Call verify mid-task only when you want earlier feedback; on failure, fix only the listed source-file violations and do not search for verify tooling or quality-gate packages.',
          'Do not consider the task complete while the completion-gate verify follow-up still reports failures.',
        ],
      },
    ]);
    expect(host.activeTools()).toContain(VERIFY_TOOL_NAME);

    await host.emitSessionStart(cwd);
    expectPiSessionBound(host);

    expect(await emitPiAgentEnd(host, cwd)).toContain('no-debugger');
  });

  it('does not run the completion gate before retry or compaction recovery', async () => {
    const { cwd, host } = await setupPiWorkspace('quality-gate-pi-recovery-');

    await host.emitAgentEnd(cwd, 'error');
    await host.emitAgentEnd(cwd, 'length');
    await host.emitAgentEnd(cwd, 'aborted');

    expect(host.followUps).toEqual([]);
  });

  it('lets an allowlisted workspace complete when verify passes', async () => {
    const { cwd, host } = await setupPiWorkspace('quality-gate-pi-complete-ok-', 'clean-function');
    expect(await emitPiAgentEnd(host, cwd)).toBe('');
  });

  it('caps follow-ups on repeated failed completions and escalates on the last attempt', async () => {
    const { cwd, host } = await setupPiWorkspace('quality-gate-pi-budget-');

    await host.emitAgentEnd(cwd);
    await host.emitAgentEnd(cwd);
    await host.emitAgentEnd(cwd);
    expect(host.followUps).toHaveLength(3);
    expect(host.followUps[0]).toContain('no-debugger');
    expect(host.followUps[0]).not.toContain('Retry budget exhausted');
    expectBudgetExhaustedText(host.followUps[2]);

    await host.emitAgentEnd(cwd);
    expect(host.followUps).toHaveLength(3);
  });
});
