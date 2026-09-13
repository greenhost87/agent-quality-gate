import { Type } from 'typebox';

import type {
  AgentEndEvent,
  QualityGateExtensionApi,
  SessionStartEvent,
} from './extension-api.types.js';
import {
  createGlobalQualityGateConfig,
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '../../config/global-config/global-config.js';
import {
  decideFollowUp,
  executeQualityGateForCwd,
  followUpForSettledResult,
  toolOutput,
} from '../../gate/quality-gate-run/quality-gate-run.js';
import type { RegisterQualityGateOptions } from '../../gate/quality-gate-run/quality-gate-run.js';
import { VERIFY_TOOL_NAME } from '../hooks/verify-tool-name.js';
import { branchEndsWithAskUser } from './session-ask-user.js';
import { activeToolNamesForCwd } from './verify-tool-visibility.js';

const VERIFY_PROMPT_SNIPPET = 'Run Oxlint and Fallow quality checks for the configured workspace';

const VERIFY_PROMPT_GUIDELINES = [
  'The completion gate already runs verify; do not call verify after every JavaScript or TypeScript edit.',
  'Call verify mid-task only when you want earlier feedback; on failure, fix only the listed source-file violations and do not search for verify tooling or quality-gate packages.',
  'Do not consider the task complete while the completion-gate verify follow-up still reports failures.',
];

const NON_TERMINAL_STOP_REASONS = new Set(['aborted', 'error', 'length']);

function agentEndCanSettle(event: AgentEndEvent | SessionStartEvent): boolean {
  if (!('messages' in event)) {
    return false;
  }
  const stopReason = event.messages.findLast((message) => message.role === 'assistant')?.stopReason;
  return stopReason === undefined || !NON_TERMINAL_STOP_REASONS.has(stopReason);
}

async function workspaceIsConfigured(
  cwd: string,
  options: RegisterQualityGateOptions,
): Promise<boolean> {
  return (
    findProjectForCwd(cwd, (await readGlobalQualityGateConfig(options.configPath)).projects) !==
    undefined
  );
}

function registerVerifyTool(
  pi: QualityGateExtensionApi,
  options: RegisterQualityGateOptions,
): void {
  pi.registerTool({
    name: VERIFY_TOOL_NAME,
    label: 'Verify',
    description:
      'Run the agent-quality-gate Oxlint and Fallow checks for the configured workspace.',
    parameters: Type.Object({}),
    promptSnippet: VERIFY_PROMPT_SNIPPET,
    promptGuidelines: VERIFY_PROMPT_GUIDELINES,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const run = await executeQualityGateForCwd(ctx.cwd, options);
      return {
        content: [{ type: 'text', text: await toolOutput(run) }],
        details: {},
      };
    },
  });
}

async function bindConfiguredWorkspace(
  pi: QualityGateExtensionApi,
  cwd: string,
  options: RegisterQualityGateOptions,
): Promise<void> {
  let followUpAttempts = 0;
  registerVerifyTool(pi, options);
  pi.setActiveTools(await activeToolNamesForCwd(cwd, pi.getActiveTools(), options.configPath));
  pi.on('agent_end', async (event, ctx) => {
    const branch = ctx.sessionManager?.getBranch() ?? [];
    if (!agentEndCanSettle(event) || branchEndsWithAskUser(branch)) {
      return;
    }
    const followUp = await followUpForSettledResult(
      await executeQualityGateForCwd(ctx.cwd, options),
    );
    if (followUp === undefined) {
      followUpAttempts = 0;
      return;
    }
    const decision = decideFollowUp(followUp, followUpAttempts);
    if (decision.action === 'none') {
      return;
    }
    followUpAttempts += 1;
    pi.sendMessage(
      {
        customType: 'agent-quality-gate',
        content: decision.message,
        display: true,
      },
      { triggerTurn: true, deliverAs: 'followUp' },
    );
  });
}

export function registerQualityGate(
  pi: QualityGateExtensionApi,
  options: RegisterQualityGateOptions = {},
): void {
  let bound = false;
  pi.on('session_start', async (_event, ctx) => {
    await Promise.resolve();
    const createdConfigPath = await createGlobalQualityGateConfig(options.configPath);
    if (createdConfigPath !== undefined) {
      ctx.ui.notify(
        `agent-quality-gate created ${createdConfigPath}. Add a project with root ${ctx.cwd} and project-relative entry globs, then start a new Pi session.`,
        'info',
      );
    }
    if (bound || !(await workspaceIsConfigured(ctx.cwd, options))) {
      return;
    }
    bound = true;
    await bindConfiguredWorkspace(pi, ctx.cwd, options);
  });
}
