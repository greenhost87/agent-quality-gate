#!/usr/bin/env node

import { runDuplicateShapesStep } from '../../src/verify/duplicate-shapes.js';

try {
  process.exitCode = runDuplicateShapesStep(process.argv[2] ?? './tools/analyze/duplicate-shapes.config.json');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
