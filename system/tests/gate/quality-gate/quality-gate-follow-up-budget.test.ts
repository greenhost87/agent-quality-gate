import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readTextFile, writeTextFile } from '#system/process/files/files.ts';

import { describe, expect, it } from 'bun:test';

import {
  decideFollowUp,
  followUpForSettledResult,
} from '#system/gate/quality-gate-run/quality-gate-run.ts';
import { QUALITY_GATE_FOLLOW_UP_BUDGET } from '#system/config/tuning/tuning.ts';
import { readFixture } from '#system/tests/support/fixture-files.ts';
import {
  FIXTURES_ROOT,
  baseFollowUp,
  diagnosticsFromHintFixture,
  makeTempDirectory,
} from './quality-gate-follow-up-support.js';

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

async function expectHintFile(
  projectRoot: string,
  id: string,
  snippets: readonly string[],
): Promise<void> {
  const hintPath = join(projectRoot, '.aqg', 'hints', `${id}.md`);
  expect(existsSync(hintPath)).toBe(true);
  const body = await readTextFile(hintPath);
  for (const snippet of snippets) {
    expect(body).toContain(snippet);
  }
}

async function runHintFixture(
  projectRoot: string,
  name: string,
  fixture: string,
): Promise<string | undefined> {
  return await followUpForSettledResult({
    kind: 'ran',
    projectRoot,
    result: {
      exitCode: 1,
      diagnostics: diagnosticsFromHintFixture(name, await readFixture(FIXTURES_ROOT, fixture)),
      hints:
        name === 'database-boundary'
          ? [
              {
                kind: 'document',
                id: 'database-boundary',
                owner: 'database',
                body: 'Use an already production-reachable module for Arrange and observation. Do not create or expand a DAO solely for a test. Keep query-result handling in the DAO and define empty-list semantics before dynamic SQL.',
              },
            ]
          : name === 'handmade-json' || name === 'raw-json-parse' || name === 'typeof-object'
            ? [
                {
                  kind: 'document',
                  id: 'bun-parse-json',
                  owner: 'bun-parse',
                  body: 'Use Valibot runtime schemas and infer TypeScript types from them. Parse JSON as unknown with safeParse; do not hand-roll recursive JSON types or use typeof checks to validate parsed values. Avoid raw JSON.parse and response.json() outside tests.',
                },
              ]
            : [{ kind: 'builtin', id: 'bun-parse-json' }],
    },
  });
}

describe.serial('followUpForSettledResult hints', () => {
  const hintCases: {
    name: string;
    hint: string;
    extraHints?: readonly string[];
    stdoutFixture?: string;
    stderrFixture?: string;
    extraStdoutFixtures?: readonly string[];
  }[] = [
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
      const fixtureText = [
        ...stdoutParts,
        ...(hintCase.stderrFixture === undefined
          ? []
          : [await readFixture(FIXTURES_ROOT, hintCase.stderrFixture)]),
      ].join('\n');
      const message = await followUpForSettledResult({
        kind: 'ran',
        projectRoot,
        result: {
          exitCode: 1,
          diagnostics: diagnosticsFromHintFixture(hintCase.name, fixtureText),
          hints: [{ kind: 'builtin', id: hintCase.hint.slice('hint:'.length) }],
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
    const message = await runHintFixture(projectRoot, 'handmade-json', 'handmade-json-types.txt');
    expect(message).toContain('hint:bun-parse-json');
    expect(message).not.toContain('hint:bun-parse-handmade-json');
    expect(existsSync(legacyExamplePath)).toBe(false);
    const hintPath = join(
      projectRoot,
      '.aqg',
      'hints',
      'presets',
      'bun-parse',
      'bun-parse-json.md',
    );
    const body = await readTextFile(hintPath);
    expect(body).toContain('Use Valibot runtime schemas');
    expect(body).toContain('infer TypeScript types');
    expect(body).toContain('safeParse');
  });

  it('ignores legacy parse example cleanup failures', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-handmade-json-cleanup-');
    const legacyExamplePath = join(projectRoot, '.aqg', 'parse_example.ts');
    await mkdir(legacyExamplePath, { recursive: true });
    const message = await runHintFixture(projectRoot, 'handmade-json', 'handmade-json-types.txt');
    expect(message).toContain('hint:bun-parse-json');
    expect(existsSync(legacyExamplePath)).toBe(true);
  });

  it('writes the bun-parse-json hint when raw JSON diagnostics appear', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-raw-json-hint-');
    await runHintFixture(projectRoot, 'raw-json-parse', 'raw-json-parse.txt');
    await expectHintFile(projectRoot, 'presets/bun-parse/bun-parse-json', [
      'Use Valibot runtime schemas',
      'safeParse',
      'Avoid raw JSON.parse',
    ]);
  });

  it('writes hint markdown docs for compact hints', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-hint-docs-');
    await runHintFixture(projectRoot, 'database-boundary', 'database-boundaries.txt');
    await expectHintFile(projectRoot, 'presets/database/database-boundary', [
      'production-reachable',
      'Do not create or expand a DAO solely for a test.',
    ]);
  });

  it('places remediation and hints before diagnostics', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-order-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [
          {
            source: 'fallow',
            ruleId: 'code-duplication',
            severity: 'error',
            message: 'duplicate block',
            location: { path: 'system/database/phases/phases.dao.ts', line: 15 },
            groupHeader: 'code-duplication',
          },
        ],
        hints: [{ kind: 'builtin', id: 'code-duplication' }],
      },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    const remediationIndex = message.indexOf('Fix only the violations listed below');
    const hintIndex = message.indexOf('hint:code-duplication');
    const diagnosticIndex = message.indexOf('code-duplication');
    expect(remediationIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeGreaterThan(-1);
    expect(diagnosticIndex).toBeGreaterThan(hintIndex);
    expect(remediationIndex).toBeLessThan(hintIndex);
  });
});
