#!/usr/bin/env bun

import { readGlobalQualityGateConfig } from '../../config/global-config/global-config.js';
import { isConfiguredWorkspaceRoot } from '../../config/linked-checkout/linked-checkout.js';
import {
  decideFollowUp,
  executeQualityGateForCwd,
  followUpForSettledResult,
} from '../../gate/quality-gate-run/quality-gate-run.js';
import type { RegisterQualityGateOptions } from '../../gate/quality-gate-run/quality-gate-run.js';
import { canonicalizePath } from '../../process/files/paths.js';
import { runStdinJsonHook } from '../hooks/stdin-json-hook.js';

import { transcriptEndsWithAskQuestion } from './transcript-ask-question.js';
import * as v from 'valibot';

export const CURSOR_STOP_HOOK_STATUSES = ['completed', 'aborted', 'error'] as const;

const CursorStopHookInputSchema = v.object({
  status: v.picklist(CURSOR_STOP_HOOK_STATUSES),
  workspace_roots: v.array(v.string()),
  loop_count: v.optional(v.number()),
  transcript_path: v.pipe(
    v.optional(v.nullable(v.string())),
    v.transform((value) => value ?? undefined),
  ),
});

export function parseCursorStopInput(value: object): CursorStopHookInput | undefined {
  const result = v.safeParse(CursorStopHookInputSchema, value);
  return result.success ? result.output : undefined;
}

export async function selectWorkspaceCwd(
  workspaceRoots: readonly string[],
  options: RegisterQualityGateOptions = {},
): Promise<string | undefined> {
  const workspaceRootInput = workspaceRoots[0];
  if (workspaceRoots.length !== 1 || workspaceRootInput === undefined) {
    return undefined;
  }
  const workspaceRoot = canonicalizePath(workspaceRootInput);
  const config = await readGlobalQualityGateConfig(options.configPath);
  return isConfiguredWorkspaceRoot(workspaceRoot, config.projects) ? workspaceRoot : undefined;
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
  await runStdinJsonHook(parseCursorStopInput, handleCursorStop);
}

export type CursorStopHookStatus = (typeof CURSOR_STOP_HOOK_STATUSES)[number];

export type CursorStopHookInput = {
  status: CursorStopHookStatus;
  workspace_roots: string[];
  loop_count?: number;
  transcript_path?: string;
};

export type CursorStopHookOutput = {
  followup_message?: string;
};
