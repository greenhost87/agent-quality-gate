import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { readTextFile, writeTextFile } from '../../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';
import { spawn } from 'bun';

import { YAML } from 'bun';

import { agentQualityGateHome } from '../../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { createEnv } from '../../read-env/read-env.js';
import { executeVerify } from '../../execute-verify/execute-verify.js';
import { runMcpVerify } from '../../mcp-verify/mcp-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import * as v from 'valibot';

const StatsRecordSchema = v.object({
  t: v.number(),
  r: v.union([v.literal(0), v.literal(1), v.literal(-1)]),
  ms: v.number(),
  path: v.string(),
  c: v.optional(v.number()),
  b: v.optional(v.number()),
  l: v.optional(v.number()),
  h: v.optional(v.number()),
  x: v.optional(v.number()),
  pr: v.optional(v.number()),
});
const StatsRecordJsonSchema = v.pipe(v.string(), v.parseJson(), StatsRecordSchema);
const FlatTimingSchema = v.object({
  c: v.number(),
  b: v.number(),
  l: v.number(),
  h: v.number(),
  x: v.number(),
  pr: v.number(),
});

const FIXTURES_ROOT = join(import.meta.dir, '../..', '.quality-fixtures', 'execute-verify');
const CONCURRENT_WORKER = join(
  import.meta.dir,
  '../..',
  '.quality-fixtures',
  'verify-run-stats',
  'concurrent-worker.ts',
);
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const tempDirectories: string[] = [];

useIsolatedAgentQualityGateHome();

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function createCleanProject(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'verify-run-stats-'));
  tempDirectories.push(cwd);
  await mkdir(join(cwd, 'src'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'verify-run-stats-fixture', private: true, type: 'module' })}\n`,
  );
  await writeTextFile(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        target: 'ES2022',
      },
      include: ['src/**/*.ts'],
    })}\n`,
  );
  await writeTextFile(
    join(cwd, 'src', 'index.ts'),
    await readTextFile(join(FIXTURES_ROOT, 'export-value', 'src', 'index.ts')),
  );
  return cwd;
}

async function waitForStatsRecord(
  projectRoot: string,
  timeoutMs = 2000,
): Promise<{
  output: v.InferOutput<typeof StatsRecordSchema>;
  raw: object;
}> {
  const statsPath = join(agentQualityGateHome(), 'stats', 'verify-runs.jsonl');
  const expectedRoot = resolve(projectRoot);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await readTextFile(statsPath);
      const records = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .flatMap((line) => {
          const rawResult = v.safeParse(v.pipe(v.string(), v.parseJson()), line);
          if (
            !rawResult.success ||
            rawResult.output == null ||
            typeof rawResult.output !== 'object'
          ) {
            return [];
          }
          const result = v.safeParse(StatsRecordSchema, rawResult.output);
          return result.success ? [{ output: result.output, raw: rawResult.output }] : [];
        })
        .filter(({ output }) => output.path === expectedRoot);
      const record = records[records.length - 1];
      if (record !== undefined) {
        return record;
      }
    } catch {
      // not written yet
    }
    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 10);
    });
  }
  throw new Error(`verify run stats for ${expectedRoot} were not written to ${statsPath}`);
}

