import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile } from '../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  decideFollowUp,
  followUpForSettledResult,
  QUALITY_GATE_FOLLOW_UP_BUDGET,
  VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES,
  VERIFY_FAILURE_LOG_RELATIVE_PATH,
} from '../quality-gate-run/quality-gate-run.js';
import { readFixture } from '../../tests/support/fixture-files.js';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'quality-gate-follow-up');
const baseFollowUp = (await readFixture(FIXTURES_ROOT, 'base.txt')).trimEnd();

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('decideFollowUp', () => {
  it('returns none when there is no follow-up message', () => {
    expect(decideFollowUp(undefined, 0)).toEqual({ action: 'none' });
  });

  it('continues for early attempts within the budget', () => {
    expect(decideFollowUp(baseFollowUp, 0)).toEqual({
      action: 'continue',
      message: baseFollowUp,
    });
    expect(decideFollowUp(baseFollowUp, 1)).toEqual({
      action: 'continue',
      message: baseFollowUp,
    });
  });

  it('escalates on the final allowed attempt', () => {
    const decision = decideFollowUp(baseFollowUp, QUALITY_GATE_FOLLOW_UP_BUDGET - 1);
    expect(decision.action).toBe('escalate');
    if (decision.action === 'none') {
      throw new Error('expected escalate');
    }
    expect(decision.message).toContain(baseFollowUp);
    expect(decision.message).toContain(
      'Retry budget exhausted. Stop and report the blocker to the user.',
    );
  });

  it('returns none once the budget is exhausted', () => {
    expect(decideFollowUp(baseFollowUp, QUALITY_GATE_FOLLOW_UP_BUDGET)).toEqual({ action: 'none' });
    expect(decideFollowUp(baseFollowUp, QUALITY_GATE_FOLLOW_UP_BUDGET + 1)).toEqual({
      action: 'none',
    });
  });
});

describe('followUpForSettledResult hints', () => {
  it('annotates live UI surface diagnostics with one cleanup hint', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-live-ui-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'live-ui-surface.txt'),
        stderr: '',
      },
    });
    expect(message).toContain('hint:live-ui-surface');
    expect(message?.match(/hint:live-ui-surface/g)?.length).toBe(1);
  });

  it('annotates presentation-duplication with one extraction hint and keeps the generic duplication hint distinct', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-presentation-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: [
          await readFixture(FIXTURES_ROOT, 'presentation-duplication.txt'),
          await readFixture(FIXTURES_ROOT, 'compact-fallow.txt'),
        ].join('\n'),
        stderr: '',
      },
    });
    expect(message).toContain(
      'hint:presentation-duplication — reuse the existing shared primitive at each call site with explicit props',
    );
    expect(message).toContain('hint:code-duplication — deduplicate the listed file ranges');
    expect(message?.match(/hint:presentation-duplication/g)?.length).toBe(1);
    expect(message).not.toContain(
      await readFixture(FIXTURES_ROOT, 'presentation-duplication-hint-repeat.txt'),
    );
  });

  it('annotates compact fallow codes with actionable fixes', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-hints-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'compact-fallow.txt'),
        stderr: '',
      },
    });
    expect(message).toContain(
      'hint:dev-dep-in-prod:node-pg-migrate — move "node-pg-migrate" from devDependencies to dependencies',
    );
    expect(message).toContain('hint:code-duplication — deduplicate the listed file ranges');
    expect(message).toContain('Do not investigate why the gate complains');
    expect(message).toContain(
      'Do not dig into prior verify fixes, agent transcripts, other chat sessions, or git history',
    );
  });

  it('annotates Playwright e2e diagnostics with one runner hint', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-playwright-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'playwright-e2e.txt'),
        stderr: '',
      },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message).toContain(
      'hint:playwright-e2e — use Playwright Test (tests/e2e/*.pw.ts, page fixture, webServer and baseURL in playwright.config.ts). For Postgres, follow the Playwright webServer note in scripts/playwright-web-server.ts.',
    );
    expect(message.match(/hint:playwright-e2e/g)?.length).toBe(1);
  });

  it('annotates database boundary diagnostics with the production-path-or-blocker hint once', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-database-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'database-boundaries.txt'),
        stderr: '',
      },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message).toContain(
      'hint:database-boundary - use an already production-reachable module for Arrange and observation; do not create or expand a DAO solely for a test; when no production path exists, stop and report the missing path as a blocker.',
    );
    expect(message.match(/hint:database-boundary/g)?.length).toBe(1);
    const remediationIndex = message.indexOf('Fix only the violations listed below');
    const hintIndex = message.indexOf('hint:database-boundary');
    const diagnosticIndex = message.indexOf('database/test-database-boundaries');
    expect(remediationIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeGreaterThan(-1);
    expect(diagnosticIndex).toBeGreaterThan(-1);
    expect(remediationIndex).toBeLessThan(hintIndex);
    expect(hintIndex).toBeLessThan(diagnosticIndex);
  });

  it('annotates committed migration diagnostics with a copy-into-new-file hint', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-committed-migration-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: '',
        stderr: await readFixture(FIXTURES_ROOT, 'committed-migration.txt'),
      },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message).toContain(
      'hint:database-committed-migration — edited migration files were restored; copy the change from .aqg/restored-migration.diff into a new migration.',
    );
    expect(message.match(/hint:database-committed-migration/g)?.length).toBe(1);
  });

  it('annotates handmade JSON diagnostics with one parse-example hint and writes the example file', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-handmade-json-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'handmade-json-types.txt'),
        stderr: '',
      },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message).toContain(
      'hint:bun-parse-handmade-json — to fix this, look at .aqg/parse_example.ts',
    );
    expect(message.match(/hint:bun-parse-handmade-json/g)?.length).toBe(1);
    const examplePath = join(projectRoot, '.aqg', 'parse_example.ts');
    expect(existsSync(examplePath)).toBe(true);
    const example = await readTextFile(examplePath);
    expect(example).toContain('Bun.file(path).json()');
    expect(example).toContain('v.safeParse');
    expect(example).toContain('v.InferOutput');
  });

  it('places remediation and hints before diagnostics', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-order-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'duplication.txt'),
        stderr: '',
      },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    const remediationIndex = message.indexOf('Fix only the violations listed below');
    const hintIndex = message.indexOf('hint:code-duplication');
    const diagnosticIndex = message.indexOf(
      'code-duplication:system/database/phases/phases.dao.ts',
    );
    expect(remediationIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeGreaterThan(-1);
    expect(diagnosticIndex).toBeGreaterThan(-1);
    expect(remediationIndex).toBeLessThan(hintIndex);
    expect(hintIndex).toBeLessThan(diagnosticIndex);
  });
});

