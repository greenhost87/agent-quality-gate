import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as v from 'valibot';

import {
  checkResultFromDiagnostics,
  emptyCheckResult,
  type CheckResult,
  type Diagnostic,
} from './check-result.js';
import type { ToolRunResult } from './execute-verify.js';
import { combinedDupesSectionFromToolRun } from './fallow/split-diagnostics.js';
import { FallowLineSchema } from './fallow/source-location.js';
import { isTestFilePath } from './test-file-path.js';

const CloneInstanceSchema = v.object({
  file: v.string(),
  start_line: FallowLineSchema,
  end_line: v.optional(FallowLineSchema),
});
const DupesSectionSchema = v.object({
  clone_groups: v.array(v.object({ instances: v.array(CloneInstanceSchema) })),
});

async function hasTestSources(directory: string, prefix = ''): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith('.') ||
      ['node_modules', 'dist', 'build', 'coverage', 'vendor', 'tmp'].includes(entry.name)
    ) {
      continue;
    }
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory() && (await hasTestSources(join(directory, entry.name), `${path}/`))) {
      return true;
    }
    if (entry.isFile() && /\.[cm]?[jt]sx?$/u.test(path) && isTestFilePath(path)) {
      return true;
    }
  }
  return false;
}

function copyDiagnostics(output: v.InferOutput<typeof DupesSectionSchema>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const group of output.clone_groups) {
    const production = group.instances.filter((instance) => !isTestFilePath(instance.file));
    if (production.length === 0) {
      continue;
    }
    for (const instance of group.instances) {
      if (!isTestFilePath(instance.file)) {
        continue;
      }
      const sources = production.map((source) => `${source.file}:${source.start_line}`).join(', ');
      const key = `${instance.file}:${instance.start_line}-${instance.end_line ?? '?'}:${sources}`;
      if (seen.has(key)) continue;
      seen.add(key);
      diagnostics.push({
        source: 'fallow',
        ruleId: 'test-production-copy',
        severity: 'error',
        message: `duplicates ${sources}; exercise production code instead of a test copy. Keep expected results independent.`,
        location: {
          path: instance.file,
          line: instance.start_line,
          ...(instance.end_line === undefined ? {} : { endLine: instance.end_line }),
        },
        related: production.map((source) => ({
          path: source.file,
          line: source.start_line,
          role: 'production-copy',
        })),
        groupHeader: 'test-production-copy',
      });
    }
  }
  return diagnostics.sort(
    (left, right) =>
      (left.location?.path ?? '').localeCompare(right.location?.path ?? '') ||
      (left.location?.line ?? 0) - (right.location?.line ?? 0),
  );
}

/**
 * Copies of production code in tests, filtered in-process from the dupes
 * section of the shared second launch (`production: false` scope, so test
 * sources participate exactly like the former dedicated `fallow dupes` run).
 * Skipped when the project has no test files. A missing or malformed
 * section is an infrastructure failure, never a pass.
 */
export async function checkTestProductionCopies(
  projectRoot: string,
  raw: ToolRunResult,
): Promise<CheckResult> {
  if (!(await hasTestSources(projectRoot))) {
    return emptyCheckResult();
  }
  const dupes = combinedDupesSectionFromToolRun(raw);
  if (dupes === undefined) {
    throw new Error('Fallow test-copy analysis returned an invalid dupes section');
  }
  const parsed = v.safeParse(DupesSectionSchema, dupes);
  if (!parsed.success) {
    throw new Error(
      `Fallow test-copy analysis returned an invalid dupes section: ${v.summarize(parsed.issues)}`,
    );
  }
  const diagnostics = copyDiagnostics(parsed.output);
  return checkResultFromDiagnostics(diagnostics, {
    hints: diagnostics.length > 0 ? [{ kind: 'builtin', id: 'code-duplication' }] : undefined,
  });
}