describe('verify run stats', () => {
  it('appends a JSONL record after executeVerify without changing the result', async () => {
    const cwd = await createCleanProject();
    const before = Math.floor(Date.now() / 1000);

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^verify: ok \(\d+ms\)\n$/);

    const { output: record, raw } = await waitForStatsRecord(cwd);
    const after = Math.floor(Date.now() / 1000);
    expect(record.path).toBe(resolve(cwd));
    expect(record.r).toBe(0);
    expect(typeof record.t).toBe('number');
    expect(record.t).toBeGreaterThanOrEqual(before);
    expect(record.t).toBeLessThanOrEqual(after);
    expect(typeof record.ms).toBe('number');
    expect(record.ms).toBeGreaterThanOrEqual(0);
    const timings = v.parse(FlatTimingSchema, {
      c: record.c,
      b: record.b,
      l: record.l,
      h: record.h,
      x: record.x,
      pr: record.pr,
    });
    expect(timings.c).toBeGreaterThanOrEqual(0);
    expect(timings.b).toBeGreaterThanOrEqual(0);
    expect(timings.l).toBeGreaterThanOrEqual(0);
    expect(timings.h).toBeGreaterThanOrEqual(0);
    expect(timings.x).toBeGreaterThanOrEqual(0);
    expect(timings.pr).toBeGreaterThanOrEqual(0);
    expect(Object.hasOwn(raw, 'phases')).toBe(false);
    expect(Object.hasOwn(raw, 'ph')).toBe(false);
  });

  it('records early validation failures', async () => {
    const cwd = await createCleanProject();

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['/absolute/not-allowed.ts'],
    });

    expect(result.exitCode).toBe(2);

    const { output: record } = await waitForStatsRecord(cwd);
    expect(record.path).toBe(resolve(cwd));
    expect(record.r).toBe(1);
    expect(typeof record.ms).toBe('number');
    expect(record.c).toBeUndefined();
    expect(record.b).toBeUndefined();
    expect(record.l).toBeUndefined();
  });

  it('appends concurrently without losing or corrupting JSONL lines', async () => {
    const statsPath = join(agentQualityGateHome(), 'stats', 'verify-runs.jsonl');
    await mkdir(dirname(statsPath), { recursive: true });

    const seedCount = 8;
    const seedLines = Array.from({ length: seedCount }, (_, index) =>
      JSON.stringify({ t: 1, r: 0, ms: index, path: `/seed-${index}` }),
    ).join('\n');
    await writeTextFile(statsPath, `${seedLines}\n`);

    const workerCount = 32;
    const home = agentQualityGateHome();
    const children = Array.from({ length: workerCount }, (_, index) =>
      spawn(['bun', CONCURRENT_WORKER, String(index)], {
        cwd: REPO_ROOT,
        env: createEnv({ AGENT_QUALITY_GATE_HOME: home }),
        stderr: 'pipe',
        stdout: 'pipe',
      }),
    );

    const results = await Promise.all(
      children.map(async (child, index) => {
        const [exitCode, stderr] = await Promise.all([
          child.exited,
          new Response(child.stderr).text(),
        ]);
        return { exitCode, index, stderr };
      }),
    );

    for (const { exitCode, index, stderr } of results) {
      expect(exitCode, `worker ${index} stderr: ${stderr}`).toBe(0);
    }

    const content = await readTextFile(statsPath);
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    expect(lines).toHaveLength(seedCount + workerCount);

    const records = lines.flatMap((line) => {
      const result = v.safeParse(StatsRecordJsonSchema, line);
      return result.success ? [result.output] : [];
    });
    expect(records).toHaveLength(seedCount + workerCount);
    const paths = records.map((record) => record.path);
    expect(new Set(paths).size).toBe(paths.length);

    for (let index = 0; index < seedCount; index += 1) {
      expect(paths).toContain(`/seed-${index}`);
    }
    for (let index = 0; index < workerCount; index += 1) {
      expect(paths).toContain(`/worker-${index}`);
    }

    const workerLine = lines.find((line) => line.includes('"/worker-0"'));
    expect(workerLine).toBeDefined();
    if (workerLine === undefined) {
      return;
    }
    const tIndex = workerLine.indexOf('"t":');
    const rIndex = workerLine.indexOf('"r":');
    const msIndex = workerLine.indexOf('"ms":');
    const pathIndex = workerLine.indexOf('"path":');
    expect(tIndex).toBeLessThan(rIndex);
    expect(rIndex).toBeLessThan(msIndex);
    expect(msIndex).toBeLessThan(pathIndex);
  });

  it('records MCP verify for an unconfigured workspace', async () => {
    const cwd = await createCleanProject();
    const other = await createCleanProject();
    const configDir = await mkdtemp(join(tmpdir(), 'verify-run-stats-config-'));
    tempDirectories.push(configDir);
    const configPath = join(configDir, 'config.yaml');
    await writeTextFile(
      configPath,
      YAML.stringify({ projects: [{ root: other, entries: ['src/index.ts'] }] }, null, 2),
    );

    const result = await runMcpVerify(cwd, { configPath });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('No configured agent-quality-gate project');

    const { output: record } = await waitForStatsRecord(cwd);
    expect(record.path).toBe(resolve(cwd));
    expect(record.r).toBe(-1);
    expect(typeof record.t).toBe('number');
    expect(typeof record.ms).toBe('number');
    expect(record.ms).toBeGreaterThanOrEqual(0);
  });
});