describe('followUpForSettledResult diagnostic spill', () => {
  it('keeps short diagnostics in-band without writing a log file', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-short-');
    const diagnostics = Array.from(
      { length: VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES },
      (_, index) => `error line ${String(index + 1)}`,
    ).join('\n');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: { exitCode: 1, stdout: diagnostics, stderr: '' },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message).toContain('error line 1');
    expect(message).toContain(`error line ${String(VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES)}`);
    expect(message).not.toContain(VERIFY_FAILURE_LOG_RELATIVE_PATH);
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(false);
  });

  it('spills oversized diagnostics to .aqg log and keeps only the head in-band', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-spill-');
    const lineCount = VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES + 25;
    const diagnostics = Array.from(
      { length: lineCount },
      (_, index) => `error line ${String(index + 1)}`,
    ).join('\n');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: { exitCode: 1, stdout: diagnostics, stderr: '' },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }

    const logPath = join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH);
    expect(message).toContain(logPath);
    expect(message).toContain(String(lineCount));
    expect(message).toContain('error line 1');
    expect(message).toContain(`error line ${String(VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES)}`);
    expect(message).not.toContain(`error line ${String(VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES + 1)}`);

    const logged = await readTextFile(logPath);
    expect(logged.trimEnd()).toBe(diagnostics);
  });

  it('derives hints from the full diagnostics even when the matching lines are spilled', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-spill-hints-');
    const head = Array.from(
      { length: VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES },
      (_, index) => `noise ${String(index + 1)}`,
    );
    const diagnostics = [
      ...head,
      'code-duplication:system/database/phases/phases.dao.ts:15-23:fingerprint=dup:x,group=1,tokens=41,lines=9,instances=3',
      'Duplication (3.0%) exceeds threshold (0.1%)',
      'presentation-duplication:components/features/demo/field-a.tsx:10-18:fingerprint=jsx:abc,group=1,units=10,holes=2,score=20,occurrences=7',
      'tests/orders.test.ts:1:1: error database(test-database-boundaries): Import only useIsolatedTestDatabase from tests/setup/testDatabase.ts.',
    ].join('\n');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: { exitCode: 1, stdout: diagnostics, stderr: '' },
    });
    expect(message).toContain('hint:code-duplication — deduplicate the listed file ranges');
    expect(message).toContain(
      'hint:presentation-duplication — reuse the existing shared primitive at each call site with explicit props',
    );
    expect(message).toContain(
      'hint:database-boundary - use an already production-reachable module for Arrange and observation',
    );
    expect(message).not.toContain('Duplication (3.0%) exceeds threshold');
  });
});
