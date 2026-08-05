#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import packageJson from '../package.json' with { type: 'json' };
import { rejectUnexpectedArgument, reportCommandError } from '../src/command.js';
import { AGENT_GUIDE_NAME, renderAgentGuide } from '../src/guide/agent-guide.js';
import { readAgentQualityGateConfig } from '../src/verify/config/agent-quality-gate-config.js';

function main(): number {
  if (rejectUnexpectedArgument('generate-agent-guide')) {
    return 2;
  }

  const cwd = process.cwd();
  try {
    const projectConfig = readAgentQualityGateConfig(cwd);
    writeFileSync(
      join(cwd, AGENT_GUIDE_NAME),
      renderAgentGuide(projectConfig, packageJson.version),
      'utf8'
    );
  } catch (error) {
    reportCommandError('generate-agent-guide', error instanceof Error ? error : String(error));
    return 2;
  }
  process.stdout.write(`generate-agent-guide: wrote ${AGENT_GUIDE_NAME}\n`);
  return 0;
}

process.exitCode = main();
