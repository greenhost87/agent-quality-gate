#!/usr/bin/env bun

import { runAgentQualityGateCli } from '../src/launcher/cli.js';

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  process.exitCode = await runAgentQualityGateCli();
}
