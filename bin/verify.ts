#!/usr/bin/env bun

import { runVerifyCli } from '../src/verify/index.js';

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  process.exitCode = await runVerifyCli();
}
