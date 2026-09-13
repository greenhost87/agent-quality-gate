import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as v from 'valibot';

const measuredRuns = Number(process.argv[2] ?? '10');
const fixtureSize = Number(process.argv[3] ?? '10000');
const variants = process.argv.slice(4).map((argument) => {
  const separator = argument.indexOf('=');
  if (separator < 1) {
    throw new Error(`Invalid variant ${argument}; expected label=/absolute/path`);
  }
  return { label: argument.slice(0, separator), root: resolve(argument.slice(separator + 1)) };
});
if (!Number.isInteger(measuredRuns) || measuredRuns < 10 || variants.length < 2) {
  throw new Error(
    'Usage: ast-traversal-process-bench.ts <runs>=10+ <fixture-size> <label=/absolute/path> <label=/absolute/path> [...]',
  );
}

const workerRelativePath = 'scripts/oxlint-rule-bench/ast-traversal-bench-worker.ts';
type RawSample = {
  variant: string;
  run: number;
  processOrder: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  result: Record<string, number | null> | null;
};
const samples: RawSample[] = [];
const WorkerResultSchema = v.record(v.string(), v.nullable(v.number()));

for (let run = 1; run <= measuredRuns; run += 1) {
  const ordered = run % 2 === 1 ? variants : [...variants].reverse();
  for (const [processOrder, variant] of ordered.entries()) {
    const child = spawnSync(
      process.execPath,
      [`${variant.root}/${workerRelativePath}`, String(fixtureSize)],
      {
        cwd: variant.root,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    let result: Record<string, number | null> | null = null;
    if (child.status === 0) {
      try {
        result = v.parse(
          v.pipe(v.string(), v.parseJson(), WorkerResultSchema),
          child.stdout.trim(),
        );
      } catch {
        result = null;
      }
    }
    const sample: RawSample = {
      variant: variant.label,
      run,
      processOrder: processOrder + 1,
      exitCode: child.status,
      signal: child.signal,
      stderr: child.stderr,
      result,
    };
    samples.push(sample);
    console.log('raw %s', JSON.stringify(sample));
  }
}

const metrics = [
  'forEachAstChildTraversalMs',
  'singleWalkMs',
  'repeatedWalkMs',
  'coldIndexConstructionMs',
  'hotLookupMs',
] as const;

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const midpoint = Math.floor(sorted.length / 2);
  const upper = sorted[midpoint];
  if (upper === undefined || sorted.length % 2 === 1) {
    return upper ?? null;
  }
  const lower = sorted[midpoint - 1];
  return lower === undefined ? null : (lower + upper) / 2;
}

function percentile(sorted: readonly number[], percentileValue: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  return sorted[Math.ceil(percentileValue * sorted.length) - 1] ?? null;
}

for (const variant of variants) {
  const variantSamples = samples.filter((sample) => sample.variant === variant.label);
  const summary = Object.fromEntries(
    metrics.map((metric) => {
      const values = variantSamples
        .map((sample) => sample.result?.[metric])
        .filter((value): value is number => typeof value === 'number')
        .sort((left, right) => left - right);
      return [
        metric,
        {
          samples: values,
          median: median(values),
          p95: percentile(values, 0.95),
        },
      ];
    }),
  );
  console.log(
    'summary %s',
    JSON.stringify({
      variant: variant.label,
      measuredProcesses: variantSamples.length,
      failures: variantSamples.filter((sample) => sample.exitCode !== 0 || sample.result === null)
        .length,
      metrics: summary,
    }),
  );
}

if (samples.some((sample) => sample.exitCode !== 0 || sample.result === null)) {
  process.exitCode = 1;
}
