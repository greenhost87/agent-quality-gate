import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { agentQualityGateHome } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import type { VerifyRunStatsRecord } from './verify-run-stats.types.js';

export function verifyRunStatsPath(): string {
  return join(agentQualityGateHome(), 'stats', 'verify-runs.jsonl');
}

/** Fire-and-forget: must not be awaited by verify. */
export function scheduleVerifyRunStats(record: VerifyRunStatsRecord): void {
  void writeVerifyRunStats(record);
}

async function writeVerifyRunStats(record: VerifyRunStatsRecord): Promise<void> {
  const path = verifyRunStatsPath();
  try {
    await mkdir(dirname(path), { recursive: true });
    const line = JSON.stringify({
      t: record.t,
      r: record.r,
      ms: record.ms,
      path: record.path,
      ...(record.c === undefined ? {} : { c: record.c }),
      ...(record.pl === undefined ? {} : { pl: record.pl }),
      ...(record.o === undefined ? {} : { o: record.o }),
      ...(record.sh === undefined ? {} : { sh: record.sh }),
      ...(record.cx === undefined ? {} : { cx: record.cx }),
      ...(record.pr === undefined ? {} : { pr: record.pr }),
    });
    await appendFile(path, `${line}\n`, 'utf8');
  } catch {
    // Stats must never affect verify.
  }
}
