import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { agentQualityGateHome } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';

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
      ...(record.b === undefined ? {} : { b: record.b }),
      ...(record.l === undefined ? {} : { l: record.l }),
      ...(record.h === undefined ? {} : { h: record.h }),
      ...(record.x === undefined ? {} : { x: record.x }),
      ...(record.pr === undefined ? {} : { pr: record.pr }),
    });
    await appendFile(path, `${line}\n`, 'utf8');
  } catch {
    // Stats must never affect verify.
  }
}

export type VerifyRunStatsResult = 0 | 1 | -1;

/**
 * One JSONL line in `$AGENT_QUALITY_GATE_HOME/stats/verify-runs.jsonl`.
 * Flat compact keys: `{"t":1777,"r":0,"ms":942,"path":"/...","c":80,"b":120,"l":820,"h":170,"x":90,"pr":12}`.
 */
export type VerifyRunStatsRecord = {
  /** unix seconds */
  t: number;
  /** 0 ok, 1 fail, -1 skipped/unconfigured */
  r: VerifyRunStatsResult;
  /** total wall ms */
  ms: number;
  path: string;
  /** fallow cycle phase (Ф1) */
  c?: number;
  /** fallow boundary-violation phase (Ф2) */
  b?: number;
  /** oxlint run covering virtual phases Ф2+Ф3 */
  l?: number;
  /** fallow hygiene phase (Ф4) */
  h?: number;
  /** fallow `health --complexity` phase (Ф5) */
  x?: number;
  /** presets */
  pr?: number;
};
