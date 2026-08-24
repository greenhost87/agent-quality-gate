import { getOptionalEnv } from '../read-env/read-env.js';
import { joinStreams } from '../../process/run-command/stream-utils.js';
import type { PhaseTimings, ToolRunResult, VerifyResult } from './execute-verify.types.js';

export const VERIFY_TIMING_ENV = 'AGENT_QUALITY_GATE_VERIFY_TIMING';

export function formatVerifyTiming(timings: PhaseTimings, totalMs: number): string {
  const lines = [`verify-timing: fallow-cycles=${String(timings.cyclesMs)}ms`];
  if (timings.parallelMs !== undefined) {
    const parts = [`verify-timing: parallel=${String(timings.parallelMs)}ms`];
    if (timings.oxlintMs !== undefined) {
      parts.push(`oxlint=${String(timings.oxlintMs)}ms`);
    }
    if (timings.skipHealthMs !== undefined) {
      parts.push(`fallow-skip-health=${String(timings.skipHealthMs)}ms`);
    }
    if (timings.complexityMs !== undefined) {
      parts.push(`fallow-complexity=${String(timings.complexityMs)}ms`);
    }
    if (timings.presetsMs !== undefined) {
      parts.push(`presets=${String(timings.presetsMs)}ms`);
    }
    lines.push(parts.join(' '));
  }
  lines.push(`verify-timing: total=${String(totalMs)}ms`);
  return `${lines.join('\n')}\n`;
}

export function withVerifyTiming(
  result: VerifyResult,
  timings: PhaseTimings,
  startedAt: number,
): VerifyResult {
  if (getOptionalEnv(VERIFY_TIMING_ENV) === undefined) {
    return result;
  }
  return {
    ...result,
    stderr: joinStreams([
      result.stderr,
      formatVerifyTiming(timings, Math.round(performance.now() - startedAt)),
    ]),
  };
}

export async function timedTool(run: () => Promise<ToolRunResult>): Promise<{
  result: ToolRunResult;
  ms: number;
}> {
  const startedAt = performance.now();
  const result = await run();
  return { result, ms: Math.round(performance.now() - startedAt) };
}
