import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';

import noDynamicImport from '../../oxlint/rules/no-dynamic-import.ts';

const RULE_ID = 'aqg/no-dynamic-import';
const ALLOWED_OPTIONS = [{ allowedFiles: ['src/instrumentation.ts'] }];

describe('no-dynamic-import', () => {
  it('allows only relative string-literal imports in exact configured files', () => {
    const result = replayCreateOnceRule({
      ruleId: RULE_ID,
      rule: noDynamicImport,
      cases: [
        {
          name: 'ordinary-file',
          cwd: '/project',
          filename: '/project/src/module.ts',
          options: ALLOWED_OPTIONS,
          code: "void import('./scheduler.ts');",
        },
        {
          name: 'allowed-relative-literal',
          cwd: '/project',
          filename: '/project/src/instrumentation.ts',
          options: ALLOWED_OPTIONS,
          code: "void import('./scheduler.ts'); void import('../shared.ts');",
        },
        {
          name: 'computed',
          cwd: '/project',
          filename: '/project/src/instrumentation.ts',
          options: ALLOWED_OPTIONS,
          code: "const path = './scheduler.ts'; void import(path);",
        },
        {
          name: 'package-specifier',
          cwd: '/project',
          filename: '/project/src/instrumentation.ts',
          options: ALLOWED_OPTIONS,
          code: "void import('scheduler-package');",
        },
        {
          name: 'suffix-is-not-exact-match',
          cwd: '/project',
          filename: '/project/nested/src/instrumentation.ts',
          options: ALLOWED_OPTIONS,
          code: "void import('./scheduler.ts');",
        },
        {
          name: 'no-options',
          cwd: '/project',
          filename: '/project/src/instrumentation.ts',
          code: "void import('./scheduler.ts');",
        },
      ],
    });

    expect(result.cases.map((item) => item.reports.length)).toEqual([1, 0, 1, 1, 1, 1]);
    expect(
      result.cases
        .flatMap((item) => item.reports)
        .every((report) => report.messageId === 'forbidden'),
    ).toBe(true);
  });
});
