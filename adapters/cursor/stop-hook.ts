#!/usr/bin/env bun

import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '../../config/global-config/global-config.js';
import {
  decideFollowUp,
  executeQualityGateForCwd,
  followUpForSettledResult,
} from '../../gate/quality-gate-run/quality-gate-run.js';
import type { RegisterQualityGateOptions } from '../../gate/quality-gate-run/quality-gate-run.js';
import { runStdinJsonHook } from '../hooks/stdin-json-hook.js';

import { transcriptEndsWithAskQuestion } from './transcript-ask-question.js';
import * as v from 'valibot';

export const CURSOR_STOP_HOOK_STATUSES = ['completed', 'aborted', 'error'] as const;

const CursorStopHookInputSchema = v.object({
  status: v.picklist(CURSOR_STOP_HOOK_STATUSES),
  workspace_roots: v.array(v.string()),
  loop_count: v.optional(v.number()),
  transcript_path: v.optional(v.nullable(v.string())),
});

function isStopHookInput(value: unknown): value is CursorStopHookInput {
  return v.is(CursorStopHookInputSchema, value);
}

export async function selectWorkspaceCwd(
  workspaceRoots: readonly string[],
  options: RegisterQualityGateOptions = {},
): Promise<string | undefined> {
  const config = await readGlobalQualityGateConfig(options.configPath);
  let match: { cwd: string; projectRootLength: number } | undefined;
  for (const cwd of workspaceRoots) {
    const project = findProjectForCwd(cwd, config.projects);
    if (project === undefined) {
      continue;
    }
    if (match === undefined || project.root.length > match.projectRootLength) {
      match = { cwd, projectRootLength: project.root.length };
    }
  }
  return match?.cwd;
}

export async function handleCursorStop(
  input: CursorStopHookInput,
  options: RegisterQualityGateOptions = {},
): Promise<CursorStopHookOutput> {
  if (input.status !== 'completed') {
    return {};
  }
  if (
    typeof input.transcript_path === 'string' &&
    transcriptEndsWithAskQuestion(input.transcript_path)
  ) {
    return {};
  }
  const cwd = await selectWorkspaceCwd(input.workspace_roots, options);
  if (cwd === undefined) {
    return {};
  }
  const followUp = await followUpForSettledResult(await executeQualityGateForCwd(cwd, options));
  const decision = decideFollowUp(followUp, input.loop_count ?? 0);
  if (decision.action === 'none') {
    return {};
  }
  return { followup_message: decision.message };
}

if (import.meta.main) {
  await runStdinJsonHook((value) => (isStopHookInput(value) ? value : undefined), handleCursorStop);
}

export type CursorStopHookStatus = (typeof CURSOR_STOP_HOOK_STATUSES)[number];

export type CursorStopHookInput = {
  status: CursorStopHookStatus;
  workspace_roots: string[];
  loop_count?: number;
  transcript_path?: string | null;
};

export type CursorStopHookOutput = {
  followup_message?: string;
};
