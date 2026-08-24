import * as v from 'valibot';

import type { ClaudeStopHookInput, ClaudeStopHookOutput } from '../claude/stop-hook.types.js';
import { transcriptEndsWithAskUserQuestion } from '../claude/transcript-ask-user-question.js';
import type { CodexStopHookInput, CodexStopHookOutput } from '../codex/stop-hook.types.js';
import { transcriptEndsWithAskUserInput } from '../codex/transcript-ask-user-input.js';
import { handleSessionStopQualityGate } from './handle-session-stop-quality-gate.js';
import type { RegisterQualityGateOptions } from '../../gate/quality-gate-run/quality-gate-run.types.js';
import { installSessionStopHookMain } from './run-session-stop-hook.js';
import { SessionStopHookBaseSchema } from './session-stop-hook-input.js';
import type { StopSessionHarness } from './stop-session-attempts.types.js';

const ClaudeStopHookInputSchema = v.object({
  ...SessionStopHookBaseSchema.entries,
  transcript_path: v.string(),
  background_tasks: v.optional(v.array(v.unknown())),
});

const CodexStopHookInputSchema = v.object({
  ...SessionStopHookBaseSchema.entries,
  transcript_path: v.nullable(v.string()),
});

function isClaudeStopHookInput(value: unknown): value is ClaudeStopHookInput {
  return v.is(ClaudeStopHookInputSchema, value);
}

function isCodexStopHookInput(value: unknown): value is CodexStopHookInput {
  return v.is(CodexStopHookInputSchema, value);
}

function claudeContinuation(message: string): ClaudeStopHookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: message,
    },
  };
}

function codexContinuation(message: string): CodexStopHookOutput {
  return {
    decision: 'block',
    reason: message,
  };
}

export async function handleClaudeStop(
  input: ClaudeStopHookInput,
  options: RegisterQualityGateOptions = {},
): Promise<ClaudeStopHookOutput> {
  return handleSessionStopQualityGate(input, options, {
    harness: 'claude',
    shouldSkip: () =>
      (input.background_tasks !== undefined && input.background_tasks.length > 0) ||
      transcriptEndsWithAskUserQuestion(input.transcript_path),
    formatContinuation: claudeContinuation,
  });
}

export async function handleCodexStop(
  input: CodexStopHookInput,
  options: RegisterQualityGateOptions = {},
): Promise<CodexStopHookOutput> {
  return handleSessionStopQualityGate(input, options, {
    harness: 'codex',
    shouldSkip: () =>
      typeof input.transcript_path === 'string' &&
      transcriptEndsWithAskUserInput(input.transcript_path),
    formatContinuation: codexContinuation,
  });
}

function harnessFromArgv(value: string | undefined): StopSessionHarness | undefined {
  if (value === 'claude' || value === 'codex') {
    return value;
  }
  return undefined;
}

const harness = harnessFromArgv(process.argv[2]);
if (harness === 'claude') {
  installSessionStopHookMain(
    (value) => (isClaudeStopHookInput(value) ? value : undefined),
    handleClaudeStop,
  );
} else if (harness === 'codex') {
  installSessionStopHookMain(
    (value) => (isCodexStopHookInput(value) ? value : undefined),
    handleCodexStop,
  );
}
