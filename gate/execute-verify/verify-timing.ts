import { getOptionalEnv } from '../read-env/read-env.js';
import { joinStreams } from '../../process/run-command/stream-utils.js';
import type { PhaseTimings, ToolRunResult, VerifyResult } from './execute-verify.js';

export const VERIFY_TIMING_ENV = 'AGENT_QUALITY_GATE_VERIFY_TIMING';

export function formatVerifyTiming(timings: PhaseTimings, totalMs: number): string {
  const lines = [`verify-timing: fallow-cycles=${String(timings.cyclesMs)}ms`];
  const parts = [
    ...(timings.boundariesMs === undefined
      ? []
      : [`fallow-boundaries=${String(timings.boundariesMs)}ms`]),
    ...(timings.lintMs === undefined ? [] : [`oxlint=${String(timings.lintMs)}ms`]),
    ...(timings.hygieneMs === undefined ? [] : [`fallow-hygiene=${String(timings.hygieneMs)}ms`]),
    ...(timings.complexityMs === undefined
      ? []
      : [`fallow-complexity=${String(timings.complexityMs)}ms`]),
    ...(timings.presetsMs === undefined ? [] : [`presets=${String(timings.presetsMs)}ms`]),
  ];
  if (parts.length > 0) {
    lines.push(`verify-timing: ${parts.join(' ')}`);
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
