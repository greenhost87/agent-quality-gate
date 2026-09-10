import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as v from 'valibot';

import { fallowConfigPathForProject } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { readFallowConfigFile } from '../../config/verify-config-files/verify-config-files.js';
import { writeTextIfChanged } from '../../process/files/files.js';
import {
  checkResultFromDiagnostics,
  emptyCheckResult,
  type CheckResult,
  type Diagnostic,
} from './check-result.js';
import { fallowToolRun } from './fallow-tool-run.js';
import { fallowProcessCrashResult } from './fallow-json-diagnostics.js';
import { FallowLineSchema } from './fallow-source-location.js';
import type { ToolRunner } from './execute-verify.js';

const TEST_PATH =
  /(?:^|\/)(?:test|tests|spec|specs|__tests__|e2e)(?:\/|$)|\.(?:test|spec|pw)\.[cm]?[jt]sx?$/u;
const CloneInstanceSchema = v.object({
  file: v.string(),
  start_line: FallowLineSchema,
  end_line: FallowLineSchema,
});
const DupesSchema = v.object({
  kind: v.literal('dupes'),
  clone_groups: v.array(v.object({ instances: v.array(CloneInstanceSchema) })),
});
const DupesTextSchema = v.pipe(v.string(), v.parseJson(), DupesSchema);
const DuplicatesConfigSchema = v.looseObject({ duplicates: v.optional(v.looseObject({}), {}) });

function testPath(path: string): boolean {
  return TEST_PATH.test(path.replaceAll('\\', '/'));
}

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
    if (entry.isFile() && /\.[cm]?[jt]sx?$/u.test(path) && testPath(path)) {
      return true;
    }
  }
  return false;
}

function copyDiagnostics(output: v.InferOutput<typeof DupesSchema>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const group of output.clone_groups) {
    const production = group.instances.filter((instance) => !testPath(instance.file));
    if (production.length === 0) {
      continue;
    }
    for (const instance of group.instances) {
      if (!testPath(instance.file)) {
        continue;
      }
      const sources = production.map((source) => `${source.file}:${source.start_line}`).join(', ');
      const key = `${instance.file}:${instance.start_line}-${instance.end_line}:${sources}`;
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
          endLine: instance.end_line,
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

export async function checkTestProductionCopies(
  run: ToolRunner,
  projectRoot: string,
  productionConfigPath: string,
): Promise<CheckResult> {
  if (!(await hasTestSources(projectRoot))) {
    return emptyCheckResult();
  }
  const base = await readFallowConfigFile(productionConfigPath, 'Fallow test-copy config');
  const { duplicates } = v.parse(DuplicatesConfigSchema, base);
  const configPath = fallowConfigPathForProject(projectRoot);
  const outputPath = `${configPath}.output.json`;
  try {
    await writeTextIfChanged(
      configPath,
      `${JSON.stringify({
        ...base,
        production: false,
        duplicates: { ...duplicates, ignoreDefaults: false },
      })}\n`,
    );
    const result = await run(
      fallowToolRun(projectRoot, configPath, ['dupes', '--output-file', outputPath], 'json'),
    );
    const crash = fallowProcessCrashResult(result, 'fallow dupes failed');
    if (crash !== undefined) return crash;
    const parsed = v.safeParse(DupesTextSchema, await readFile(outputPath, 'utf8'));
    if (!parsed.success) {
      throw new Error(
        `Fallow test-copy analysis returned invalid JSON output: ${v.summarize(parsed.issues)} ${result.stderr}`,
      );
    }
    const diagnostics = copyDiagnostics(parsed.output);
    return checkResultFromDiagnostics(diagnostics, {
      hints: diagnostics.length > 0 ? [{ kind: 'builtin', id: 'code-duplication' }] : undefined,
    });
  } finally {
    await Promise.all([rm(configPath, { force: true }), rm(outputPath, { force: true })]);
  }
}
