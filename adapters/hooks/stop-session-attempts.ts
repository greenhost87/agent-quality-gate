import { createHash } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { agentQualityGateHome } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { pathExists, readTextFile, writeTextFile } from '../../process/files/files.js';
import type { StopSessionHarness } from './stop-session-attempts.types.js';

function sessionAttemptPath(harness: StopSessionHarness, sessionId: string): string {
  const id = createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return join(agentQualityGateHome(), harness, 'stop-attempts', id);
}

export async function readStopSessionAttempts(
  harness: StopSessionHarness,
  sessionId: string,
): Promise<number> {
  try {
    const path = sessionAttemptPath(harness, sessionId);
    if (!(await pathExists(path))) {
      return 0;
    }
    const parsed = Number((await readTextFile(path)).trim());
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function writeStopSessionAttempts(
  harness: StopSessionHarness,
  sessionId: string,
  attempts: number,
): Promise<void> {
  const path = sessionAttemptPath(harness, sessionId);
  mkdirSync(dirname(path), { recursive: true });
  await writeTextFile(path, `${String(attempts)}\n`);
}

export function resetStopSessionAttempts(harness: StopSessionHarness, sessionId: string): void {
  rmSync(sessionAttemptPath(harness, sessionId), { force: true });
}
