import { resolve } from 'node:path';

import { executeQualityGateForCwd, toolOutput } from '../quality-gate-run/quality-gate-run.js';
import type { RegisterQualityGateOptions } from '../quality-gate-run/quality-gate-run.types.js';
import type { McpVerifyResult } from './mcp-verify.types.js';

export async function runMcpVerify(
  cwd: string,
  options: RegisterQualityGateOptions = {},
): Promise<McpVerifyResult> {
  const run = await executeQualityGateForCwd(resolve(cwd), options);
  const text = await toolOutput(run);
  if (run.kind !== 'ran') {
    return { text, isError: false };
  }
  return { text, isError: run.result.exitCode !== 0 };
}
