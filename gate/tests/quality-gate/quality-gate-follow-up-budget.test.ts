import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile, writeTextFile } from '../../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  decideFollowUp,
  followUpForSettledResult,
  QUALITY_GATE_FOLLOW_UP_BUDGET,
  VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES,
  VERIFY_FAILURE_LOG_RELATIVE_PATH,
} from '../../quality-gate-run/quality-gate-run.js';
import { readFixture } from '../../../tests/support/fixture-files.js';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '../..', '.quality-fixtures', 'quality-gate-follow-up');
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
  const hintCases: {
    name: string;
    hint: string;
    extraHints?: readonly string[];
    stdoutFixture?: string;
    stderrFixture?: string;
    extraStdoutFixtures?: readonly string[];
  }[] = [
    { name: 'live-ui-surface', hint: 'hint:live-ui-surface', stdoutFixture: 'live-ui-surface.txt' },
    {
      name: 'presentation-duplication',
      hint: 'hint:presentation-duplication',
      stdoutFixture: 'presentation-duplication.txt',
      extraStdoutFixtures: ['compact-fallow.txt'],
    },
    { name: 'compact-fallow', hint: 'hint:code-duplication', stdoutFixture: 'compact-fallow.txt' },
    { name: 'playwright-e2e', hint: 'hint:playwright-e2e', stdoutFixture: 'playwright-e2e.txt' },
    {
      name: 'database-boundary',
      hint: 'hint:database-boundary',
      stdoutFixture: 'database-boundaries.txt',
    },
    {
      name: 'committed-migration',
      hint: 'hint:database-committed-migration',
      stderrFixture: 'committed-migration.txt',
    },
    {
      name: 'handmade-json',
      hint: 'hint:bun-parse-json',
      stdoutFixture: 'handmade-json-types.txt',
      extraStdoutFixtures: ['raw-json-parse.txt'],
    },
    {
      name: 'raw-json-parse',
      hint: 'hint:bun-parse-json',
      stdoutFixture: 'raw-json-parse.txt',
    },
    {
      name: 'typeof-object',
      hint: 'hint:bun-parse-json',
      stdoutFixture: 'typeof-object.txt',
    },
    {
      name: 'single-consumer',
      hint: 'hint:single-consumer',
      extraHints: ['hint:avoid-micro-splits'],
      stdoutFixture: 'single-consumer.txt',
    },
    {
      name: 'thin-forwarders',
      hint: 'hint:avoid-micro-splits',
      stdoutFixture: 'thin-forwarders.txt',
    },
    {
      name: 'trivial-const-wrappers',
      hint: 'hint:avoid-micro-splits',
      stdoutFixture: 'trivial-const-wrappers.txt',
    },
  ];

  for (const hintCase of hintCases) {
    it(`emits ${hintCase.hint} once for ${hintCase.name}`, async () => {
      const projectRoot = await makeTempDirectory(`aqg-follow-up-${hintCase.name}-`);
      const stdoutParts: string[] = [];
      if (hintCase.stdoutFixture !== undefined) {
        stdoutParts.push(await readFixture(FIXTURES_ROOT, hintCase.stdoutFixture));
      }
      for (const extra of hintCase.extraStdoutFixtures ?? []) {
        stdoutParts.push(await readFixture(FIXTURES_ROOT, extra));
      }
      const message = await followUpForSettledResult({
        kind: 'ran',
        projectRoot,
        result: {
          exitCode: 1,
          stdout: stdoutParts.join('\n'),
          stderr:
            hintCase.stderrFixture === undefined
              ? ''
              : await readFixture(FIXTURES_ROOT, hintCase.stderrFixture),
        },
      });
      if (message === undefined) {
        throw new Error('expected follow-up message');
      }
      expect(message).toContain(hintCase.hint);
      for (const extraHint of hintCase.extraHints ?? []) {
        expect(message).toContain(extraHint);
      }
      const escaped = hintCase.hint.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      expect(message.match(new RegExp(escaped, 'g'))?.length).toBe(1);
    });
  }

  it('writes the unified bun-parse hint and removes the legacy example for handmade JSON', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-handmade-json-file-');
    const legacyExamplePath = join(projectRoot, '.aqg', 'parse_example.ts');
    await mkdir(join(projectRoot, '.aqg'), { recursive: true });
    await writeTextFile(legacyExamplePath, 'legacy example');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'handmade-json-types.txt'),
        stderr: '',
      },
    });
    expect(message).toContain('hint:bun-parse-json');
    expect(message).not.toContain('hint:bun-parse-handmade-json');
    expect(existsSync(legacyExamplePath)).toBe(false);
    const hintPath = join(projectRoot, '.aqg', 'hints', 'bun-parse-json.md');
    const body = await readTextFile(hintPath);
    expect(body).toContain('Replace handmade JSON types');
    expect(body).toContain('Bun.file(path).json()');
    expect(body).toContain('v.safeParse');
  });

  it('ignores legacy parse example cleanup failures', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-handmade-json-cleanup-');
    const legacyExamplePath = join(projectRoot, '.aqg', 'parse_example.ts');
    await mkdir(legacyExamplePath, { recursive: true });
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'handmade-json-types.txt'),
        stderr: '',
      },
    });
    expect(message).toContain('hint:bun-parse-json');
    expect(existsSync(legacyExamplePath)).toBe(true);
  });

  it('writes the bun-parse-json hint when raw JSON diagnostics appear', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-raw-json-hint-');
    await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'raw-json-parse.txt'),
        stderr: '',
      },
    });
    const hintPath = join(projectRoot, '.aqg', 'hints', 'bun-parse-json.md');
    expect(existsSync(hintPath)).toBe(true);
    const body = await readTextFile(hintPath);
    expect(body).toContain('Do not scan transcripts');
    expect(body).toContain('Fix typeof / Array.isArray');
    expect(body).toContain('Bun.file(path).json()');
    expect(body).toContain('v.parseJson');
    expect(body).toContain("'use client'");
  });

  it('writes hint markdown docs for compact hints', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-hint-docs-');
    await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        stdout: await readFixture(FIXTURES_ROOT, 'database-boundaries.txt'),
        stderr: '',
      },
    });
    const hintPath = join(projectRoot, '.aqg', 'hints', 'database-boundary.md');
    expect(existsSync(hintPath)).toBe(true);
    const body = await readTextFile(hintPath);
    expect(body).toContain('production-reachable');
    expect(body).toContain('database-examples.md');
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
    expect(message).toContain('hint:code-duplication');
    expect(message).toContain('hint:presentation-duplication');
    expect(message).toContain('hint:database-boundary');
    expect(message).not.toContain('Duplication (3.0%) exceeds threshold');
  });
});
