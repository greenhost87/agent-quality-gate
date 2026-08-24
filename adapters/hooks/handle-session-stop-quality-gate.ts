import {
  decideFollowUp,
  executeQualityGateForCwd,
  followUpForSettledResult,
} from '../../gate/quality-gate-run/quality-gate-run.js';
import type { RegisterQualityGateOptions } from '../../gate/quality-gate-run/quality-gate-run.types.js';
import type {
  SessionStopQualityGateContext,
  SessionStopQualityGateInput,
} from './handle-session-stop-quality-gate.types.js';
import {
  readStopSessionAttempts,
  resetStopSessionAttempts,
  writeStopSessionAttempts,
} from './stop-session-attempts.js';

export async function handleSessionStopQualityGate<TOutput extends object>(
  input: SessionStopQualityGateInput,
  options: RegisterQualityGateOptions,
  context: SessionStopQualityGateContext<TOutput>,
): Promise<TOutput | Record<string, never>> {
  if (context.shouldSkip()) {
    resetStopSessionAttempts(context.harness, input.session_id);
    return {};
  }
  const followUp = await followUpForSettledResult(
    await executeQualityGateForCwd(input.cwd, options),
  );
  if (followUp === undefined) {
    resetStopSessionAttempts(context.harness, input.session_id);
    return {};
  }
  const attempt = await readStopSessionAttempts(context.harness, input.session_id);
  const decision = decideFollowUp(followUp, attempt);
  if (decision.action === 'none') {
    return {};
  }
  await writeStopSessionAttempts(context.harness, input.session_id, attempt + 1);
  return context.formatContinuation(decision.message);
}
