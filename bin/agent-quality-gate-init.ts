#!/usr/bin/env bun

import { runAgentQualityGateInitCli } from '../src/init/cli.js';

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  process.exitCode = await runAgentQualityGateInitCli();
}
